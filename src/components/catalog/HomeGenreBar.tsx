"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CategorySelect } from "@/components/catalog/CategorySelect";
import type { BrowseKind } from "@/components/catalog/BrowseRails";
import { APP_GUTTER } from "@/components/layout/AppTopBar";

type Props = {
  /** Force a kind (e.g. from parent section). If omitted, reads ?section=. */
  kind?: BrowseKind;
  className?: string;
};

function parseSection(value: string | null): BrowseKind | null {
  if (value === "live" || value === "movies" || value === "series") return value;
  return null;
}

function HomeGenreBarInner({ kind, className = "" }: Props) {
  const searchParams = useSearchParams();
  const section = kind ?? parseSection(searchParams.get("section"));

  if (!section) return null;

  return (
    <div className={`flex justify-start ${APP_GUTTER} ${className}`}>
      <CategorySelect kind={section} className="w-full max-w-sm" />
    </div>
  );
}

/** Genre/category dropdown after the hero — left-aligned on all breakpoints. */
export function HomeGenreBar({ kind, className }: Props) {
  return (
    <Suspense fallback={null}>
      <HomeGenreBarInner kind={kind} className={className} />
    </Suspense>
  );
}
