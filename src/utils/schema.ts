import { AuthResolver } from "../resolvers/auth";
import { ChannelResolver } from "../resolvers/channel";
import { HelloResolver } from "../resolvers/hello";
import { MessageResolver } from "../resolvers/message";
import { createPubSub } from "./pubsub";
import { buildSchema } from 'type-graphql';

export const getSchema = async () => {
    const schema = await buildSchema({
        resolvers: [ HelloResolver, AuthResolver, ChannelResolver, MessageResolver ],
        validate: false,
        pubSub: createPubSub()
    });

    return schema;
};

