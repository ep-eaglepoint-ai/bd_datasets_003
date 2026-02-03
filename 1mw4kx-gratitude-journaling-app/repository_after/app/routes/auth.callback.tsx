import { redirect, type LoaderFunctionArgs } from "react-router";
import { prisma } from "~/utils/prisma.server";
import { getSession, commitSession } from "~/utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const email = url.searchParams.get("email");

    if (!token || !email) {
        return redirect("/login");
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (
        !user ||
        user.magicToken !== token ||
        !user.tokenExpiry ||
        user.tokenExpiry < new Date()
    ) {
        return redirect("/login");
    }

    const session = await getSession(request.headers.get("Cookie"));
    session.set("userId", user.id);

    await prisma.user.update({
        where: { id: user.id },
        data: { magicToken: null, tokenExpiry: null },
    });

    return redirect("/", {
        headers: {
            "Set-Cookie": await commitSession(session),
        },
    });
}
