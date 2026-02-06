import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "./api";

export type Membership = {
  id: number;
  organization_slug: string;
  user_id: number;
  role: "owner" | "admin" | "member" | "viewer";
  is_active: boolean;
  created_at: string;
};

async function fetchMemberships(
  organizationSlug: string
): Promise<Membership[]> {
  return apiFetchJson(`/api/organizations/${organizationSlug}/memberships/`);
}

export function useMemberships(organizationSlug: string) {
  return useQuery({
    queryKey: ["memberships", organizationSlug],
    queryFn: () => fetchMemberships(organizationSlug),
    enabled: !!organizationSlug,
    staleTime: 60 * 1000,
    networkMode: "offlineFirst",
    refetchOnWindowFocus: false,
  });
}
