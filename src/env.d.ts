declare namespace NodeJS {
  export interface ProcessEnv {
    PORT: string;
    SESSION_SECRET: string;
    CLIENT_URL: string;
    CLIENT_DOMAIN: string;
    NODE_ENV: string;
  }
}
