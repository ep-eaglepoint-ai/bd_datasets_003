import { createCookieSessionStorage } from "react-router";

export const sessionStorage = createCookieSessionStorage({
    cookie: {
        name: "__gratitude_session",
        secrets: ["dev-secret"], // replace in prod
        sameSite: "lax",
        path: "/",
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 30, // 30 days persistence
    },
});

export const { getSession, commitSession, destroySession } =
    sessionStorage;
