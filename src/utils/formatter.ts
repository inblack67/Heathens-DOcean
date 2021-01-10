import { GraphQLError } from "graphql";
import { IMyError } from './interfaces';

export const errorFormatter = ( err: GraphQLError ): IMyError =>
{
    const myError: IMyError = { ...err };
    console.log( 'myError', myError );
    return myError;
};