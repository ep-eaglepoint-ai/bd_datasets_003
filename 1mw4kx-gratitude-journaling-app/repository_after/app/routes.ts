import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("login", "routes/login.tsx"),
    route("auth/callback", "routes/auth.callback.tsx"),
    route("history", "routes/history.tsx"),
    route("stats", "routes/stats.tsx"),
    route("logout", "routes/logout.tsx"),
    route(".well-known/appspecific/com.chrome.devtools.json", "routes/api/save.ts", { id: "devtools-json" }),
    route("*", "routes/api/save.ts", { id: "catch-all" }),
] satisfies RouteConfig;
