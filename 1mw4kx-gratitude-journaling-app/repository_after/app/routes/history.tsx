import { useState, useMemo } from "react";
import { useLoaderData, Link, redirect, type LoaderFunctionArgs } from "react-router";
import { prisma } from "~/utils/prisma.server";
import { getSession } from "~/utils/session.server";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export async function loader({ request }: LoaderFunctionArgs) {
    const session = await getSession(request.headers.get("Cookie"));
    const userIdValue = session.get("userId");
    if (!userIdValue) return redirect("/login");
    const userId = Number(userIdValue);

    const allEntries = await prisma.entry.findMany({
        where: { userId },
        select: { date: true, id: true, item1: true, item2: true, item3: true },
        orderBy: { date: 'desc' },
    });

    return { allEntries };
}

export default function History() {
    const { allEntries } = useLoaderData<typeof loader>();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

    const entryMap = useMemo(() => {
        const map: Record<string, any> = {};
        allEntries.forEach((e: any) => {
            map[new Date(e.date).toDateString()] = e;
        });
        return map;
    }, [allEntries]);

    const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

    const selectedEntry = selectedDate ? entryMap[selectedDate] : null;

    return (
        <div className="min-h-screen bg-[#f0f9ff] py-16 md:py-24 px-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-blue-100/30 rounded-full blur-[120px] -z-10" />

            <div className="max-w-3xl mx-auto relative z-10">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20 animate-in fade-in slide-in-from-top-4 duration-1000">
                    <div>
                        <Link to="/" className="text-sky-300 hover:text-sky-500 transition-colors text-[10px] font-sans uppercase tracking-[0.3em] font-bold flex items-center gap-3 mb-4">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                            Back To Today
                        </Link>
                        <h1 className="text-5xl font-serif font-light text-slate-800 tracking-tight">Your Journey</h1>
                    </div>
                    <div className="flex items-center gap-8 bg-white/50 backdrop-blur-sm px-8 py-4 rounded-full border border-white/60 shadow-lg shadow-sky-200/20">
                        <button onClick={prevMonth} className="text-sky-400 hover:text-sky-600 transition-colors cursor-pointer"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg></button>
                        <span className="font-sans font-bold text-[10px] uppercase tracking-[0.3em] text-slate-500 min-w-[150px] text-center">
                            {currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                        </span>
                        <button onClick={nextMonth} className="text-sky-400 hover:text-sky-600 transition-colors cursor-pointer"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></button>
                    </div>
                </header>

                <section className="bg-white/40 backdrop-blur-md p-8 md:p-14 rounded-[3rem] border border-white/60 shadow-[0_8px_40px_rgba(165,216,255,0.1)] mb-24 animate-in fade-in zoom-in-95 duration-1000 delay-200">
                    <div className="grid grid-cols-7 gap-4 mb-10">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                            <div key={day} className="text-center text-[10px] font-sans text-sky-200 uppercase tracking-[0.2em] font-bold">
                                {day}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-3 md:gap-5 text-center">
                        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                            <div key={`empty-${i}`} className="aspect-square"></div>
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                            const day = i + 1;
                            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                            const dateString = date.toDateString();
                            const hasEntry = !!entryMap[dateString];
                            const isToday = dateString === new Date().toDateString();
                            const isSelected = selectedDate === dateString;

                            return (
                                <button
                                    key={day}
                                    onClick={() => hasEntry ? setSelectedDate(isSelected ? null : dateString) : null}
                                    className={cn(
                                        "aspect-square flex flex-col items-center justify-center rounded-2xl text-sm transition-all duration-500 relative group",
                                        hasEntry
                                            ? "bg-sky-500 text-white shadow-lg shadow-sky-200 cursor-pointer hover:scale-110 active:scale-95 z-10"
                                            : "text-slate-400 bg-sky-50/50 cursor-default",
                                        isSelected && "scale-110 ring-4 ring-sky-300 ring-offset-4 ring-offset-[#f0f9ff]",
                                        isToday && !hasEntry && "border-2 border-sky-300 border-dashed"
                                    )}
                                >
                                    <span className="font-sans font-bold">{day}</span>
                                    {hasEntry && !isSelected && (
                                        <div className="absolute bottom-2.5 w-1.5 h-1.5 bg-white/40 rounded-full"></div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {selectedEntry && (
                    <section className="mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <div className="bg-white/70 backdrop-blur-lg p-12 md:p-16 rounded-[3.5rem] border border-white/60 shadow-[0_20px_60px_rgba(165,216,255,0.2)] relative">
                            <button
                                onClick={() => setSelectedDate(null)}
                                className="absolute top-8 right-10 text-sky-300 hover:text-sky-600 transition-colors cursor-pointer"
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>

                            <h2 className="text-[10px] font-sans uppercase tracking-[0.4em] text-sky-400 font-bold mb-12 italic">
                                Captured on {new Date(selectedEntry.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                            </h2>

                            <div className="space-y-10">
                                {[selectedEntry.item1, selectedEntry.item2, selectedEntry.item3].map((item, i) => (
                                    item && (
                                        <p key={i} className="text-slate-800 italic leading-relaxed text-3xl md:text-4xl font-serif font-light">
                                            "{item}"
                                        </p>
                                    )
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                <section className="space-y-16 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
                    <h2 className="text-[10px] font-sans uppercase tracking-[0.3em] text-sky-300 font-bold mb-8 flex items-center gap-4">
                        <span className="h-px bg-sky-100 flex-grow" />
                        Timeline
                        <span className="h-px bg-sky-100 flex-grow" />
                    </h2>
                    <div className="space-y-10">
                        {allEntries.slice(0, 15).map((entry: any) => (
                            <div key={entry.id} className="group glass-card p-10 rounded-3xl transition-all duration-700 hover:bg-white/60">
                                <p className="text-[10px] font-sans text-sky-400 uppercase tracking-widest font-bold mb-6">
                                    {new Date(entry.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                                <div className="space-y-5">
                                    {[entry.item1, entry.item2, entry.item3].map((item, i) => (
                                        item && (
                                            <p key={i} className="text-slate-700 italic leading-relaxed text-xl font-light">
                                                "{item}"
                                            </p>
                                        )
                                    ))}
                                </div>
                            </div>
                        ))}
                        {allEntries.length === 0 && (
                            <p className="text-sky-300 italic text-center py-20 font-serif text-2xl">Your story awaits its first words...</p>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
