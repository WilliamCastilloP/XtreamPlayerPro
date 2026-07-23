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

/** Near-white gradient + brand X when artwork is missing */
export function PosterPlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--xp-placeholder-from)] to-[var(--xp-placeholder-to)] ${className}`}
    >
      <span
        className="relative grid h-14 w-14 place-items-center rounded-full border-[3.5px] border-[var(--xp-accent)]"
        aria-hidden
      >
        {/* Optical vertical center — display fonts sit high on the em box */}
        <span className="font-[family-name:var(--xp-font-display)] text-[1.65rem] font-extrabold leading-none text-[var(--xp-placeholder-x)] [transform:translateY(0.06em)]">
          X
        </span>
      </span>
    </div>
  );
}
