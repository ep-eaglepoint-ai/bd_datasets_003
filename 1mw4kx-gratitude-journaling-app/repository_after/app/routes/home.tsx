import { useFetcher, useLoaderData, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { useEffect, useState, useRef } from "react";
import { prisma } from "~/utils/prisma.server";
import { getSession } from "~/utils/session.server";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ALL_PROMPTS = [
  "Something that made you smile today...",
  "A person you're grateful for...",
  "A small win or accomplishment...",
  "Something beautiful you saw...",
  "A comfort you're thankful for...",
  "A challenge you're grateful for overcoming...",
  "Something you're looking forward to...",
  "A kind word someone said to you...",
  "A food or drink you enjoyed...",
  "A habit you're proud of...",
];

function getDailyPrompts(date: Date) {
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const seed = dayOfYear + date.getFullYear();
  const prompts = [...ALL_PROMPTS].sort((a, b) => {
    const hash = (s: string) => s.split("").reduce((a, b) => (a << 5) - a + b.charCodeAt(0), 0);
    return hash(a + seed) - hash(b + seed);
  });
  return prompts.slice(0, 3);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const userIdValue = session.get("userId");

  if (!userIdValue) return redirect("/login");
  const userId = Number(userIdValue);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const entry = await prisma.entry.findUnique({
    where: { userId_date: { userId, date: today } },
  });

  const pastEntries = await prisma.entry.findMany({
    where: { userId, date: { not: today } },
    orderBy: { date: 'desc' }
  });

  const onThisDay = pastEntries.find((e: any) => {
    const d = new Date(e.date);
    return d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate() &&
      d.getFullYear() === today.getFullYear() - 1;
  }) || null;

  const prompts = getDailyPrompts(today);

  return { entry, prompts, onThisDay };
}

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const userIdValue = session.get("userId");
  if (!userIdValue) return redirect("/login");
  const userId = Number(userIdValue);

  const formData = await request.formData();
  const item1 = formData.get("item1") as string;
  const item2 = formData.get("item2") as string;
  const item3 = formData.get("item3") as string;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    await prisma.entry.upsert({
      where: { userId_date: { userId, date: today } },
      update: { item1, item2, item3 },
      create: { userId, date: today, item1, item2, item3 },
    });
  } catch (error) {
    return { success: false };
  }
  return { success: true };
}

