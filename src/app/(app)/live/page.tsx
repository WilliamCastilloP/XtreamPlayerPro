"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Deep-link compatibility: Live now lives on Home with the LIVE filter. */
export default function LiveRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-[var(--xp-muted)]">
      Opening Live…
    </div>
  );
}
