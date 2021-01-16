import 'reflect-metadata';
import express, { Request, Response } from 'express';
import session from 'express-session';
import Redis from 'ioredis';
import connectRedis from 'connect-redis';
import cors from 'cors';
import { ApolloServer } from 'apollo-server-express';
import dotenv from 'dotenv-safe';
import 'colors';
import { createConnection } from "typeorm";
import { UserEntity } from './entities/User';
import { ChannelEntity } from './entities/Channel';
import { MyContext } from './utils/types';
import { MessageEntity } from './entities/Message';
import { usersLoader, messagesLoader, channelLoader } from './utils/dataLoaders';
import { createPubSub } from './utils/pubsub';
import { createServer } from 'http';
import { GraphQLError } from 'graphql';
import { errorFormatter } from './utils/formatter';
import { getSchema } from './utils/schema';
import { ErrorResponse } from './utils/ErrorResponse';

const main = async () => {
    dotenv.config();

    const RedisClient = new Redis({
        host: process.env.REDIS_HOST,
        port: 6379
    });
    const RedisStore = connectRedis(session);

    let retries = 20;
    while (retries) {
        try {
            await createConnection({
                type: 'postgres',
                database: 'slack',
                username: process.env.POSTGRES_USER,
                password: process.env.POSTGRES_PASSWORD,
                logging: true,
                synchronize: true,
                host: process.env.DB_HOST,
                entities: [ UserEntity, ChannelEntity, MessageEntity ]
            });
            console.log('Postgres is here'.blue.bold);
            break;
        } catch (err) {
            console.log('inside typeorm...');
            console.error(err);
            retries -= 1;
            console.log('retries left = ', retries);
            await new Promise(res => setTimeout(res, 5000));
        }
    }

    const app = express();
    const ws = createServer(app);

    app.set('trust proxy', 1);

    app.use(cors({
        origin: process.env.CLIENT_URL,
        credentials: true,
        optionsSuccessStatus: 200
    }));

    app.get('/', (_: Request, res: Response) => {
        res.send('API up and runnin');
        res.end();
    });

    const sessionParser = session({
        proxy: true,
        store: new RedisStore({ client: RedisClient }),
        name: 'ts',
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: true,
            maxAge: 1000 * 60 * 60,
            domain: process.env.COOKIE_DOMAIN,
        }
    });

    app.use(sessionParser);

    const apolloServer = new ApolloServer({
        schema: await getSchema(),
        context: ({ req, res }): MyContext => ({ req, res, session: req?.session, usersLoader: usersLoader(), messagesLoader: messagesLoader(), channelLoader: channelLoader(), pubsub: createPubSub() }),
        subscriptions: {
            onConnect: (_, ws: any) => {
                if (ws.upgradeReq.headers.origin !== process.env.CLIENT_URL) {
                    throw new ErrorResponse('Maybe some other time', 401);
                }
                sessionParser(ws.upgradeReq as Request, {} as Response, () => {
                    if (!ws.upgradeReq.session.user) {
                        // throw new ErrorResponse( 'Not Authorized For Subscriptions!', 401 );
                    }
                });
            }
        },
        formatError: (err: GraphQLError) => {
            const customError = errorFormatter(err);
            return customError;
        },
        playground: true,
    });

    apolloServer.installSubscriptionHandlers(ws);
    apolloServer.applyMiddleware({ app, cors: false });

    const PORT = +process.env.PORT || 5000;

    ws.listen(PORT, async () => {
        console.log(`Server started on port ${ PORT }`.green.bold);
    });

};

main().catch(err => console.error(err));
