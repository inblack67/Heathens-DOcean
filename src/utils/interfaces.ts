import { Session, SessionData } from 'express-session';
import { GraphQLError } from 'graphql';
import { UserEntity } from '../entities/User';

export interface ISession extends Session, SessionData {
    user?: UserEntity;
    token?: string;
}

export interface IMyError extends GraphQLError {
    cMessage?: string;
    cStatus?: number;
}

export interface IEmail {
    to: string;
    subject: string;
    text: string;
    templatePath: string;
    username: string;
    url: string;
}

export interface IJwt {
    iat: Date,
    _id: string;
    exp: Date
}
