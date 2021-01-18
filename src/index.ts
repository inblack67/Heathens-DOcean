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
import { isProd } from './utils/constants';
import { fieldExtensionsEstimator, getComplexity, simpleEstimator } from 'graphql-query-complexity';
import { populateRedis } from './utils/populate';

const main = async () => {
    dotenv.config();

    const RedisClient = new Redis({
        host: process.env.REDIS_HOST,
        port: 6379
    });

    await RedisClient.flushall();

    const RedisStore = connectRedis(session);

    let retries = 20;
    while (retries) {
        try {
            await createConnection({
                type: 'postgres',
                database: process.env.POSTGRES_DB,
                username: process.env.POSTGRES_USER,
                password: process.env.POSTGRES_PASSWORD,
                // logging: true,
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
        origin: isProd() ? (origin, cb) => {
            if (!origin || origin !== process.env.CLIENT_URL) {
                cb(new ErrorResponse('Maybe some other time', 401), false);
            } else {
                cb(null, true);
            }
        } : process.env.CLIENT_URL,
        credentials: true,
        optionsSuccessStatus: 200
    }));

    app.get('/', (_: Request, res: Response) => {
        res.send('API up and runnin');
        res.end();
    });

    const schema = await getSchema();

    const sessionParser = session({
        proxy: isProd(),
        store: new RedisStore({ client: RedisClient }),
        name: 'ts',
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: isProd(),
            maxAge: 1000 * 60 * 60,
            domain: isProd() ? process.env.COOKIE_DOMAIN : undefined,
        }
    });

    app.use(sessionParser);

    // populating redis
    populateRedis(RedisClient);

    const apolloServer = new ApolloServer({
        schema,
        context: ({ req, res }): MyContext => ({ req, res, redis: RedisClient, session: req?.session, usersLoader: usersLoader(), messagesLoader: messagesLoader(), channelLoader: channelLoader(), pubsub: createPubSub() }),
        subscriptions: {
            onConnect: (_, ws: any) => {
                if (!ws.upgradeReq.headers.origin || ws.upgradeReq.headers.origin !== process.env.CLIENT_URL) {
                    throw new ErrorResponse('Maybe some other time', 401);
                }
                sessionParser(ws.upgradeReq as Request, {} as Response, () => {
                    if (!ws.upgradeReq.session.user) {
                        // yet to be reasearched
                        // throw new ErrorResponse( 'Not Authorized For Subscriptions!', 401 );
                    }
                });
            }
        },
        formatError: (err: GraphQLError) => {
            const customError = errorFormatter(err);
            return customError;
        },
        playground: !isProd(),
        plugins: [
            {
                requestDidStart: () => ({
                    didResolveOperation ({ request, document }) {
                        const complexity = getComplexity({
                            schema,
                            operationName: request.operationName,
                            query: document,
                            variables: request.variables,
                            estimators: [
                                fieldExtensionsEstimator(),
                                simpleEstimator({ defaultComplexity: 1 }),
                            ],
                        });
                        if (complexity <= +process.env.QUERY_LIMIT) {
                            console.log(`Query Complexity = ${ complexity }`.green.bold);
                        } else {
                            console.log(`FATAL Query Complexity = ${ complexity }`.red.bold);
                            throw new ErrorResponse('Too Complex', 401);
                        }
                    },
                }),
            },
        ],
    });

    apolloServer.installSubscriptionHandlers(ws);
    apolloServer.applyMiddleware({ app, cors: false });

    const PORT = +process.env.PORT || 5000;

    ws.listen(PORT, async () => {
        console.log(`Server started on port ${ PORT }`.green.bold);
    });

};

main().catch(err => console.error(err));
