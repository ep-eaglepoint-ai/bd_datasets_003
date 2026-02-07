import { useLoaderData, Link, redirect, type LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { prisma } from "~/utils/prisma.server";
import { getSession } from "~/utils/session.server";

const STOP_WORDS = new Set(["the", "and", "a", "to", "of", "in", "is", "it", "for", "with", "my", "was", "on", "that", "i", "at", "by", "as", "be", "this", "are", "have", "you", "not", "he", "she", "but", "they", "we", "we're", "i'm", "me", "so", "up", "out", "very", "all"]);

export async function loader({ request }: LoaderFunctionArgs) {
    const session = await getSession(request.headers.get("Cookie"));
    const userIdValue = session.get("userId");
    if (!userIdValue) return redirect("/login");
    const userId = Number(userIdValue);

    const allEntries = await prisma.entry.findMany({
        where: { userId },
        orderBy: { date: "desc" },
    });

    // Calculate Streaks
    let currentStreak = 0;
    let longestStreak = 0;
    let totalItems = 0;

    if (allEntries.length > 0) {
        // Convert dates and sort ascending
        const entries = allEntries
            .map((e: any) => ({ ...e, date: new Date(e.date) }))
            .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

        let tempStreak = 1;

        for (let i = 1; i < entries.length; i++) {
            const prev = new Date(entries[i - 1].date);
            prev.setHours(0, 0, 0, 0);
            const curr = new Date(entries[i].date);
            curr.setHours(0, 0, 0, 0);

            const diff = Math.floor((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

            if (diff === 1) {
                tempStreak++;
            } else if (diff > 1) {
                longestStreak = Math.max(longestStreak, tempStreak);
                tempStreak = 1;
            }
        }

        longestStreak = Math.max(longestStreak, tempStreak);

        // Current streak: check last entry relative to today
        const lastEntryDate = new Date(entries[entries.length - 1].date);
        lastEntryDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffToToday = Math.floor((today.getTime() - lastEntryDate.getTime()) / (1000 * 60 * 60 * 24));
        currentStreak = diffToToday <= 1 ? tempStreak : 0;

        // Total items
        totalItems = entries.reduce(
            (acc: number, curr: any) =>
                acc + (curr.item1 ? 1 : 0) + (curr.item2 ? 1 : 0) + (curr.item3 ? 1 : 0),
            0
        );
    }

    // Word Frequencies and Map
    const wordCounts: Record<string, number> = {};
    const wordToEntries: Record<string, any[]> = {};

    allEntries.forEach((entry: any) => {
        [entry.item1, entry.item2, entry.item3].forEach((text: any) => {
            if (!text) return;
            const tokens = text.toLowerCase().match(/\b(\w+)\b/g);
            if (tokens) {
                const uniqueTokens = new Set<string>(tokens);
                uniqueTokens.forEach((word: string) => {
                    if (word.length > 2 && !STOP_WORDS.has(word)) {
                        wordCounts[word] = (wordCounts[word] || 0) + 1;
                        if (!wordToEntries[word]) wordToEntries[word] = [];
                        if (!wordToEntries[word].some((e: any) => e.id === entry.id)) {
                            wordToEntries[word].push(entry);
                        }
                    }
                });
            }
        });
    });

    const topWords = Object.entries(wordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30);

    // Heatmap Data (Last 52 weeks)
    const heatmap = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entryDates = new Set(allEntries.map((e: any) => new Date(e.date).toDateString()));

    for (let i = 364; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        heatmap.push({
            date: d.toISOString(),
            hasEntry: entryDates.has(d.toDateString())
        });
    }

    return { currentStreak, longestStreak, totalItems, topWords, heatmap, wordToEntries };
}

export default function Stats() {
    const { currentStreak, longestStreak, totalItems, topWords, heatmap, wordToEntries } = useLoaderData<typeof loader>();
    const [selectedWord, setSelectedWord] = useState<string | null>(null);

    return (
        <div className="min-h-screen bg-[#f0f9ff] font-sans py-16 md:py-24 px-6 relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100/30 rounded-full blur-[120px] -z-10" />

            <div className="max-w-4xl mx-auto relative z-10">
                <header className="mb-20 animate-in fade-in slide-in-from-top-4 duration-1000">
                    <Link to="/" className="text-sky-300 hover:text-sky-500 transition-colors text-[10px] font-sans uppercase tracking-[0.3em] font-bold flex items-center gap-3 mb-6">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                        Back
                    </Link>
                    <h1 className="text-5xl font-serif font-light text-slate-800 tracking-tight">Insights</h1>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                    <div className="glass-card p-12 rounded-[2.5rem] text-center group transition-all duration-700 hover:bg-white hover:shadow-xl hover:shadow-sky-200/40">
                        <p className="text-6xl font-serif font-light text-sky-500 mb-3 transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-3">{currentStreak}</p>
                        <p className="text-slate-400 font-sans text-[10px] uppercase tracking-[0.3em] font-bold">Current Streak</p>
                    </div>
                    <div className="glass-card p-12 rounded-[2.5rem] text-center group transition-all duration-700 hover:bg-white hover:shadow-xl hover:shadow-sky-200/40">
                        <p className="text-6xl font-serif font-light text-sky-500 mb-3 transition-transform duration-700 group-hover:scale-110 group-hover:rotate-3">{longestStreak}</p>
                        <p className="text-slate-400 font-sans text-[10px] uppercase tracking-[0.3em] font-bold">Best Streak</p>
                    </div>
                    <div className="glass-card p-12 rounded-[2.5rem] text-center group transition-all duration-700 hover:bg-white hover:shadow-xl hover:shadow-sky-200/40">
                        <p className="text-6xl font-serif font-light text-sky-500 mb-3 transition-transform duration-700 group-hover:scale-110">{totalItems}</p>
                        <p className="text-slate-400 font-sans text-[10px] uppercase tracking-[0.3em] font-bold">Total Moments</p>
                    </div>
                </div>

                <section className="glass-card p-10 md:p-14 rounded-[3.5rem] mb-20 animate-in fade-in duration-1000 delay-400">
                    <h2 className="text-[10px] font-sans uppercase tracking-[0.4em] text-sky-400 font-bold mb-10 flex items-center gap-4">
                        Consistency
                        <span className="h-px bg-sky-100 flex-grow" />
                    </h2>
                    <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                        {heatmap.map((day, i) => (
                            <div
                                key={i}
                                title={new Date(day.date).toDateString()}
                                className={`w-3.5 h-3.5 md:w-4.5 md:h-4.5 rounded-[3px] transition-all duration-500 ${day.hasEntry
                                    ? 'bg-sky-500 shadow-[0_0_12px_rgba(14,165,233,0.3)] scale-110'
                                    : 'bg-sky-50'
                                    } hover:scale-150 hover:z-10 hover:rotate-12 cursor-help`}
                            />
                        ))}
                    </div>
                    <div className="mt-8 flex items-center justify-between text-[10px] text-sky-300 font-sans uppercase tracking-[0.2em] font-bold">
                        <span>One Year Ago</span>
                        <span>Today</span>
                    </div>
                </section>

                <section className="glass-card p-12 md:p-20 rounded-[4rem] mb-20 animate-in fade-in zoom-in-95 duration-1000 delay-500">
                    <h2 className="text-[10px] font-sans uppercase tracking-[0.4em] text-sky-400 font-bold mb-16 text-center">Your Recurrent Themes</h2>
                    <p className="text-center text-sky-300 text-[10px] font-sans mb-12 uppercase tracking-widest font-bold">Tap a theme to relive the memories</p>
                    <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-12 mb-16">
                        {topWords.length > 0 ? (
                            topWords.map(([word, count]) => {
                                const fontSize = Math.max(1, Math.min(3.5, 1 + (count / 4)));
                                const opacity = Math.min(1, 0.3 + (count / 8));
                                return (
                                    <button
                                        key={word}
                                        onClick={() => setSelectedWord(selectedWord === word ? null : word)}
                                        style={{ fontSize: `${fontSize}rem`, opacity }}
                                        className={`text-slate-800 hover:text-sky-500 transition-all duration-700 cursor-pointer select-none hover:scale-125 inline-block font-serif font-light tracking-tighter ${selectedWord === word ? 'text-sky-500 opacity-100 scale-125 z-20 translate-y-[-10px]' : ''}`}
                                    >
                                        {word}
                                    </button>
                                );
                            })
                        ) : (
                            <p className="text-sky-300 italic font-serif text-2xl">Your garden of themes is still growing...</p>
                        )}
                    </div>

                    {selectedWord && (
                        <div className="mt-12 p-10 bg-sky-50/50 rounded-[2.5rem] border border-sky-100 animate-in fade-in slide-in-from-bottom-6 duration-700">
                            <div className="flex items-center justify-between mb-10">
                                <h3 className="text-[10px] font-sans uppercase tracking-[0.3em] text-sky-400 font-bold">Reliving "{selectedWord}"</h3>
                                <button onClick={() => setSelectedWord(null)} className="text-sky-400/50 hover:text-sky-500 transition-colors cursor-pointer">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                </button>
                            </div>
                            <div className="space-y-10">
                                {wordToEntries[selectedWord].map((entry) => (
                                    <div key={entry.id} className="group">
                                        <p className="text-[9px] font-sans text-sky-300 uppercase tracking-widest font-bold mb-4">
                                            {new Date(entry.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                                        </p>
                                        <div className="space-y-4">
                                            {[entry.item1, entry.item2, entry.item3].map((item, i) => (
                                                item && item.toLowerCase().includes(selectedWord.toLowerCase()) && (
                                                    <p key={i} className="text-slate-800 italic leading-relaxed text-2xl font-serif font-light border-l-4 border-sky-200 pl-8 py-2">
                                                        "{item}"
                                                    </p>
                                                )
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                <footer className="text-center py-20 animate-in fade-in duration-1000 delay-1000">
                    <p className="text-sky-200 font-serif italic text-2xl leading-relaxed max-w-2xl mx-auto opacity-60">
                        "Gratitude turns what we have into enough, and more. It turns denial into acceptance, chaos into order, confusion into clarity..."
                    </p>
                </footer>
            </div>
        </div>
    );
}