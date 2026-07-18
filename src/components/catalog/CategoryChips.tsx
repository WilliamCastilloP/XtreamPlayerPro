"use client";

import type { XtreamCategory } from "@/lib/xtream/types";

type Props = {
  categories: XtreamCategory[];
  activeId: string | null;
  onChange: (id: string | null) => void;
  allLabel?: string;
};

export function CategoryChips({
  categories,
  activeId,
  onChange,
  allLabel = "All",
}: Props) {
  return (
    <div className="xp-fade-in flex gap-2 overflow-x-auto px-4 pb-3 pt-1 scrollbar-none md:px-6">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
          activeId === null
            ? "bg-[var(--xp-accent)] text-[var(--xp-ink)]"
            : "bg-[var(--xp-surface)] text-[var(--xp-muted)] hover:text-[var(--xp-text)]"
        }`}
      >
        {allLabel}
      </button>
      {categories.map((cat) => (
        <button
          key={cat.category_id}
          type="button"
          onClick={() => onChange(cat.category_id)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
            activeId === cat.category_id
              ? "bg-[var(--xp-accent)] text-[var(--xp-ink)]"
              : "bg-[var(--xp-surface)] text-[var(--xp-muted)] hover:text-[var(--xp-text)]"
          }`}
        >
          {cat.category_name}
        </button>
      ))}
    </div>
  );
}
