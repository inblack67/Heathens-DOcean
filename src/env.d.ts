declare namespace NodeJS {
  interface ProcessEnv {
    SESSION_SECRET: string;
    CLIENT_URL: string;
    NODE_ENV: string;
    RECAPTCHA_SECRET: string;
    CRYPTO_KEY: string;
    QUERY_LIMIT: string;
    EMAIL: string;
    PASSWORD: string;
    POSTGRES_DB: string;
    POSTGRES_USER: string;
    POSTGRES_PASSWORD: string;
    COOKIE_DOMAIN: string;
  }
}