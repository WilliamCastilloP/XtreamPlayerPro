"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Deep-link compatibility: Movies catalog is on Home → MOVIES filter. */
export default function MoviesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-[var(--xp-muted)]">
      Opening Movies…
    </div>
  );
}
