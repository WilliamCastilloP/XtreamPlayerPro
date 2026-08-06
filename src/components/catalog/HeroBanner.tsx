"use client";

import Link from "next/link";
import { useState } from "react";
import { Info, Play } from "lucide-react";
import { PosterPlaceholder } from "@/components/brand/BrandMark";
import { APP_CONTENT } from "@/components/layout/AppTopBar";
import { useLocale } from "@/components/providers/LocaleProvider";

type Props = {
  title: string;
  subtitle?: string;
  image?: string;
  playHref: string;
  infoHref?: string;
  eyebrow?: string;
  /** Full-bleed under transparent header (all breakpoints) */
  underHeader?: boolean;
  /**
   * Zoom the cover so baked-in letterbox/black bars (common on live channel art)
   * are cropped and the image fills the banner edge-to-edge.
   */
  cropLetterbox?: boolean;
};

export function HeroBanner({
  title,
  subtitle,
  image,
  playHref,
  infoHref,
  eyebrow = "Featured",
  underHeader = false,
  cropLetterbox = false,
}: Props) {
  const { t } = useLocale();
  const [imgFailed, setImgFailed] = useState(false);
  const src = image?.trim();
  const showImage = Boolean(src) && !imgFailed;

  return (
    <section className="xp-fade-in relative w-full overflow-hidden">
      <div
        className={`relative w-full bg-[var(--xp-surface)] ${
          underHeader
            ? "aspect-[16/11] min-h-[30rem] sm:aspect-[21/9] sm:min-h-[32rem] lg:min-h-[70vh]"
            : "aspect-[16/10] sm:aspect-[21/9]"
        }`}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover ${
              cropLetterbox ? "scale-[1.2]" : ""
            }`}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <PosterPlaceholder className="absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--xp-ink)] via-[rgba(11,15,20,0.45)] to-transparent" />
        {underHeader ? (
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent" />
        ) : null}

        <div className={`absolute inset-x-0 bottom-0 ${APP_CONTENT}`}>
          <div className="max-w-3xl space-y-3 py-4 sm:py-6 lg:max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--xp-accent)]">
              {eyebrow}
            </p>
            <h2
              title={title}
              className="font-[family-name:var(--xp-font-display)] text-2xl font-bold leading-tight text-white sm:text-3xl md:text-4xl"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="line-clamp-2 max-w-2xl text-sm text-white/75 sm:line-clamp-none">
                {subtitle}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href={playHref}
                className="xp-btn xp-btn-primary min-w-[7.5rem]"
              >
                <Play className="h-4 w-4 fill-current" />
                {t("play")}
              </Link>
              {infoHref ? (
                <Link
                  href={infoHref}
                  className="xp-btn xp-btn-ghost min-w-[7.5rem]"
                >
                  <Info className="h-4 w-4" />
                  {t("details")}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
