import Axios, { AxiosInstance, AxiosResponse } from "axios";

import { IConfig, SpacesResponse, SpaceReponse, ContentResponse, ContentIdResponse, AttachmentResponse } from "../interface/confluence";

const MAX_REQUESTS_COUNT = 50;
const INTERVAL_MS = 10;
let PENDING_REQUESTS = 0;

export default class Confluence {
  axios: AxiosInstance;
  config: IConfig;

  constructor(config: IConfig) {
    this.config = config;
    const axiosConfig = {
      baseURL: config.base_url,
    } as { baseURL: string; auth?: { username: string; password: string } };

    if (!this.config.public_only) {
      axiosConfig.auth = {
        username: config.username,
        password: config.password,
      };
    }
    this.axios = Axios.create(axiosConfig);

    //https://gist.github.com/matthewsuan/2bdc9e7f459d5b073d58d1ebc0613169
    /**
     * Axios Request Interceptor
     */
    if (this.config.rate_limit) {
      this.axios.interceptors.request.use(function (config) {
        return new Promise((resolve) => {
          const interval = setInterval(() => {
            if (PENDING_REQUESTS < MAX_REQUESTS_COUNT) {
              PENDING_REQUESTS++;
              clearInterval(interval);
              resolve(config);
            }
          }, INTERVAL_MS);
        });
      });

      /**
       * Axios Response Interceptor
       */
      this.axios.interceptors.response.use(
        function (response) {
          PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);
          return Promise.resolve(response);
        },
        function (error) {
          PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);
          return Promise.reject(error);
        }
      );
    }
  }

  GetSpaces(): Promise<AxiosResponse<SpacesResponse>> {
    return this.axios.get("/wiki/rest/api/space", { params: { expand: "homepage" } });
  }

  GetSpace(spaceKey: string): Promise<AxiosResponse<SpaceReponse>> {
    return this.axios.get(`/wiki/rest/api/space/${spaceKey}`, { params: { expand: "homepage" } });
  }

  GetContentById(id: string): Promise<AxiosResponse<ContentIdResponse>> {
    return this.axios.get(`/wiki/rest/api/content/${id}`);
  }

  GetContentChildPage(id: string): Promise<AxiosResponse<ContentResponse>> {
    return this.axios.get(`/wiki/rest/api/content/${id}/child/page`, { params: { expand: "body.view,space" } });
  }

  GetContentChildAttachment(id: string): Promise<AxiosResponse<AttachmentResponse>> {
    return this.axios.get(`/wiki/rest/api/content/${id}/child/attachment`, { params: { expand: "space" } });
  }
  GetAttachment(downloadLink: string): Promise<AxiosResponse | null> {
    return this.axios.get(`/wiki${downloadLink}`, { responseType: "stream" }).catch(() => null);
  }
}
