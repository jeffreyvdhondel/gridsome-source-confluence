"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const MAX_REQUESTS_COUNT = 50;
const INTERVAL_MS = 10;
let PENDING_REQUESTS = 0;
class Confluence {
    constructor(config) {
        this.config = config;
        const axiosConfig = {
            baseURL: config.base_url,
        };
        if (!this.config.public_only) {
            axiosConfig.auth = {
                username: config.username,
                password: config.password,
            };
        }
        this.axios = axios_1.default.create(axiosConfig);
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
            this.axios.interceptors.response.use(function (response) {
                PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);
                return Promise.resolve(response);
            }, function (error) {
                PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);
                return Promise.reject(error);
            });
        }
    }
    GetSpaces() {
        return this.axios.get("/wiki/rest/api/space", { params: { expand: "homepage" } });
    }
    GetSpace(spaceKey) {
        return this.axios.get(`/wiki/rest/api/space/${spaceKey}`, { params: { expand: "homepage" } });
    }
    GetContentById(id) {
        return this.axios.get(`/wiki/rest/api/content/${id}`);
    }
    GetContentChildPage(id) {
        return this.axios.get(`/wiki/rest/api/content/${id}/child/page`, { params: { expand: "body.view,space" } });
    }
    GetContentChildAttachment(id) {
        return this.axios.get(`/wiki/rest/api/content/${id}/child/attachment`, { params: { expand: "space" } });
    }
    GetAttachment(downloadLink) {
        return this.axios.get(`/wiki${downloadLink}`, { responseType: "stream" }).catch(() => null);
    }
}
exports.default = Confluence;
