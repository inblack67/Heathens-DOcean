import { Request, Response } from 'express';
import { ISession } from './interfaces';
import { usersLoader, messagesLoader, channelLoader, } from './dataLoaders';
import { createPubSub } from './pubsub';
import { Redis } from "ioredis";

export type MyContext = {
    req: Request,
    res: Response;
    redis: Redis,
    session: ISession,
    usersLoader: ReturnType<typeof usersLoader>;
    messagesLoader: ReturnType<typeof messagesLoader>;
    channelLoader: ReturnType<typeof channelLoader>;
    pubsub: ReturnType<typeof createPubSub>;
};
