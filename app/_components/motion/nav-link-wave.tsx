"use client";

import { useRef, type ReactNode } from "react";
import { EASE, gsap, SplitText, useGSAP } from "./register";

const CHAR_DUR = 0.04;
const CHAR_STAGGER = 0.02;
const Y = 12;

/**
 * Renders the desktop navigation itself so the character treatment adds no
 * layout box. Each link owns one paused animation which both pointer boundaries
 * replay from the start; event callbacks never create GSAP objects.
 */
export function NavLinkWave({
  className,
  label,
  children,
}: {
  className?: string;
  /** The auth-aware final label; changing it rebuilds every split safely. */
  label: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          isDesktop: "(min-width: 48rem)",
          canHover: "(hover: hover)",
          finePointer: "(pointer: fine)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
          fullMotion: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const { isDesktop, canHover, finePointer, fullMotion } =
            context.conditions as {
              isDesktop: boolean;
              canHover: boolean;
              finePointer: boolean;
              fullMotion: boolean;
            };
          const nav = root.current;

          if (
            !nav ||
            !isDesktop ||
            !canHover ||
            !finePointer ||
            !fullMotion
          )
            return;

          const removers: Array<() => void> = [];

          nav.querySelectorAll<HTMLElement>("[data-nav-wave]").forEach((link) => {
            const ignored = link.querySelectorAll("svg[aria-hidden]");
            const split = SplitText.create(link, {
              type: "chars",
              smartWrap: true,
              tag: "span",
              aria: "auto",
              ignore: ignored,
              // A normal collapsible space becomes a zero-width anonymous item
              // once SplitText turns the surrounding words into flex children.
              // Preserve the authored word gap without making whitespace an
              // animated character.
              wordDelimiter: { delimiter: " ", replaceWith: "\u00a0" },
            });

            // SplitText keeps an ignored element intact, but when it directly
            // follows text it nests that element in the final smart-wrap span.
            // Put the CTA arrow back beside the split label so its existing
            // 6px margin and hover travel keep the settled LinkButton geometry.
            ignored.forEach((element) => link.append(element));

            // SplitText's span wrappers otherwise compute to ordinary inline
            // boxes, which accept GSAP's transform matrix without painting it.
            // Keep the glyphs in inline flow while making that matrix visible.
            gsap.set(split.chars, { display: "inline-block" });

            const timeline = gsap.timeline({ paused: true });
            timeline
              .fromTo(
                split.chars,
                { y: 0, rotation: 0 },
                {
                  keyframes: [
                    { y: -Y, rotation: 90, duration: CHAR_DUR, ease: EASE },
                    { y: 0, rotation: 180, duration: CHAR_DUR, ease: EASE },
                    { y: Y, rotation: 270, duration: CHAR_DUR, ease: EASE },
                    { y: 0, rotation: 360, duration: CHAR_DUR, ease: EASE },
                  ],
                  stagger: { each: CHAR_STAGGER, from: "start" },
                  transformOrigin: "50% 50%",
                  immediateRender: false,
                },
              )
              .set(split.chars, { y: 0, rotation: 0 });

            const replay = () => timeline.restart();
            link.addEventListener("pointerenter", replay);
            link.addEventListener("pointerleave", replay);
            removers.push(() => {
              link.removeEventListener("pointerenter", replay);
              link.removeEventListener("pointerleave", replay);
            });
          });

          return () => removers.forEach((remove) => remove());
        },
        root,
      );

      return () => mm.revert();
    },
    {
      dependencies: [label],
      revertOnUpdate: true,
      scope: root,
    },
  );

  return (
    <nav ref={root} className={className}>
      {children}
    </nav>
  );
}
