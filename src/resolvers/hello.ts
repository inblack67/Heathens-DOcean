import { Query, Resolver } from "type-graphql";

@Resolver()
export class HelloResolver
{
    @Query( () => String )
    hello ()
    {
        return 'worlds';
    }
}


// import { MyContext } from "../utils/types";
// import { Ctx, Query, Resolver } from "type-graphql";

// @Resolver()
// export class HelloResolver
// {
//     @Query( () => String )
//     hello (
//         @Ctx()
//         { session }: MyContext
//     )
//     {
//         session.destroy( err => console.error( err ) );
//         return 'worlds';
//     }
// }
