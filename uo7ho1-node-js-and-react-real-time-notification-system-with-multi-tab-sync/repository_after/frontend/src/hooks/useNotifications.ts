// Notifications hook with React Query for data fetching
// Requirement 12: Infinite scroll pagination

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '../services/api';
import { useNotificationStore } from '../stores/notificationStore';
import { useEffect } from 'react';
import type { Notification } from '../types';

export const useNotifications = () => {
  const queryClient = useQueryClient();
  const {
    setNotifications,
    addNotifications,
    setUnreadCount,
    setPagination,
    setIsLoading,
  } = useNotificationStore();

  // Requirement 12: Infinite query for pagination
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: async ({ pageParam }) => {
      return notificationApi.getNotifications(pageParam, 20);
    },
    getNextPageParam: (lastPage) => {
      // Requirement 8: Use nextCursor for pagination
      return lastPage.hasMore ? lastPage.nextCursor : undefined;
    },
    initialPageParam: null as string | null,
    staleTime: 30000, // 30 seconds
  });

  // Sync query data to store
  useEffect(() => {
    if (data) {
      const allNotifications = data.pages.flatMap((page) => page.data);
      setNotifications(allNotifications);

      const lastPage = data.pages[data.pages.length - 1];
      setPagination(lastPage.hasMore, lastPage.nextCursor);
    }
  }, [data, setNotifications, setPagination]);

  useEffect(() => {
    setIsLoading(isLoading || isFetchingNextPage);
  }, [isLoading, isFetchingNextPage, setIsLoading]);

  // Unread count query
  const { data: unreadData } = useQuery({
    queryKey: ['unreadCount'],
    queryFn: () => notificationApi.getUnreadCount(),
    staleTime: 10000, // 10 seconds
  });

  useEffect(() => {
    if (unreadData) {
      setUnreadCount(unreadData.count);
    }
  }, [unreadData, setUnreadCount]);

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: (notificationId: string) => notificationApi.markAsRead(notificationId),
    onSuccess: (result) => {
      // Update cache
      queryClient.setQueryData(['unreadCount'], { count: result.unreadCount });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationApi.markAllAsRead(),
    onSuccess: (result) => {
      queryClient.setQueryData(['unreadCount'], { count: result.unreadCount });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Requirement 12: Load more function for infinite scroll
  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return {
    notifications: data?.pages.flatMap((page) => page.data) ?? [],
    isLoading,
    isFetchingNextPage,
    isError,
    error,
    hasMore: hasNextPage ?? false,
    loadMore,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  };
};
