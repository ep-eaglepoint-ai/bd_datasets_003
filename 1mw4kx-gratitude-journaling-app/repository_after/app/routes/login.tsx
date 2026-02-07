import { Form, useActionData, useNavigation, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { getSession } from "~/utils/session.server";
import { prisma } from "~/utils/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const session = await getSession(request.headers.get("Cookie"));
    if (session.has("userId")) return redirect("/");
    return {};
}

export async function action({ request }: ActionFunctionArgs) {
    const formData = await request.formData();
    const email = formData.get("email");

    if (typeof email !== "string" || !email.includes("@")) {
        return { error: "Please enter a valid email address." };
    }

    // Magic link simulation
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        user = await prisma.user.create({ data: { email } });
    }

    const token = Math.random().toString(36).substring(2, 12);
    const expiry = new Date(Date.now() + 1000 * 60 * 15); // 15 mins

    await prisma.user.update({
        where: { id: user.id },
        data: { magicToken: token, tokenExpiry: expiry },
    });

    const url = new URL(request.url);
    const magicLink = `${url.origin}/auth/callback?token=${token}&email=${email}`;

    console.log(`\n\n[JOURNAL MAGIC LINK]: ${magicLink}\n\n`);

    return { success: true, email };
}

export default function Login() {
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#f0f9ff] font-sans relative overflow-hidden">
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-100/40 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-sky-100/40 rounded-full blur-[120px]" />

            <div className="w-full max-w-sm space-y-16 text-center relative z-10 p-8">
                <header className="animate-in fade-in slide-in-from-top-4 duration-1000">
                    <div className="w-16 h-16 bg-sky-400 rounded-2xl flex items-center justify-center mx-auto mb-10 shadow-xl shadow-sky-200 rotate-6">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                    </div>
                    <h1 className="text-5xl font-serif font-light text-slate-800 mb-6 tracking-tight">
                        Gratitude
                    </h1>
                    <p className="text-sky-400 font-sans tracking-[0.3em] text-[10px] uppercase font-bold">
                        A peaceful space for your story
                    </p>
                </header>

                {actionData?.success ? (
                    <div className="glass-card p-12 rounded-[2.5rem] animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <p className="text-slate-600 mb-8 italic leading-relaxed text-lg font-light">
                            We've sent a secure portal link to <br />
                            <span className="text-sky-500 font-sans not-italic font-bold tracking-tight">{actionData.email}</span>
                        </p>
                        <p className="text-sky-300 font-sans text-[10px] tracking-[0.2em] uppercase font-bold">
                            Check your inbox to begin
                        </p>
                        <div className="mt-10 pt-10 border-t border-sky-100/50">
                            <p className="text-sky-200 font-sans text-[9px] uppercase tracking-widest font-bold">
                                (Link also visible in server console)
                            </p>
                        </div>
                    </div>
                ) : (
                    <Form method="post" className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
                        <div className="relative">
                            <input
                                type="email"
                                name="email"
                                required
                                placeholder="Email Address"
                                className="w-full bg-transparent border-b-2 border-sky-100 py-4 text-center text-xl text-slate-800 placeholder:text-sky-200 focus:outline-none focus:border-sky-400 transition-all duration-500 font-serif italic"
                            />
                            {actionData?.error && (
                                <p className="mt-4 text-[10px] text-rose-400 font-sans uppercase tracking-widest font-bold">{actionData.error}</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-5 px-8 bg-sky-500 text-white rounded-full font-sans text-[10px] uppercase tracking-[0.4em] font-bold hover:bg-sky-600 transition-all duration-500 disabled:opacity-30 shadow-2xl shadow-sky-200 cursor-pointer hover:scale-105 active:scale-95"
                        >
                            {isSubmitting ? "Opening Portal..." : "Enter Your Space"}
                        </button>
                    </Form>
                )}
            </div>
        </div>
    );
}