export default function Home() {
  const { entry, prompts, onThisDay } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const [items, setItems] = useState({
    item1: entry?.item1 || "",
    item2: entry?.item2 || "",
    item3: entry?.item3 || "",
  });

  const [isPendingDebounce, setIsPendingDebounce] = useState(false);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const hasChanges =
      items.item1 !== (entry?.item1 || "") ||
      items.item2 !== (entry?.item2 || "") ||
      items.item3 !== (entry?.item3 || "");

    if (!hasChanges) {
      setIsPendingDebounce(false);
      return;
    }

    setIsPendingDebounce(true);
    const timer = setTimeout(() => {
      const formData = new FormData();
      formData.append("item1", items.item1);
      formData.append("item2", items.item2);
      formData.append("item3", items.item3);
      fetcher.submit(formData, { method: "post" });
      setIsPendingDebounce(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, [items, entry, fetcher]);

  const completedCount = [items.item1, items.item2, items.item3].filter(i => i.trim().length > 0).length;
  const isSaving = fetcher.state !== "idle" || isPendingDebounce;

  return (
    <div className="min-h-screen bg-[#f0f9ff] relative overflow-hidden flex flex-col items-center py-16 md:py-24 px-6">
      {/* Interactive Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-sky-200/30 rounded-full blur-[120px] animate-float" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-100/40 rounded-full blur-[120px] animate-float-delayed" />

      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center">
        <header className="mb-20 text-center animate-in fade-in slide-in-from-top-6 duration-1000">
          <div className="inline-block px-4 py-1.5 mb-6 rounded-full bg-sky-100/50 border border-sky-200/50 text-sky-600 font-sans text-[10px] uppercase tracking-widest font-bold">
            Daily Reflection
          </div>
          <h1 className="text-5xl md:text-6xl font-serif font-light text-slate-800 mb-6 tracking-tight">
            Today I am grateful...
          </h1>
          <p className="text-slate-400 font-sans tracking-[0.2em] uppercase text-[10px] font-bold">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </header>

        {/* Progress Indicator */}
        <div className="mb-16 flex items-center gap-4 animate-in fade-in zoom-in-95 duration-1000 delay-300">
          <div className="h-1 w-48 bg-sky-100 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-1000 ease-out",
                completedCount === 3 ? "bg-emerald-400 animate-pulse shadow-[0_0_15px_rgba(52,211,153,0.6)]" : "bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.4)]"
              )}
              style={{ width: `${(completedCount / 3) * 100}%` }}
            />
          </div>
          <span className={cn(
            "text-[10px] font-sans font-bold uppercase tracking-widest transition-colors duration-500",
            completedCount === 3 ? "text-emerald-500" : "text-sky-400"
          )}>
            {completedCount === 3 ? "Journey Complete" : `${completedCount}/3 Moments`}
          </span>
        </div>

        <div className="w-full space-y-12 mb-24">
          {[1, 2, 3].map((num, idx) => {
            const itemKey = `item${num}` as keyof typeof items;
            const isFilled = items[itemKey].trim().length > 0;
            return (
              <div
                key={num}
                className={cn(
                  "group relative transition-all duration-500",
                  isFilled ? "opacity-100" : "opacity-60 hover:opacity-100"
                )}
              >
                <span className={cn(
                  "absolute -left-12 top-2 font-serif text-3xl italic font-light transition-all duration-500",
                  isFilled ? "text-sky-400 scale-110" : "text-sky-200"
                )}>
                  {num}.
                </span>
                <textarea
                  placeholder={prompts[idx]}
                  value={items[itemKey]}
                  onChange={(e) => setItems({ ...items, [itemKey]: e.target.value })}
                  className={cn(
                    "w-full bg-transparent border-b-2 py-3 px-0",
                    "text-2xl md:text-3xl font-serif text-slate-800 placeholder:text-sky-200/60",
                    "focus:outline-none focus:shadow-[0_4px_20px_rgba(125,211,252,0.2)] transition-all duration-700",
                    isFilled ? "border-sky-200" : "border-sky-100 focus:border-sky-300",
                    "resize-none overflow-hidden min-h-[4rem] leading-relaxed"
                  )}
                  rows={1}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = `${target.scrollHeight}px`;
                  }}
                  ref={(el) => {
                    if (el) {
                      el.style.height = "auto";
                      el.style.height = `${el.scrollHeight}px`;
                    }
                  }}
                />
                {isFilled && (
                  <div className="absolute right-0 top-4 animate-in fade-in zoom-in-0 duration-500">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7dd3fc" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {onThisDay && (
          <section className="mb-24 w-full animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="glass-card p-10 rounded-[2.5rem] relative overflow-hidden group hover:bg-white/60 transition-colors duration-700">
              <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-125 transition-transform duration-1000">
                <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" /><path d="M3 10h18" /><path d="M15 2v4" /><path d="M7 2v4" /><path d="m21 21-3-3" /><path d="M16.5 14.5a2.5 2.5 0 0 0-2.5 2.5c0 1.5 1.5 2.5 2.5 2.5a2.5 2.5 0 0 0 2.5-2.5c0-1.5-1.5-2.5-2.5-2.5z" /></svg>
              </div>
              <p className="text-sky-400 font-sans text-[10px] tracking-[0.3em] uppercase font-bold mb-8">
                On This Day, {new Date(onThisDay.date).getFullYear()}
              </p>
              <ul className="space-y-6">
                {[onThisDay.item1, onThisDay.item2, onThisDay.item3].map((item, i) => (
                  item && (
                    <li key={i} className="text-slate-700 italic leading-relaxed text-xl md:text-2xl font-light">
                      "{item}"
                    </li>
                  )
                ))}
              </ul>
            </div>
          </section>
        )}

        <nav className="mt-12 mb-24 flex gap-12 text-sky-400 font-sans text-[10px] uppercase tracking-[0.3em] font-bold">
          <a href="/history" className="hover:text-sky-600 transition-all border-b border-transparent hover:border-sky-600 pb-1">Journey</a>
          <a href="/stats" className="hover:text-sky-600 transition-all border-b border-transparent hover:border-sky-600 pb-1">Insights</a>
          <form action="/logout" method="post" className="inline">
            <button type="submit" className="hover:text-sky-600 transition-all border-b border-transparent hover:border-sky-600 pb-1 cursor-pointer">Exit</button>
          </form>
        </nav>
      </div>

      {/* Persistence Feedback */}
      <div className={cn(
        "fixed bottom-12 right-12 flex items-center gap-3 transition-all duration-1000",
        isSaving ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      )}>
        <div className="w-2 h-2 bg-sky-400 rounded-full animate-pulse shadow-[0_0_8px_#7dd3fc]" />
        <span className="text-sky-400 text-[9px] font-sans tracking-[0.2em] uppercase font-bold">
          {isPendingDebounce ? "Thinking" : "Preserving"}
        </span>
      </div>
    </div>
  );
}
