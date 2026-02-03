import { defineConfig } from "prisma/config";

export default defineConfig({
  migrate: {
    databaseUrl: "file:./dev.db",
  },
});
