import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetchJson } from "./api";
import { useMemberships } from "./useMemberships";
import { useProfile } from "./useProfile";

type Props = {
  organizationSlug: string;
  onInvited?: () => void;
};

type InvitePayload = {
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
};

async function invite(organizationSlug: string, payload: InvitePayload) {
  return apiFetchJson(`/api/organizations/${organizationSlug}/invitations/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function InviteUserModal({ organizationSlug, onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitePayload["role"]>("member");

  const profileQuery = useProfile();
  const membershipsQuery = useMemberships(organizationSlug);
  const myRole = (() => {
    const me = profileQuery.data?.user_id;
    if (!me) return null;
    const m = membershipsQuery.data?.find((row) => row.user_id === me);
    return m?.role || null;
  })();
  const canInviteOwner = myRole === "owner";

  const mutation = useMutation({
    mutationFn: (payload: InvitePayload) => invite(organizationSlug, payload),
    onSuccess: () => {
      setEmail("");
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
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as InvitePayload["role"])}
        >
          <option value="viewer">Viewer</option>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          {canInviteOwner ? <option value="owner">Owner</option> : null}
        </select>
      </label>
      <button type="submit" disabled={mutation.isPending}>
        Send invite
      </button>
      {mutation.isError ? <div role="alert">Invite failed</div> : null}
    </form>
  );
}
