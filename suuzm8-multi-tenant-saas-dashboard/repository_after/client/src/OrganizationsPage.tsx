import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetchJson } from "./api";
import { InviteUserModal } from "./InviteUserModal";
import { useOrganizations } from "./useOrganizations";

async function createOrganization(name: string) {
  return apiFetchJson("/api/organizations/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function OrganizationsPage() {
  const qc = useQueryClient();
  const orgsQuery = useOrganizations();

  const [name, setName] = useState("");
  const [inviteOrg, setInviteOrg] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createOrganization(name),
    onSuccess: async () => {
      setName("");
      await qc.invalidateQueries({ queryKey: ["organizations"] });
    },
  });

  const organizations = useMemo(() => orgsQuery.data ?? [], [orgsQuery.data]);

  return (
    <div>
      <h1>Organizations</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createMutation.mutate();
        }}
      >
        <label>
          New organization name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" disabled={createMutation.isPending}>
          Create
        </button>
        {createMutation.isError ? (
          <div role="alert">Failed to create organization</div>
        ) : null}
      </form>

      {orgsQuery.isLoading ? <div>Loading…</div> : null}
      {orgsQuery.isError ? (
        <div role="alert">Failed to load organizations</div>
      ) : null}

      <ul>
        {organizations.map((o) => (
          <li key={o.slug}>
            <strong>{o.name}</strong> ({o.slug}){" "}
            <Link to={`/organizations/${o.slug}/dashboard`}>
              Open dashboard
            </Link>{" "}
            <button type="button" onClick={() => setInviteOrg(o.slug)}>
              Invite
            </button>
          </li>
        ))}
      </ul>

      {inviteOrg ? (
        <div>
          <InviteUserModal
            organizationSlug={inviteOrg}
            onInvited={() => {
              setInviteOrg(null);
            }}
          />
          <button type="button" onClick={() => setInviteOrg(null)}>
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
