// src/models/User.ts
export interface User {
  id: string;
  email: string;
  role?: string; // "admin", "editor", "viewer" — not enforced anywhere
}
