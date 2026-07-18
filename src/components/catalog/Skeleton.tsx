export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`xp-shimmer ${className}`} />;
}

export function PosterSkeletonRow({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden px-4 md:px-6">
      {Array.from({ length: count }).map((_, i) => (
        <Shimmer
          key={i}
          className="h-44 w-28 shrink-0 rounded-xl md:h-52 md:w-36"
        />
      ))}
    </div>
  );
}

export function ChannelSkeletonList({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-2 px-4 md:px-6">
      {Array.from({ length: count }).map((_, i) => (
        <Shimmer key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}
