import { Session, SessionData } from 'express-session';
import { GraphQLError } from 'graphql';

export interface ISession extends Session, SessionData
{
    user?: string | number;
    username?: string;
}

export interface IMyError extends GraphQLError
{
    cMessage?: string,
    cStatus?: number;
}