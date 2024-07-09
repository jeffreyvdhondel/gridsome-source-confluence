import Axios, { AxiosError, AxiosInstance, AxiosResponse } from "axios";

import { IConfig, SpacesResponse, SpaceReponse, ContentResponse, ContentIdResponse, AttachmentResponse } from "../interface/confluence";
import axiosRetry from "axios-retry";

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

    /**
     * Axios retry configuration
     */
    if (this.config.retry_request) {
      axiosRetry(this.axios, {
        retries: 15,
        retryCondition: (e: AxiosError) => {
          console.log("[Confluence]", 'To many request, retrying...');
          return e.response?.status === 429;
        },
        retryDelay: axiosRetry.exponentialDelay,
      });
    }
  }

  GetSpaces(): Promise<AxiosResponse<SpacesResponse>> {
    return this.axios.get("/wiki/rest/api/space", { params: { expand: "homepage" } });
  }

  GetSpace(spaceKey: string): Promise<AxiosResponse<SpaceReponse>> {
    return this.axios.get(`/wiki/rest/api/space/${spaceKey}`, { params: { expand: "homepage" } });
  }

  GetContentById(id: string): Promise<AxiosResponse<ContentIdResponse>> {
    return this.axios.get(`/wiki/rest/api/content/${id}`, { params: { expand: "body.view,space,metadata.labels,history.lastUpdated" } });
  }

  GetContentChildPage(id: string): Promise<AxiosResponse<ContentResponse>> {
    return this.axios.get(`/wiki/rest/api/content/${id}/child/page`, { params: { expand: "body.view,space,metadata.labels,history.lastUpdated" } });
  }

  GetContentChildAttachment(id: string): Promise<AxiosResponse<AttachmentResponse>> {
    return this.axios.get(`/wiki/rest/api/content/${id}/child/attachment`, { params: { expand: "space" } });
  }
  GetAttachment(downloadLink: string): Promise<AxiosResponse | null> {
    return this.axios.get(`/wiki${downloadLink}`, { responseType: "stream" }).catch(() => null);
  }
}
