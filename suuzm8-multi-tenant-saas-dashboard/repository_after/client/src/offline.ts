import React, { useEffect, useState } from "react";

export function useOnlineStatus() {
  const [online, setOnline] = useState(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}

export function OfflineNotice() {
  const online = useOnlineStatus();
  if (online) return null;
  return React.createElement(
    "p",
    { role: "alert" },
    "You’re offline. Showing cached data if available."
  );
}
