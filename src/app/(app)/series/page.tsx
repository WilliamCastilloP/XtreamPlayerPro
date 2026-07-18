"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Deep-link compatibility: Series catalog is on Home → SERIES filter. */
export default function SeriesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-[var(--xp-muted)]">
      Opening Series…
    </div>
  );
}
