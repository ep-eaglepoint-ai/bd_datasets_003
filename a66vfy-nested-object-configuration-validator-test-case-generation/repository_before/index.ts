export function validateConfig(config: any): boolean {
  if (!config.server || typeof config.server.port !== "number") return false;
  if (!Array.isArray(config.services)) return false;
  for (const svc of config.services) {
    if (!svc.name || typeof svc.name !== "string") return false;
    if (svc.replicas !== undefined && typeof svc.replicas !== "number") return false;
  }
  return true;
}
