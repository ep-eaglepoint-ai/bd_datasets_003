import PomodoroTimer from "../components/PomodoroTimer";

export default function Page() {
  return (
    <main className="min-h-dvh w-full bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <PomodoroTimer />
      </div>
    </main>
  );
}
