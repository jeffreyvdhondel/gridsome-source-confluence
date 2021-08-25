"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const confluence_1 = require("./interface/confluence");
const confluence_2 = __importDefault(require("./services/confluence"));
const nanoid_1 = require("nanoid");
const node_html_parser_1 = __importDefault(require("node-html-parser"));
const slugify_1 = __importDefault(require("slugify"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class ConfluenceSource {
    constructor(gridsomeAPI, config) {
        this.config = config;
        gridsomeAPI.loadSource(async (action) => {
            if (!(await this.validateConfig())) {
                return;
            }
            this.confluence = new confluence_2.default(config);
            this.log("Retrieving data.");
            this.gridsomeStore = action;
            fs_1.default.existsSync(`./static/images/confluence`) && fs_1.default.rmSync(`./static/images/confluence/`, { recursive: true, force: true });
            await this.getSpaces(config.space_key);
            action.addCollection(this.getTypeName("Parent"));
            action.addCollection(this.getTypeName("Child"));
            await this.getParentPages();
            await this.getChildPages();
            await this.setSlugs();
            if (this.config.download_images) {
                await this.createDownloadLinks();
                await this.downloadAttachments();
            }
            await this.resolveLinks();
            await this.createNodes();
            this.log("Retrieval of data is done!");
        });
    }
    async validateConfig() {
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
    async getSpaces(spaces) {
        this.log("Get Spaces");
        let returnSpaces = [];
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
        }
        else {
            returnSpaces = await this.confluence.GetSpaces().then((res) => {
                return res.data.results
                    .filter((x) => {
                    return x.type === confluence_1.SpacesType.GLOBAL;
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
    async getParentPages() {
        this.log("Get ParentPages");
        const axiosResponse = this.spaces.map((space) => {
            return this.confluence.GetContentChildPage(space.content_id);
        });
        return Promise.all(axiosResponse).then((res) => {
            res.forEach((el) => {
                el.data.results.forEach(async (res) => {
                    this.log(`Parent Page: ${res.title}`);
                    const spaceIndex = this.spaces.findIndex((space) => space.key === res.space.key);
                    this.spaces[spaceIndex].pages.push({
                        id: res.id,
                        space: res.space.key,
                        title: res.title,
                        body: res.body.view.value,
                    });
                });
            });
        });
    }
    async getChildPages() {
        this.log("Get ChildPages");
        const axiosResponse = [];
        let pages = [];
        this.spaces.map((space) => {
            space.pages.map((page) => {
                pages.push(page.id);
            });
        });
        while (pages.length !== 0) {
            pages.forEach((page) => axiosResponse.push(this.confluence.GetContentChildPage(page)));
            await Promise.all(axiosResponse).then((res) => {
                pages = [];
                res.forEach((el) => {
                    el.data.results.forEach((res) => {
                        var _a;
                        const parentPageId = (_a = el.config.url) === null || _a === void 0 ? void 0 : _a.replace(/\D/g, "");
                        const spaceIndex = this.spaces.findIndex((space) => space.key === res.space.key);
                        if (!this.spaces[spaceIndex].pages.find((page) => page.id === res.id)) {
                            this.spaces[spaceIndex].pages.push({
                                id: res.id,
                                space: res.space.key,
                                title: res.title,
                                body: res.body.view.value,
                                parent_page: parentPageId,
                            });
                            pages.push(res.id);
                        }
                    });
                });
            });
        }
    }
    async resolveLinks() {
        this.log("Resolve Links");
        this.spaces.forEach((space) => {
            space.pages.forEach((page) => {
                const htmlRoot = node_html_parser_1.default(page.body);
                htmlRoot.querySelectorAll("a").forEach((a) => {
                    if (a.getAttribute("data-linked-resource-type") == "page") {
                        const contentId = a.getAttribute("data-linked-resource-id");
                        if (contentId) {
                            const slug = this.createSlug(space.key, contentId);
                            a.replaceWith(`<a href="${slug}/">${a.text}</a>`);
                        }
                    }
                });
                htmlRoot.querySelectorAll("img").forEach((img) => {
                    if (img.hasAttribute("data-media-id")) {
                        const attachmentIndex = space.attachments.findIndex((att) => att.id === img.getAttribute("data-media-id"));
                        if (attachmentIndex != -1) {
                            img.replaceWith(`<img src="${space.attachments[attachmentIndex].path}">`);
                        }
                    }
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
        const axiosResponse = [];
        this.spaces.forEach((space) => {
            !fs_1.default.existsSync(`./static/images/confluence/${space.key}`) && fs_1.default.mkdirSync(`./static/images/confluence/${space.key}`, { recursive: true });
            space.pages.forEach((page) => {
                axiosResponse.push(this.confluence.GetContentChildAttachment(page.id));
            });
        });
        await Promise.all(axiosResponse).then((res) => {
            res.forEach((attachments) => {
                attachments.data.results.forEach(async (attachment) => {
                    var _a;
                    const fileName = nanoid_1.nanoid(10);
                    const fileExtension = path_1.default.parse(attachment.title).ext.toLowerCase();
                    if (fileExtension.includes(".jpeg") ||
                        fileExtension.includes(".jpg") ||
                        fileExtension.includes(".png") ||
                        fileExtension.includes(".svg") ||
                        fileExtension.includes(".gif")) {
                        if (!fileExtension) {
                            console.log(fileName);
                            return;
                        }
                        const spaceIndex = this.spaces.findIndex((space) => space.key === attachment.space.key);
                        const contentId = (_a = attachments.config.url) === null || _a === void 0 ? void 0 : _a.replace(/\D/g, "");
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
        let attachments = [];
        this.spaces.forEach((space) => space.attachments.forEach((attachment) => {
            if (!attachment.downloaded) {
                attachments.push(attachment);
            }
        }));
        let batch = 1;
        while (attachments.length !== 0) {
            const axiosResponse = [];
            let count = 0;
            attachments.every((attachment) => {
                count++;
                if (!attachment.downloaded) {
                    axiosResponse.push(this.confluence.GetAttachment(attachment.download_link));
                }
                if (count === 100) {
                    return;
                }
                else {
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
                        const filePath = path_1.default.resolve(`./static/images/confluence/${attachments[attachmentIndex].space_key}`, `${attachments[attachmentIndex].file_name}`);
                        await new Promise((resolve, reject) => {
                            const stream = fs_1.default.createWriteStream(filePath);
                            attachmentResponse.data.pipe(stream);
                            stream.on("finish", resolve);
                            stream.on("error", reject);
                        });
                        attachments[attachmentIndex].downloaded = true;
                    }
                }
            });
            attachments = [];
            this.spaces.forEach((space) => space.attachments.forEach((attachment) => {
                if (!attachment.downloaded) {
                    attachments.push(attachment);
                }
            }));
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
    createSlug(spaceKey, pageId) {
        const spaceIndex = this.spaces.findIndex((space) => space.key === spaceKey);
        let id = pageId;
        let slug = "";
        let done = false;
        while (!done) {
            const page = this.spaces[spaceIndex].pages.filter((page) => page.id == id);
            if (page.length === 1) {
                slug = `/${slugify_1.default(page[0].title, { trim: true, lower: true, remove: /[*+~./()'"!?:@]/g })}${slug}`;
                if (page[0].parent_page) {
                    id = page[0].parent_page;
                    continue;
                }
                done = true;
            }
            else {
                done = true;
            }
        }
        return slug;
    }
    getTypeName(name) {
        const prefix = this.config.prefix || "Confluence";
        return `${prefix}${name}`;
    }
    log(message) {
        if (this.config.debug) {
            console.log("[Confluence]", message);
        }
    }
    async createNodes() {
        this.log("CreateNodes");
        this.spaces.forEach((space) => {
            space.pages.forEach((page) => {
                if (page.parent_page) {
                    const childCollection = this.gridsomeStore.getCollection(this.getTypeName("Child"));
                    childCollection.addNode({
                        ...page,
                    });
                }
                else {
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
