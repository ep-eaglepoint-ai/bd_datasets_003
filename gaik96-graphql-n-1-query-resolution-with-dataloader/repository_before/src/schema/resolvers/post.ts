export const postResolvers = {
  Query: {
    posts: async (_: any, args: { limit?: number; offset?: number }, context: any) => {
      return context.prisma.post.findMany({
        take: args.limit || 20,
        skip: args.offset || 0,
        orderBy: { createdAt: 'desc' },
      });
    },
    post: async (_: any, args: { id: string }, context: any) => {
      return context.prisma.post.findUnique({ where: { id: args.id } });
    },
    feed: async (_: any, args: { userId: string; limit?: number }, context: any) => {
      const following = await context.prisma.follow.findMany({
        where: { followerId: args.userId },
        select: { followingId: true },
      });
      const followingIds = following.map((f: any) => f.followingId);
      return context.prisma.post.findMany({
        where: { authorId: { in: followingIds } },
        take: args.limit || 20,
        orderBy: { createdAt: 'desc' },
      });
    },
  },
  Post: {
    author: async (parent: any, _: any, context: any) => {
      return context.prisma.user.findUnique({ where: { id: parent.authorId } });
    },
    comments: async (parent: any, _: any, context: any) => {
      return context.prisma.comment.findMany({ where: { postId: parent.id } });
    },
    likeCount: async (parent: any, _: any, context: any) => {
      return context.prisma.like.count({ where: { postId: parent.id } });
    },
  },
};
