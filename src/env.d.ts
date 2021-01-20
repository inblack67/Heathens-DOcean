declare namespace NodeJS {
  export interface ProcessEnv {
    CLIENT_URL: string;
    PORT: string;
    SESSION_SECRET: string;
    COOKIE_DOMAIN: string;
    NODE_ENV: string;
    RECAPTCHA_SECRET: string;
    POSTGRES_PASSWORD: string;
    POSTGRES_USER: string;
    POSTGRES_DB: string;
    CRYPTO_KEY: string;
    QUERY_LIMIT: string;
    EMAIL: string;
    PASSWORD: string;
    MY_HOST: string;
  }
}
