import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "./api";

export type Profile = {
  name: string;
  user_id: number;
  username: string;
  email: string;
  avatar_url: string;
  timezone: string;
  primary_organization: { id: number; name: string; slug: string } | null;
  updated_at: string;
};

async function fetchProfile(): Promise<Profile> {
  return apiFetchJson("/api/profile/");
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
    staleTime: 5 * 60 * 1000,
    networkMode: "offlineFirst",
    refetchOnWindowFocus: false,
  });
}
