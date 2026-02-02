import { useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  name: string;
  active: boolean;
  balanceCents: number;
};

function formatCents(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${dollars.toLocaleString(undefined)}.${String(remainder).padStart(2, "0")}`;
}

function parseMoneyToCents(input: string): number | null {
  const raw = input.trim().replace(/[$,\s]/g, "");
  if (!raw) return null;
  // Disallow floats by parsing as a string -> cents (fixed-point).
  const m = raw.match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!m) return null;
  const dollars = Number(m[1]);
  const centsPart = (m[2] ?? "").padEnd(2, "0");
  const cents = Number(centsPart || "0");
  if (!Number.isSafeInteger(dollars) || !Number.isSafeInteger(cents)) return null;
  return dollars * 100 + cents;
}

type ApiError = { error: { code: string; message: string; details?: unknown } };

function splitCentsEvenly(totalCents: number, count: number) {
  if (!Number.isInteger(totalCents) || totalCents <= 0) return null;
  if (!Number.isInteger(count) || count <= 0) return null;
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  const shares = Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
  const sum = shares.reduce((a, b) => a + b, 0);
  return sum === totalCents ? shares : null;
}

function messageFromApiError(e: unknown): string {
  const err = e as Partial<ApiError> | undefined;
  const code = err?.error?.code;
  if (code === "INSUFFICIENT_FUNDS") return "Insufficient balance to complete this settlement.";
  if (code === "PARTICIPANT_NOT_FOUND") return "One of the selected participants no longer exists.";
  if (code === "PARTICIPANT_INACTIVE") return "One of the selected participants is inactive.";
  if (code === "PAYER_INACTIVE") return "This payer account is inactive.";
  if (code === "INVALID_AMOUNT") return "Enter a valid amount (e.g. 25 or 25.00).";
  if (code === "INVALID_PARTICIPANTS") return "Select at least one participant (payer cannot be included).";
  return err?.error?.message ?? "Settlement failed. Please try again.";
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw (json ?? { error: { code: "HTTP_ERROR", message: "Request failed" } }) as ApiError;
  return json as T;
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw (json ?? { error: { code: "HTTP_ERROR", message: "Request failed" } }) as ApiError;
  return json as T;
}

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [payerId, setPayerId] = useState<string>("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [amountInput, setAmountInput] = useState<string>("25.00");

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const totalCents = useMemo(() => parseMoneyToCents(amountInput), [amountInput]);
  const payer = useMemo(() => users.find((u) => u.id === payerId) ?? null, [users, payerId]);
  const selectedParticipants = useMemo(
    () => users.filter((u) => participantIds.includes(u.id)),
    [users, participantIds],
  );

  const optimisticPayerBalance = useMemo(() => {
    if (!payer || totalCents === null) return null;
    return payer.balanceCents - totalCents;
  }, [payer, totalCents]);

  const insufficient = payer && totalCents !== null ? payer.balanceCents < totalCents : false;
  const split = useMemo(() => {
    if (totalCents === null) return null;
    return splitCentsEvenly(totalCents, participantIds.length);
  }, [totalCents, participantIds.length]);

  const canSubmit =
    !!payer &&
    payer.active &&
    totalCents !== null &&
    totalCents > 0 &&
    participantIds.length > 0 &&
    !participantIds.includes(payer.id) &&
    !insufficient &&
    !submitting;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingUsers(true);
        setUsersError(null);
        const data = await apiGet<{ users: User[] }>("/api/users");
        if (!mounted) return;
        setUsers(data.users);
        const firstActive = data.users.find((u) => u.active);
        if (firstActive) setPayerId(firstActive.id);
      } catch (e) {
        const err = e as ApiError;
        if (!mounted) return;
        setUsersError(err?.error?.message ?? "Failed to load users");
      } finally {
        if (mounted) setLoadingUsers(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Ensure payer is never also a participant (keeps UX consistent when payer changes).
  useEffect(() => {
    if (!payerId) return;
    setParticipantIds((prev) => prev.filter((id) => id !== payerId));
  }, [payerId]);

  function toggleParticipant(id: string) {
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    if (!payer || totalCents === null) return;
    setToast(null);
    setSubmitting(true);

    // Optimistic UI: adjust payer balance immediately in UI state.
    const snapshot = users;
    setUsers((prev) =>
      prev.map((u) => (u.id === payer.id ? { ...u, balanceCents: u.balanceCents - totalCents } : u)),
    );

    try {
      await apiPost("/api/settlements", {
        payerId: payer.id,
        participantIds,
        totalCents,
      });

      // Refresh authoritative balances after success.
      const data = await apiGet<{ users: User[] }>("/api/users");
      setUsers(data.users);
      setParticipantIds([]);
      setToast({ kind: "success", message: "Settlement completed" });
    } catch (e) {
      // Revert optimistic update on error.
      setUsers(snapshot);
      setToast({
        kind: "error",
        message: messageFromApiError(e),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl p-6">
        <header className="mb-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">TrustPay Social Ledger</h1>
              <p className="text-sm text-slate-600">
                Atomic group settlements with fixed-point cents (no floating math).
              </p>
            </div>
          </div>
        </header>

        {toast && (
          <div
            className={[
              "mb-4 rounded-lg border px-4 py-3 text-sm",
              toast.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900",
            ].join(" ")}
          >
            {toast.message}
          </div>
        )}

        <div className="grid gap-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">1) Choose payer</h2>
              {payer && (
                <div className="text-sm text-slate-700">
                  Balance:{" "}
                  <span className={insufficient ? "font-semibold text-rose-700" : "font-semibold text-slate-900"}>
                    {formatCents(payer.balanceCents)}
                  </span>
                  {submitting && totalCents !== null && (
                    <span className="ml-2 text-xs text-slate-500">
                      (optimistic: {formatCents(optimisticPayerBalance ?? payer.balanceCents)})
                    </span>
                  )}
                </div>
              )}
            </div>

            {loadingUsers ? (
              <div className="text-sm text-slate-600">Loading users…</div>
            ) : usersError ? (
              <div className="text-sm text-rose-700">{usersError}</div>
            ) : (
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black focus:border-slate-400 focus:outline-none"
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id} disabled={!u.active}>
                    {u.name} {!u.active ? "(inactive)" : ""} — {formatCents(u.balanceCents)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 text-base font-semibold">2) Select participants</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {users
                .filter((u) => u.id !== payerId)
                .map((u) => {
                  const checked = participantIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className={[
                        "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                        checked ? "border-slate-400 bg-slate-50" : "border-slate-200 bg-white",
                        !u.active ? "opacity-60" : "",
                      ].join(" ")}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!u.active || !payerId}
                          onChange={() => toggleParticipant(u.id)}
                        />
                        <span className="font-medium">{u.name}</span>
                      </span>
                      <span className="text-xs text-slate-600">{formatCents(u.balanceCents)}</span>
                    </label>
                  );
                })}
            </div>
            {participantIds.length === 0 && <div className="mt-2 text-xs text-slate-600">Pick at least one.</div>}
          </div>

          <div className="rounded-xl border bg-white p-4">
            <h2 className="mb-3 text-base font-semibold">3) Enter total amount</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-700">Total (USD)</label>
                <input
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="25.00"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black focus:border-slate-400 focus:outline-none"
                  inputMode="decimal"
                />
                <div className="mt-1 text-xs text-slate-600">
                  {totalCents === null
                    ? "Enter a valid amount like 25, 25.00, or 1,250.99"
                    : `Fixed-point: ${totalCents} cents`}
                </div>
                {insufficient && <div className="mt-1 text-xs text-rose-700">Insufficient balance.</div>}
              </div>
              <button
                onClick={submit}
                disabled={!canSubmit}
                className={[
                  "rounded-lg px-4 py-2 text-sm font-semibold",
                  canSubmit
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : "cursor-not-allowed bg-slate-200 text-slate-500",
                ].join(" ")}
              >
                {submitting ? "Settling…" : "Settle"}
              </button>
            </div>

            {participantIds.length > 0 && totalCents !== null && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Split preview</div>
                  <div className="text-xs text-slate-600">
                    {participantIds.length} participant{participantIds.length === 1 ? "" : "s"} • Total{" "}
                    {formatCents(totalCents)}
                  </div>
                </div>
                {!split ? (
                  <div className="text-xs text-rose-700">Unable to compute a split for this amount.</div>
                ) : (
                  <div className="grid gap-1">
                    {selectedParticipants.map((u, i) => (
                      <div key={u.id} className="flex items-center justify-between text-sm">
                        <div className="text-slate-800">
                          {u.name} {!u.active ? <span className="text-xs text-slate-500">(inactive)</span> : null}
                        </div>
                        <div className="font-medium text-slate-900">{formatCents(split[i] ?? 0)}</div>
                      </div>
                    ))}
                    <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-xs text-slate-600">
                      <div>Payer remaining (pre-check)</div>
                      <div className={insufficient ? "font-semibold text-rose-700" : "font-semibold text-slate-900"}>
                        {payer ? formatCents(payer.balanceCents - totalCents) : "—"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>


      </div>
    </div>
  );
}
