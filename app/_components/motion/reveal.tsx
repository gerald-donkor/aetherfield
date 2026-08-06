"use client";

import { useRef } from "react";
import { DUR, EASE, gsap, useGSAP } from "./register";

type RevealProps = {
  /** Element to render. Defaults to a plain `div`. */
  as?:
    | "div"
    | "section"
    | "ul"
    | "li"
    | "header"
    | "figure"
    | "h2"
    | "table";
  /** Animate `[data-reveal-item]` descendants in document order, not the box. */
  stagger?: boolean;
  /** Seconds before the sequence starts. */
  delay?: number;
  /** ScrollTrigger `start`. Ignored when `immediate`. */
  start?: string;
  /** Rise distance in px at desktop. Mobile uses two thirds of it. */
  y?: number;
  /** Play on load rather than on scroll — the hero, which is above the fold. */
  immediate?: boolean;
  /** Taken over from the wrapper being replaced, so no extra box is added. */
  className?: string;
  children: React.ReactNode;
};

/**
 * The homepage's one reveal: fade in and rise, once, on enter.
 *
 * Two shapes, both driven from the same tween vars:
 *
 *     <Reveal>          animates itself
 *     <Reveal stagger>  animates its [data-reveal-item] descendants in order
 *
 * `children` arrive as a prop, so the sections passed in stay **server**
 * components and their `next/image` usage never reaches the client bundle —
 * the discipline `chrome.tsx` already follows by inlining `CONTAINER` rather
 * than importing it.
 *
 * The hidden start state is a CSS rule in `globals.css`, not something set
 * here, so the prerendered page never flashes its finished state. That is also
 * why no tween may `clearProps` opacity.
 */
export function Reveal({
  as: Tag = "div",
  stagger = false,
  delay = 0,
  start = "top 88%",
  y,
  immediate = false,
  className,
  children,
}: RevealProps) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          isDesktop: "(min-width: 1024px)",
          isMobile: "(max-width: 1023px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { isDesktop, reduceMotion } = context.conditions as {
            isDesktop: boolean;
            reduceMotion: boolean;
          };

          const targets = stagger
            ? gsap.utils.toArray<HTMLElement>("[data-reveal-item]")
            : [root.current as HTMLElement];
          if (!targets.length) return;

          // Reduced motion still has to *land* the elements — never leave them
          // hidden. The CSS start state is gated on `no-preference`, so this is
          // belt and braces for a browser that does not support the query.
          if (reduceMotion) {
            gsap.set(targets, { opacity: 1, y: 0 });
            return;
          }

          // The recording's mobile pass travels a visibly shorter distance,
          // which is also right for a 375 viewport.
          const rise = y ?? 36;
          gsap.fromTo(
            targets,
            { opacity: 0, y: isDesktop ? rise : Math.round(rise * 0.66) },
            {
              opacity: 1,
              y: 0,
              duration: DUR,
              ease: EASE,
              delay,
              stagger: 0.08,
              scrollTrigger: immediate
                ? undefined
                : { trigger: root.current, start, once: true },
            },
          );
        },
        root,
      );

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <Tag
      ref={root as React.Ref<never>}
      className={className}
      {...(stagger ? {} : { "data-reveal": "" })}
    >
      {children}
    </Tag>
  );
}
