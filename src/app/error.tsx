"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Projections unavailable</h1>
      <p className="mt-2 text-[14px] text-muted">Something went wrong building this view. Your saved squad is unaffected.</p>
      {error.digest && <p className="mt-1 font-mono text-[12px] text-muted">Ref {error.digest}</p>}
      <button type="button" onClick={reset} className="mt-4 rounded-xl bg-fg px-4 py-2 text-[14px] font-medium text-white">
        Try again
      </button>
    </div>
  );
}
