import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "./api";
import { OfflineNotice } from "./offline";

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

function formatLocalDate(iso: string, tz?: string) {
  const tzToUse = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tzToUse,
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatLocalDateTime(iso: string, tz?: string) {
  const tzToUse = tz || getUserTimeZone();
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tzToUse,
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
  return apiFetchJson<DashboardResponse>(
    `/api/organizations/${organizationSlug}/dashboard/`
  );
}

export function Dashboard({
  organizationSlug,
  timeZone,
}: {
  organizationSlug: string;
  timeZone?: string;
}) {
  const query = useQuery({
    queryKey: ["dashboard", organizationSlug],
    queryFn: () => fetchDashboard(organizationSlug),
    staleTime: 5 * 60 * 1000,
    networkMode: "offlineFirst",
    refetchOnWindowFocus: false,
  });

  if (query.isLoading) {
    return (
      <div aria-busy="true" aria-live="polite">
        <OfflineNotice />
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
    const message =
      (query.error as unknown as { message?: string })?.message ||
      "Failed to load dashboard";
    return (
      <div>
        <OfflineNotice />
        <div role="alert">{String(message)}</div>
      </div>
    );
  }

  const data = query.data;

  return (
    <div>
      <OfflineNotice />
      <h1>{data.organization.name} Dashboard</h1>
      {data.latest_project_created_at ? (
        <p>
          Latest project created:{" "}
          <strong>
            {formatLocalDateTime(data.latest_project_created_at, timeZone)}
          </strong>
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
            {formatLocalDate(p.day, timeZone)}: {p.count}
          </li>
        ))}
      </ul>
    </div>
  );
}
