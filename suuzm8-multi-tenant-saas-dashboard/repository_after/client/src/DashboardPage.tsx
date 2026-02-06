import React from "react";
import { useParams } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { useProfile } from "./useProfile";

export function DashboardPage() {
  const { organizationSlug } = useParams<{ organizationSlug: string }>();
  const profileQuery = useProfile();

  const tz = profileQuery.data?.timezone;

  if (!organizationSlug) {
    return <div role="alert">Missing organization</div>;
  }

  return <Dashboard organizationSlug={organizationSlug} timeZone={tz} />;
}
