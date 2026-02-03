import { redirect, type ActionFunctionArgs } from "react-router";
import { getSession, destroySession } from "~/utils/session.server";

export async function action({ request }: ActionFunctionArgs) {
    const session = await getSession(request.headers.get("Cookie"));
    return redirect("/login", {
        headers: {
            "Set-Cookie": await destroySession(session),
        },
    });
}
