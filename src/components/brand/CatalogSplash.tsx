"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  exiting?: boolean;
};

/** Netflix-style first-boot splash — logo + looping color anim until ready. */
export function CatalogSplash({ exiting = false }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`xp-catalog-splash ${exiting ? "xp-catalog-splash--out" : "xp-catalog-splash--loop"}`}
      role="status"
      aria-live="polite"
      aria-busy={!exiting}
      aria-label="Loading"
    >
      <div className="xp-catalog-splash__backdrop" aria-hidden />

      <div className="xp-catalog-splash__anim" aria-hidden>
        <div className="xp-catalog-splash__bars">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="xp-catalog-splash__glow" />
      </div>

      <div className="xp-catalog-splash__stage">
        <div className="xp-catalog-splash__logo">
          <span className="inline-block font-[family-name:var(--xp-font-display)] text-4xl font-extrabold tracking-[0.18em] text-white -mr-[0.18em] sm:text-5xl md:text-6xl">
            XTREAM
          </span>
          <span className="xp-catalog-splash__shine" aria-hidden />
        </div>
      </div>
    </div>,
    document.body,
  );
}
