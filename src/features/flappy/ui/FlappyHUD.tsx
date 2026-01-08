type FlappyStatus = "playing" | "gameover";

interface Props {
  score: number;
  status: FlappyStatus;
  onRestart: () => void;
  onConnect?: () => void;
  connected?: boolean;
  walletLabel?: string | null;
  lastRun?: { score: number; durationMs: number } | null;
}

export function FlappyHUD({
  score,
  status,
  onRestart,
  onConnect,
  connected,
  walletLabel,
  lastRun,
}: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="rounded-2xl border border-sky-400/40 bg-slate-900/70 px-4 py-2 text-lg font-semibold text-sky-100 shadow-[0_0_30px_rgba(56,189,248,0.25)] backdrop-blur">
          Score: <span className="text-emerald-300 font-bold">{score}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.35)] backdrop-blur">
            Space / Tap to flap
          </div>
          <div className="rounded-full border border-sky-500/35 bg-slate-950/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-100 shadow-[0_0_18px_rgba(14,165,233,0.35)] backdrop-blur">
            {connected && walletLabel ? walletLabel : "Guest"}
          </div>
        </div>
      </div>

      <div className="flex justify-center pb-3">
        {status === "gameover" ? (
          <div className="flex flex-col items-center gap-2">
            {lastRun ? (
              <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.25)]">
                Last run: {lastRun.score} pts · {(lastRun.durationMs / 1000).toFixed(1)}s
              </div>
            ) : null}
            <button
              type="button"
              className="pointer-events-auto rounded-full bg-gradient-to-r from-sky-500 via-fuchsia-500 to-amber-400 px-6 py-2 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-[0_12px_35px_rgba(56,189,248,0.35)] transition hover:scale-[1.04] focus:outline-none focus:ring-2 focus:ring-fuchsia-300"
              onClick={onRestart}
            >
              Restart Run
            </button>
          </div>
        ) : (
          <div className="rounded-full bg-slate-900/70 px-4 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-100 shadow-[0_0_20px_rgba(79,70,229,0.25)]">
            Stay alive. Thread the neon pylons.
          </div>
        )}
      </div>

      {status === "gameover" && !connected && onConnect && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto rounded-2xl border border-sky-500/40 bg-slate-950/85 px-5 py-4 shadow-[0_18px_45px_rgba(56,189,248,0.28)] backdrop-blur">
            <p className="mb-3 text-center text-sm font-semibold text-sky-100">Connect wallet to save score</p>
            <button
              type="button"
              className="w-full rounded-full bg-gradient-to-r from-sky-500 via-fuchsia-500 to-amber-400 px-4 py-2 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-[0_8px_28px_rgba(56,189,248,0.35)] transition hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-fuchsia-300"
              onClick={onConnect}
            >
              Connect wallet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
