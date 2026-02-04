export const userResolvers = {
  Query: {
    user: async (_: any, args: { id: string }, context: any) => {
      return context.prisma.user.findUnique({ where: { id: args.id } });
    },
  },
  User: {
    posts: async (parent: any, _: any, context: any) => {
      return context.prisma.post.findMany({ where: { authorId: parent.id } });
    },
    followers: async (parent: any, _: any, context: any) => {
      const follows = await context.prisma.follow.findMany({
        where: { followingId: parent.id },
      });
      const followerIds = follows.map((f: any) => f.followerId);
      const followers = [];
      for (const id of followerIds) {
        const user = await context.prisma.user.findUnique({ where: { id } });
        if (user) followers.push(user);
      }
      return followers;
    },
    following: async (parent: any, _: any, context: any) => {
      const follows = await context.prisma.follow.findMany({
        where: { followerId: parent.id },
      });
      const followingIds = follows.map((f: any) => f.followingId);
      const following = [];
      for (const id of followingIds) {
        const user = await context.prisma.user.findUnique({ where: { id } });
        if (user) following.push(user);
      }
      return following;
    },
  },
};
