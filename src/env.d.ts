declare namespace NodeJS {
  export interface ProcessEnv {
    PORT: string;
    SESSION_SECRET: string;
    CLIENT_URL: string;
    COOKIE_DOMAIN: string;
    NODE_ENV: string;
  }
}
