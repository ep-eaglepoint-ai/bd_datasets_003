// src/types/colord-plugins.d.ts
import { Colord } from "colord";

declare module "colord" {
  interface Colord {
    complement(): Colord;
    contrast(color: string | Colord): number;
  }
}

declare module "colord/plugins/complementary";
declare module "colord/plugins/names";
