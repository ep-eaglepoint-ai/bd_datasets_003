import { postResolvers } from './post';
import { userResolvers } from './user';
import { commentResolvers } from './comment';

export const resolvers = {
  Query: {
    ...postResolvers.Query,
    ...userResolvers.Query,
  },
  Post: postResolvers.Post,
  User: userResolvers.User,
  Comment: commentResolvers.Comment,
};
