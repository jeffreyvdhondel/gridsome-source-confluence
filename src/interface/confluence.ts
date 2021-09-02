export interface IConfig {
  username: string;
  password: string;
  base_url: string;
  space_key?: string;
  prefix?: string;
  debug?: boolean;
  public_only?: boolean;
  rate_limit?: boolean;
  download_images?: boolean;
}

export interface SpacesResponse extends BaseResponse {
  results: Array<{
    id: number;
    key: string;
    name: string;
    type: SpacesType;
    status: Status;
    homepage: {
      id: string;
      type: SpacesType;
      status: Status;
      title: string;
    };
  }>;
}

export interface AttachmentResponse extends BaseResponse {
  results: Array<{
    id: string;
    status: Status;
    title: string;
    space: SpaceReponse;
    extensions: {
      mediaType: string;
      fileId: SpacesType;
      comment: string;
      fileSize: number;
    };
    _links: {
      download: string;
    };
  }>;
}
export interface SpaceReponse {
  id: number;
  key: string;
  name: string;
  type: SpacesType;
  status: Status;
  homepage: {
    id: string;
    type: SpacesType;
    status: Status;
    title: string;
  };
}

export interface ContentResponse extends BaseResponse {
  results: Array<{
    id: string;
    type: ContentType;
    status: Status;
    title: string;
    space: SpaceReponse;
    body: {
      view: {
        value: string;
      };
    };
    metadata: {
      labels: {
        results: [
          {
            prefix: string;
            name: string;
            id: string;
            label: string;
          }
        ];
      };
    };
    extensions: {
      position: number;
    };
  }>;
}

export interface ContentIdResponse {
  id: string;
  type: ContentType;
  status: Status;
  title: string;
  space: SpaceReponse;
  body: {
    view: {
      value: string;
    };
  };
  metadata: {
    labels: {
      results: [
        {
          prefix: string;
          name: string;
          id: string;
          label: string;
        }
      ];
    };
  };
  extensions: {
    position: number;
  };
}

interface BaseResponse {
  start: number;
  limit: number;
  size: number;
  _links: Links;
}

interface Links {
  base: string;
  context: string;
  self: string;
}

export interface ISpaces {
  key: string;
  content_id: string;
  title: string;
  pages: Array<{
    id: string;
    space: string;
    title: string;
    body: string;
    description: string;
    slug: string;
    homepage?: boolean;
    anchor: Array<IAnchor>;
    parent_page?: string;
    labels: Array<string>;
    position: number;
  }>;
  attachments: Array<IAttachment>;
}

export interface IPage {
  id: string;
  space: string;
  title: string;
  body: string;
  slug?: string;
  parent_page?: string;
}

export interface IAnchor {
  title: string;
  anchor: string;
  position: number;
  heading_size: string;
}
export interface IAttachment {
  id: string;
  content_id: string;
  path: string;
  file_name: string;
  download_link: string;
  downloaded: boolean;
  file_size: number;
  space_key: string;
}

export enum SpacesType {
  PERSONAL = "personal",
  GLOBAL = "global",
}

enum Status {
  CURRENT = "current",
}

enum ContentType {
  PAGE = "page",
  BLOGPOST = "blogpost",
}
