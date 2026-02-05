import { useQuery } from '@tanstack/react-query';

export type Organization = {
  id: number;
  name: string;
  slug: string;
  created_at: string;
};

async function fetchOrganizations(): Promise<Organization[]> {
  const res = await fetch('/api/organizations/', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load organizations');
  return res.json();
}

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: fetchOrganizations,
    staleTime: 5 * 60 * 1000,
  });
}
