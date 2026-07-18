export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="font-[family-name:var(--xp-font-display)] text-3xl font-bold">
        You&apos;re offline
      </h1>
      <p className="mt-3 max-w-sm text-sm text-[var(--xp-muted)]">
        XTREAM needs a connection to reach your playlist server.
        Reconnect and try again.
      </p>
    </div>
  );
}
