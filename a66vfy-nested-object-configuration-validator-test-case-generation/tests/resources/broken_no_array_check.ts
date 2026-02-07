export function validateConfig(config: any): boolean {
  if (!config.server || typeof config.server.port !== "number") return false;
  if (config.services === null || config.services === undefined) return false;
  if (typeof config.services === "object" && !Array.isArray(config.services)) {
    return true;
  }
  for (const svc of config.services) {
    if (!svc.name || typeof svc.name !== "string") return false;
    if (svc.replicas !== undefined && typeof svc.replicas !== "number") return false;
  }
  return true;
}
