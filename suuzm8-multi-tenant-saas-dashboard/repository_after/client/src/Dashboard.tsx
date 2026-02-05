import React from "react";
import { useQuery } from "@tanstack/react-query";

type TrendPoint = { day: string; count: number };

type DashboardResponse = {
  organization: { slug: string; name: string };
  total_projects: number;
  active_users: number;
  latest_project_created_at: string | null;
  generated_at: string;
  activity_trends: TrendPoint[];
};

function getUserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatLocalDate(iso: string) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatLocalDateTime(iso: string) {
  const tz = getUserTimeZone();
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

async function fetchDashboard(
  organizationSlug: string
): Promise<DashboardResponse> {
  const res = await fetch(`/api/organizations/${organizationSlug}/dashboard/`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load dashboard");
  return res.json();
}

export function Dashboard({ organizationSlug }: { organizationSlug: string }) {
  const query = useQuery({
    queryKey: ["dashboard", organizationSlug],
    queryFn: () => fetchDashboard(organizationSlug),
    staleTime: 5 * 60 * 1000,
  });

  if (query.isLoading) {
    return (
      <div aria-busy="true" aria-live="polite">
        <div style={{ height: 16, width: 220, background: "var(--muted)" }} />
        <div
          style={{
            height: 12,
            width: 320,
            marginTop: 12,
            background: "var(--muted)",
          }}
        />
        <div
          style={{
            height: 12,
            width: 280,
            marginTop: 8,
            background: "var(--muted)",
          }}
        />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <div role="alert">Failed to load dashboard</div>;
  }

  const data = query.data;

  return (
    <div>
      <h1>{data.organization.name} Dashboard</h1>
      {data.latest_project_created_at ? (
        <p>
          Latest project created:{" "}
          <strong>{formatLocalDateTime(data.latest_project_created_at)}</strong>
        </p>
      ) : (
        <p>No projects yet</p>
      )}
      <dl>
        <div>
          <dt>Total projects</dt>
          <dd>{data.total_projects}</dd>
        </div>
        <div>
          <dt>Active users</dt>
          <dd>{data.active_users}</dd>
        </div>
      </dl>

      <h2>Activity</h2>
      <ul>
        {data.activity_trends.map((p) => (
          <li key={p.day}>
            {formatLocalDate(p.day)}: {p.count}
          </li>
        ))}
      </ul>
    </div>
  );
}
