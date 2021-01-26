import { MyContext } from "../utils/types";
import { ErrorResponse } from "../utils/ErrorResponse";
import { MiddlewareFn } from "type-graphql";
import jwt from 'jsonwebtoken';
import { IJwt } from "../utils/interfaces";
import { RED_CURRENT_USER } from "../utils/redisKeys";
import { parse } from "flatted";
import { UserEntity } from "../entities/User";

export const isAuthenticated: MiddlewareFn<MyContext> = async ({ context: { req, redis, session } }, next) => {

    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(' ')[ 1 ];
        const verifiedToken: IJwt = jwt.verify(token, process.env.JWT_SECRET) as IJwt;
        const stringifiedRedUser = await redis.get(RED_CURRENT_USER);
        const parsedRedUser = stringifiedRedUser ? parse(stringifiedRedUser) : null;
        if (!stringifiedRedUser || parsedRedUser._id !== verifiedToken._id) {
            throw new ErrorResponse('Not Authenticated', 401);
        }
        return next();
    }

    else {
        const currentUser = session.user;
        if (!currentUser) {
            throw new ErrorResponse('Not Authenticated', 401);
        }
        return next();
    }
};

export const isAdmin: MiddlewareFn<MyContext> = async ({ context: { redis, req, session } }, next) => {

    const authHeader = req.headers.authorization;

    if (authHeader) {
        const stringifiedRedUser = await redis.get(RED_CURRENT_USER);
        const parsedRedUser = parse(stringifiedRedUser!) as UserEntity;

        if (parsedRedUser.role !== 'admin') {
            throw new ErrorResponse('Not Authorized', 401);
        }

        return next();
    }

    else {
        const currentUser = session.user;

        if (currentUser!.role !== 'admin') {
            throw new ErrorResponse('Not Authorized', 401);
        }

        return next();
    }

};
