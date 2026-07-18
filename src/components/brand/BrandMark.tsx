import Link from "next/link";

type Props = {
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-3xl",
};

export function BrandMark({ href = "/", size = "md", className = "" }: Props) {
  const content = (
    <span
      className={`font-[family-name:var(--xp-font-display)] font-extrabold tracking-[0.12em] text-[var(--xp-text)] ${sizes[size]} ${className}`}
    >
      XTREAM
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} className="inline-flex items-center">
      {content}
    </Link>
  );
}

/** Green circled X used when artwork is missing */
export function PosterPlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--xp-surface)] to-[var(--xp-ink)] ${className}`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--xp-accent)] text-xl font-bold text-[var(--xp-accent)]">
        X
      </span>
    </div>
  );
}
