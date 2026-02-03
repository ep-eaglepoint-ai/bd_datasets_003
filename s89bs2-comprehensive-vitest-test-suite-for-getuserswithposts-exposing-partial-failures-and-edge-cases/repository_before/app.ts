import { fetchUser, fetchPosts } from './api'; // Assume these are external async functions

interface User {
  id: number;
  name: string;
}


interface Post {
  userId: number;
  title: string;
  body: string;
}

export async function getUsersWithPosts(userIds: number[]): Promise<{ user: User; posts: Post[] }[]> {
  const users = await Promise.all(userIds.map(id => fetchUser(id)));
  const postsPromises = users.map(user => fetchPosts(user.id));
  const allPosts = await Promise.all(postsPromises);
  return users.map((user, index) => ({ user, posts: allPosts[index] }));
}
