import React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { apiFetchJson } from "./api";
import { OfflineNotice } from "./offline";

type JoinInfo = {
  organization: { name: string; slug: string };
  email: string;
  role: string;
  expires_at: string;
};

async function validateInvite(token: string): Promise<JoinInfo> {
  return apiFetchJson(`/api/join/${token}/`);
}

async function acceptInvite(token: string) {
  return apiFetchJson(`/api/join/${token}/accept/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

export function JoinPage() {
  const { token } = useParams<{ token: string }>();

  const query = useQuery({
    queryKey: ["join", token],
    queryFn: () => validateInvite(token || ""),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    networkMode: "offlineFirst",
    refetchOnWindowFocus: false,
  });

  const mutation = useMutation({
    mutationFn: () => acceptInvite(token || ""),
  });

  if (query.isLoading)
    return (
      <div aria-busy="true">
        <OfflineNotice />
        <div>Loading invitation…</div>
      </div>
    );

  if (query.isError) {
    const err = query.error as unknown as { message?: string };
    return (
      <div>
        <OfflineNotice />
        <div role="alert">{String(err?.message || query.error)}</div>
      </div>
    );
  }

  const info = query.data!;

  return (
    <div>
      <OfflineNotice />
      <h1>Join {info.organization.name}</h1>
      <p>Invited as: {info.role}</p>
      <button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        Accept invitation
      </button>
      {mutation.isError ? (
        <div role="alert">{(mutation.error as Error).message}</div>
      ) : null}
      {mutation.isSuccess ? <div>Joined successfully</div> : null}
    </div>
  );
}
