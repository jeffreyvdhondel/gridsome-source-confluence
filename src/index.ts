import { IConfig, SpacesType, ISpaces, ContentResponse, AttachmentResponse, IAttachment } from "./interface/confluence";
import { Store } from "./interface/gridsome";

import Confluence from "./services/confluence";

import { AxiosResponse } from "axios";
import { nanoid } from "nanoid";

import htmlParser from "node-html-parser";
import slugify from "slugify";
import fs from "fs";
import path from "path";

class ConfluenceSource {
  confluence!: Confluence;
  config: IConfig;

  //FIXME !
  gridsomeStore!: Store;
  spaces!: ISpaces[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(gridsomeAPI: any, config: IConfig) {
    this.config = config;

    gridsomeAPI.loadSource(async (action: Store) => {
      //Validate config
      if (!(await this.validateConfig())) {
        return;
      }

      this.confluence = new Confluence(config);

      this.log("Retrieving data.");
      this.gridsomeStore = action;

      //Empty out static folder
      fs.existsSync(`./static/images/confluence`) && fs.rmSync(`./static/images/confluence/`, { recursive: true, force: true });

      await this.getSpaces(config.space_key);

      //Create collection
      action.addCollection(this.getTypeName("Home"));
      action.addCollection(this.getTypeName("Parent"));
      action.addCollection(this.getTypeName("Child"));

      await this.getHomepage();
      await this.getParentPages();
      await this.getChildPages();

      await this.setSlugs();

      if (this.config.download_images) {
        await this.createDownloadLinks();
        await this.downloadAttachments();
      }

      await this.alterBody();

      await this.createNodes();

      this.log("Retrieval of data is done!");
    });
  }

  async validateConfig(): Promise<boolean> {
    if (!this.config.base_url) {
      console.error("[Confluence]", "Missing the `baseUrl` option");
      return false;
    }
    if (!this.config.public_only && (!this.config.username || !this.config.password)) {
      console.error("[Confluence]", "When public_only is disabled you need to add a username/password");
      return false;
    }
    return true;
  }

  async getSpaces(spaces?: string) {
    this.log("Get Spaces");
    let returnSpaces: ISpaces[] = [];

    if (spaces) {
      let spaceArray = spaces.split(",");
      if (spaceArray.length === 0) {
        spaceArray = [spaces];
      }
      const axiosResponse = spaceArray.map((space) => this.confluence.GetSpace(space));

      await Promise.all(axiosResponse).then((res) => {
        res.forEach((response) => {
          returnSpaces.push({
            key: response.data.key,
            content_id: response.data.homepage.id,
            title: response.data.homepage.title,
            pages: [],
            attachments: [],
          });
        });
      });
    } else {
      returnSpaces = await this.confluence.GetSpaces().then((res) => {
        return res.data.results
          .filter((x) => {
            return x.type === SpacesType.GLOBAL;
          })
          .map((el) => {
            return {
              key: el.key,
              content_id: el.homepage.id,
              title: el.homepage.title,
              pages: [],
              attachments: [],
            };
          });
      });
    }
    this.spaces = returnSpaces;
  }

  async getHomepage() {
    this.log("Get Homepage");
    const axiosResponse = this.spaces.map((space) => {
      return this.confluence.GetContentById(space.content_id);
    });

    return Promise.all(axiosResponse).then((res) => {
      res.forEach((el) => {
        this.log(`Homepage: ${el.data.title}`);
        //Add ids so we can use them in childpage step
        const spaceIndex = this.spaces.findIndex((space) => space.key === el.data.space.key);

        this.spaces[spaceIndex].pages.push({
          id: el.data.id,
          homepage: true,
          space: el.data.space.key,
          title: el.data.title,
          body: el.data.body.view.value,
          position: el.data.extensions.position,
          labels: el.data.metadata.labels.results.map((label) => label.name),
        });
      });
    });
  }

  async getParentPages() {
    this.log("Get ParentPages");
    const axiosResponse = this.spaces.map((space) => {
      return this.confluence.GetContentChildPage(space.content_id);
    });

    return Promise.all(axiosResponse).then((res) => {
      res.forEach((el) => {
        el.data.results.forEach(async (res) => {
          this.log(`Parent Page: ${res.title}`);
          //Add ids so we can use them in childpage step
          const spaceIndex = this.spaces.findIndex((space) => space.key === res.space.key);

          this.spaces[spaceIndex].pages.push({
            id: res.id,
            space: res.space.key,
            title: res.title,
            body: res.body.view.value,
            position: res.extensions.position,
            labels: res.metadata.labels.results.map((label) => label.name),
          });
        });
      });
    });
  }

  async getChildPages() {
    //This needs to be fixed because we need to keep getting the childs until there is a empty array as response
    this.log("Get ChildPages");

    const axiosResponse: Promise<AxiosResponse<ContentResponse>>[] = [];

    let pages: string[] = [];

    //init kick off
    this.spaces.map((space) => {
      space.pages.map((page) => {
        pages.push(page.id);
      });
    });

    while (pages.length !== 0) {
      //loop trough pages and fill the axiosReponse
      pages.forEach((page) => axiosResponse.push(this.confluence.GetContentChildPage(page)));

      await Promise.all(axiosResponse).then((res) => {
        pages = [];

        res.forEach((el) => {
          el.data.results.forEach((res) => {
            const parentPageId = el.config.url?.replace(/\D/g, "") as string;
            const spaceIndex = this.spaces.findIndex((space) => space.key === res.space.key);

            //Check if the id is not found
            if (!this.spaces[spaceIndex].pages.find((page) => page.id === res.id)) {
              this.spaces[spaceIndex].pages.push({
                id: res.id,
                space: res.space.key,
                title: res.title,
                body: res.body.view.value,
                parent_page: parentPageId,
                position: res.extensions.position,
                labels: res.metadata.labels.results.map((label) => label.name),
              });
              //Fill the array with new ids because there can be more childs
              pages.push(res.id);
            }
          });
        });
      });
    }
  }

  async alterBody() {
    this.log("Alter Body");
    this.spaces.forEach((space) => {
      space.pages.forEach((page) => {
        const htmlRoot = htmlParser(page.body);
        htmlRoot.querySelectorAll("a").forEach((a) => {
          //Internal urls
          if (a.getAttribute("data-linked-resource-type") == "page") {
            const contentId = a.getAttribute("data-linked-resource-id");
            if (contentId) {
              const slug = this.createSlug(space.key, contentId);
              a.replaceWith(`<a href="${slug}/">${a.text}</a>`);
            }
            //External urls
          } else if (a.getAttribute("class") == "external-link") {
            a.setAttribute("target", `_blank`);
          }
        });

        //Create description
        const querySelectP = htmlRoot.querySelector("p");
        if (querySelectP && querySelectP.rawText) {
          page.description = querySelectP.rawText.substr(0, 200);
        }

        //Create anchor
        const headers = htmlRoot.querySelectorAll("h1,h2,h3,h4,h5,h6");
        page.anchor = headers.map((header, headerIndex) => {
          const anchorSlug = slugify(header.rawText, { trim: true, lower: true, remove: /[*+~./()'"!?:@]/g });
          header.setAttribute("id", anchorSlug);
          return {
            title: header.rawText,
            position: headerIndex,
            anchor: anchorSlug,
            heading_size: header.tagName,
          };
        });

        //Replace images
        htmlRoot.querySelectorAll("img").forEach((img) => {
          if (img.hasAttribute("data-media-id")) {
            const attachmentIndex = space.attachments.findIndex((att) => att.id === img.getAttribute("data-media-id"));
            if (attachmentIndex != -1) {
              img.replaceWith(`<img src="${space.attachments[attachmentIndex].path}">`);
            }
          }
          //Fix emoji
          if (img.hasAttribute("data-emoji-id")) {
            const path = img.getAttribute("src");
            img.setAttribute("src", `${this.config.base_url}${path}`);
          }
        });

        page.body = `<div>${htmlRoot.toString()}</div>`;
      });
    });
  }

  async createDownloadLinks() {
    this.log("Creating Download Links");
    const axiosResponse: Promise<AxiosResponse<AttachmentResponse>>[] = [];
    this.spaces.forEach((space) => {
      //Check if path exists if not create it
      !fs.existsSync(`./static/images/confluence/${space.key}`) && fs.mkdirSync(`./static/images/confluence/${space.key}`, { recursive: true });
      space.pages.forEach((page) => {
        axiosResponse.push(this.confluence.GetContentChildAttachment(page.id));
      });
    });

    await Promise.all(axiosResponse).then((res) => {
      res.forEach((attachments) => {
        attachments.data.results.forEach(async (attachment) => {
          const fileName = nanoid(10);
          const fileExtension = path.parse(attachment.title).ext.toLowerCase();
          if (
            fileExtension.includes(".jpeg") ||
            fileExtension.includes(".jpg") ||
            fileExtension.includes(".png") ||
            fileExtension.includes(".svg") ||
            fileExtension.includes(".gif")
          ) {
            //Only download images
            if (!fileExtension) {
              //Try to guesse the file type based on mimetype
              return;
            }
            const spaceIndex = this.spaces.findIndex((space) => space.key === attachment.space.key);
            const contentId = attachments.config.url?.replace(/\D/g, "") as string;

            this.spaces[spaceIndex].attachments.push({
              id: attachment.extensions.fileId,
              space_key: attachment.space.key,
              file_name: `${fileName}${fileExtension}`,
              content_id: contentId,
              file_size: attachment.extensions.fileSize,
              downloaded: false,
              path: `/images/confluence/${attachment.space.key}/${fileName}${fileExtension}`,
              download_link: attachment._links.download,
            });
          }
        });
      });
    });
  }

  async downloadAttachments() {
    this.log("Downloading Attachments");
    let attachments: IAttachment[] = [];

    //Init kick off
    this.spaces.forEach((space) =>
      space.attachments.forEach((attachment) => {
        if (!attachment.downloaded) {
          attachments.push(attachment);
        }
      })
    );

    let batch = 1;
    while (attachments.length !== 0) {
      const axiosResponse: Promise<AxiosResponse | null>[] = [];
      let count = 0;
      attachments.every((attachment) => {
        count++;
        if (!attachment.downloaded) {
          axiosResponse.push(this.confluence.GetAttachment(attachment.download_link));
        }
        if (count === 100) {
          return;
        } else {
          return true;
        }
      });

      if (batch) {
        this.log(`Downloading batch ${batch} still needs a total of ${attachments.length} attachments`);
      }

      await Promise.all(axiosResponse).then(async (attachmentsResponse) => {
        for await (const attachmentResponse of attachmentsResponse) {
          if (attachmentResponse) {
            const attachmentIndex = attachments.findIndex((x) => `/wiki${x.download_link}` === attachmentResponse.config.url);
            const filePath = path.resolve(`./static/images/confluence/${attachments[attachmentIndex].space_key}`, `${attachments[attachmentIndex].file_name}`);

            //Write file await until ready
            await new Promise((resolve, reject) => {
              const stream = fs.createWriteStream(filePath);
              attachmentResponse.data.pipe(stream);
              stream.on("finish", resolve);
              stream.on("error", reject);
            });

            attachments[attachmentIndex].downloaded = true;
          }
        }
      });

      attachments = [];

      this.spaces.forEach((space) =>
        space.attachments.forEach((attachment) => {
          if (!attachment.downloaded) {
            attachments.push(attachment);
          }
        })
      );
      batch++;
    }
  }

  async setSlugs() {
    this.log("Set Slugs");
    this.spaces.forEach((space) => {
      space.pages.forEach((page) => {
        page.slug = this.createSlug(space.key, page.id);
      });
    });
  }

  createSlug(spaceKey: string, pageId: string): string {
    const spaceIndex = this.spaces.findIndex((space) => space.key === spaceKey);
    let id = pageId;
    let slug = "";
    let done = false;

    while (!done) {
      const page = this.spaces[spaceIndex].pages.filter((page) => page.id == id);
      if (page.length === 1) {
        slug = `/${slugify(page[0].title, { trim: true, lower: true, remove: /[*+~./()'"!?:@]/g })}${slug}`;
        if (page[0].parent_page) {
          id = page[0].parent_page;
          continue;
        }
        done = true;
      } else {
        done = true;
      }
    }
    return slug;
  }

  getTypeName(name: string) {
    const prefix = this.config.prefix || "Confluence";
    return `${prefix}${name}`;
  }

  log(message: string) {
    if (this.config.debug) {
      console.log("[Confluence]", message);
    }
  }

  async createNodes() {
    this.log("CreateNodes");
    this.spaces.forEach((space) => {
      space.pages.forEach((page) => {
        if (page.parent_page) {
          //ChildPage
          const childCollection = this.gridsomeStore.getCollection(this.getTypeName("Child"));
          childCollection.addNode({
            ...page,
          });
        } else if (page.homepage) {
          //HomePage
          const homeCollection = this.gridsomeStore.getCollection(this.getTypeName("Home"));
          homeCollection.addNode({
            ...page,
          });
        } else {
          //ParentPage
          const parentCollection = this.gridsomeStore.getCollection(this.getTypeName("Parent"));
          parentCollection.addNode({
            ...page,
          });
        }
      });
    });
  }
}

module.exports = ConfluenceSource;
