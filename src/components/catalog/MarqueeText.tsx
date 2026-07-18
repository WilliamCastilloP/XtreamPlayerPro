"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  text: string;
  className?: string;
};

/** Scrolls long titles left↔right so the full name can be read */
export function MarqueeText({ text, className = "" }: Props) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const measure = () => {
      const delta = Math.max(0, inner.scrollWidth - outer.clientWidth);
      setDistance(delta);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div ref={outerRef} className={`overflow-hidden whitespace-nowrap ${className}`}>
      <span
        ref={innerRef}
        className={distance > 0 ? "xp-marquee inline-block" : "inline-block"}
        style={
          distance > 0
            ? ({ ["--xp-marquee-x" as string]: `-${distance}px` } as React.CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </div>
  );
}
