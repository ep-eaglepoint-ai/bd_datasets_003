export const commentResolvers = {
  Comment: {
    author: async (parent: any, _: any, context: any) => {
      return context.prisma.user.findUnique({ where: { id: parent.authorId } });
    },
    post: async (parent: any, _: any, context: any) => {
      return context.prisma.post.findUnique({ where: { id: parent.postId } });
    },
  },
};
