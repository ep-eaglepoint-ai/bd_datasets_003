import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

type Props = {
  organizationSlug: string;
  onInvited?: () => void;
};

type InvitePayload = { email: string; role: 'owner' | 'admin' | 'member' | 'viewer' };

async function invite(organizationSlug: string, payload: InvitePayload) {
  const res = await fetch(`/api/organizations/${organizationSlug}/invitations/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Invite failed');
  return res.json();
}

export function InviteUserModal({ organizationSlug, onInvited }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitePayload['role']>('member');

  const mutation = useMutation({
    mutationFn: (payload: InvitePayload) => invite(organizationSlug, payload),
    onSuccess: () => {
      setEmail('');
      onInvited?.();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate({ email, role });
      }}
    >
      <h3>Invite user</h3>
      <label>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value as InvitePayload['role'])}>
          <option value="viewer">Viewer</option>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
      </label>
      <button type="submit" disabled={mutation.isPending}>
        Send invite
      </button>
      {mutation.isError ? <div role="alert">Invite failed</div> : null}
    </form>
  );
}
