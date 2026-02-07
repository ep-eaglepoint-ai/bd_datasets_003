import type { ActionFunction, LoaderFunction } from "react-router";
import { prisma } from "~/utils/prisma.server";
import { getSession } from "~/utils/session.server";

export const loader: LoaderFunction = async () => {
    return null;
};

export const action: ActionFunction = async ({ request }) => {
    const session = await getSession(request.headers.get("Cookie"));
    const userId = session.get("userId");

    if (!userId) {
        return { ok: false, status: 401 };
    }

    const data = await request.json();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.entry.upsert({
        where: {
            userId_date: { userId, date: today },
        },
        update: data,
        create: {
            userId,
            date: today,
            ...data,
        },
    });

    return { ok: true };
};
