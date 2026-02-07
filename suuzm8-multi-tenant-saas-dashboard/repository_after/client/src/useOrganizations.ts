import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "./api";

export type Organization = {
  id: number;
  name: string;
  slug: string;
  created_at: string;
};

async function fetchOrganizations(): Promise<Organization[]> {
  return apiFetchJson("/api/organizations/");
}

export function useOrganizations() {
  return useQuery({
    queryKey: ["organizations"],
    queryFn: fetchOrganizations,
    staleTime: 5 * 60 * 1000,
    networkMode: "offlineFirst",
    refetchOnWindowFocus: false,
  });
}
