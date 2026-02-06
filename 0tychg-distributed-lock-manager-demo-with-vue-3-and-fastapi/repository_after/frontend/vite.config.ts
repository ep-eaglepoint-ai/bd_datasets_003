import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 3000,
    proxy: {
      "/api": "http://backend:8000",
      "/ws": {
        target: "ws://backend:8000",
        ws: true,
      },
    },
  },
});
