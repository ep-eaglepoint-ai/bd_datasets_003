import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

type JoinInfo = {
  organization: { name: string; slug: string };
  email: string;
  role: string;
  expires_at: string;
};

async function validateInvite(token: string): Promise<JoinInfo> {
  const res = await fetch(`/api/join/${token}/`, { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = data?.detail || 'Invalid invitation';
    throw new Error(message);
  }
  return res.json();
}

async function acceptInvite(token: string) {
  const res = await fetch(`/api/join/${token}/accept/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = data?.detail || 'Failed to accept invitation';
    throw new Error(message);
  }
  return res.json();
}

export function JoinPage() {
  const { token } = useParams<{ token: string }>();

  const query = useQuery({
    queryKey: ['join', token],
    queryFn: () => validateInvite(token || ''),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: () => acceptInvite(token || ''),
  });

  if (query.isLoading) return <div aria-busy="true">Loading invitation…</div>;

  if (query.isError) {
    return <div role="alert">{(query.error as Error).message}</div>;
  }

  const info = query.data!;

  return (
    <div>
      <h1>Join {info.organization.name}</h1>
      <p>Invited as: {info.role}</p>
      <button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        Accept invitation
      </button>
      {mutation.isError ? <div role="alert">{(mutation.error as Error).message}</div> : null}
      {mutation.isSuccess ? <div>Joined successfully</div> : null}
    </div>
  );
}
