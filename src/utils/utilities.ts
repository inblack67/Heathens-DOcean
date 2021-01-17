import { ChannelEntity } from "../entities/Channel";
import { MessageEntity } from "../entities/Message";
import { UserEntity } from "../entities/User";

const orderTypes = [ 'asc', 'desc' ] as const;
export const customSort = <T extends (ChannelEntity[] | UserEntity[] | MessageEntity[])> (aob: T, order: typeof orderTypes[ number ] = 'desc') => {
    const sortedAob = aob.sort((c1: (ChannelEntity | UserEntity | MessageEntity), c2: (ChannelEntity | UserEntity | MessageEntity)) => {
        if (order === 'desc') {
            if (c1.createdAt <= c2.createdAt) {
                return 1;
            } else {
                return -1;
            }
        } else {
            if (c1.createdAt <= c2.createdAt) {
                return -1;
            } else {
                return 1;
            }
        }
    });
    return sortedAob;
};
