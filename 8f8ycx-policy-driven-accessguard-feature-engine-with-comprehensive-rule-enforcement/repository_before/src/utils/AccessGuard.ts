export interface User {
  id: string;
  role: 'USER' | 'ADMIN' | 'SUPPORT';
  plan: 'FREE' | 'PRO' | 'ENTERPRISE';
  region: string; // e.g., 'US', 'EU', 'GB'
  createdAt: string; // ISO-8601 string
  isBetaParticipant: boolean;
}

export interface FeatureConfig {
  key: string;
  internalOnly: boolean;
  isBeta: boolean;
  requiresPlan: string[]; // e.g., ['PRO', 'ENTERPRISE']
  excludedRegions: string[];
}

export class AccessGuard {
  /**
   * Determines if a user can access a specific feature.
   * CURRENT LIMITATIONS:
   * - No standardized enforcement of regional exclusions.
   * - Account age calculation is fragile and inconsistent.
   * - Rule precedence (DENY vs ALLOW) is not clearly defined.
   * Target State: A robust, policy-driven AccessGuard engine.
   */
  public canAccess(user: User | null, feature: FeatureConfig): boolean {
    if (!user) return false;

    // Placeholder: new policy-driven logic will be introduced here.
    return true;
  }
}
