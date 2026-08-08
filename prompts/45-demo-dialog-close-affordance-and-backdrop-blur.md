# 45 — The demo dialog's close affordance, and a blurred backdrop

## Scope, and why it is next

Two changes to **`app/_components/lead/demo-request-dialog.tsx`**, both requested
directly by the user against a running dev server:

1. **The close button magnifies and whines on hover** — it scales up and spins,
   *and* it plays a short audible whine. The user was asked which reading of
   "whine" they meant and answered **both** options: the visual spin **and** a
   real sound.
2. **The page behind the dialog blurs** while it is open — the `::backdrop`,
   which is what the second screenshot's red strokes flank on either side of the
   dialog box.

This is not a build-sequence step. It is a design pass over the leaf build step 2
shipped (`prompts/42-demo-request-capture.md`), and it changes nothing about the
write path — no action, no schema, no query, no email is touched.

## Reference material read for this

- `/home/gdk26/Pictures/Screenshots/Screenshot_20260807_233342.png` — the close
  button circled in red. Establishes what is being animated.
- `/home/gdk26/Pictures/Screenshots/Screenshot_20260807_233403.png` — red strokes
  down both sides of the dialog, over the hero. Establishes that the blur applies
  to the **page around the dialog**, not to the dialog's own surface.
- `app/_components/lead/demo-request-dialog.tsx` — the leaf as shipped. Its
  header comment currently asserts "no GSAP, per AGENTS.md 7.5. The open and
  close are CSS." That sentence becomes false in this change and must be
  rewritten in the same edit (§12 rule 8).
- `app/_components/motion/register.ts` — `gsap`, `useGSAP`, `DUR`, `EASE`.
- `app/_components/motion/footer-reveal.tsx` — read for the precedent of a
  **local** duration constant (`FOOTER_DUR`) sitting alongside the imported
  `EASE`, which is the pattern this file follows.
- `app/globals.css` lines 80–200 — the `(scripting: enabled) and
  (prefers-reduced-motion: no-preference)` hidden-start-state block, and the
  separate `prefers-reduced-motion` block for the CSS-only marching dashes.
  **Neither gains a rule here**: this animation has no hidden start state to
  author, because the element is at rest until hovered.
- `.claude/skills/tailwind-4-docs/references/docs/hover-focus-and-other-states.mdx`
  line 1519 — the `backdrop:` variant, for `::backdrop` on a native `<dialog>`.
- `.claude/skills/tailwind-4-docs/references/docs/backdrop-filter-blur.mdx`
  lines 11–17 — the `backdrop-blur-*` scale and the px each step resolves to.

## The rule this deviates from, and the user's authorisation

**AGENTS.md §7.5 forbids "GSAP for anything in the backend UI".** This dialog is
backend UI. The user was shown the conflict, offered a CSS-only alternative that
keeps §7.5 intact, and chose **GSAP, as an explicit deviation** — which is
exactly the override AGENTS.md §1 rule 1 provides for.

So the implementation must **record the deviation, not merely take it**:

- Amend the `§7.5` bullet in AGENTS.md to read that GSAP is barred from backend
  UI **except** the demo dialog's close-button hover, granted by the user on
  7 Aug 2026, and point at `docs/backend.md` for what it does. One line changed
  in place — not a new line stacked on top (the front-matter cap rule).
- The leaf's header comment loses its "no GSAP" sentence and gains the reason.

**Bundle impact of the deviation is nil, and this must be verified rather than
assumed.** `CtaBand` in `app/_components/chrome.tsx` renders the dialog on `/`,
`/journal`, `/about` and `/design-system`, but `chrome.tsx` already pulls
`NavDrop` and `FooterMotion`, both of which import `app/_components/motion/register.ts`.
GSAP is therefore already in every one of those routes' bundles. Confirm this
against the build output rather than trusting the paragraph.

## What to build

### a. The close button

The element is the `<button aria-label="Close">` at
`app/_components/lead/demo-request-dialog.tsx:180`. Keep the glyph, the
`aria-label`, the `focus-visible` outline and the existing colour transition —
this adds motion to the button that is already there and changes no other
property of it.

- **Magnify and spin.** On pointer enter: `scale` to **1.35** and `rotation` to
  **90** degrees, together. On pointer leave: back to `scale: 1, rotation: 0`.
  The glyph is a `✕`, so 90 degrees lands it back on itself — the spin reads as
  motion without leaving the mark crooked at rest.
- **Keyboard parity.** `onFocus` runs the same magnify and `onBlur` the same
  return, so the affordance is not pointer-only.
- **Timing.** `EASE` imported from `motion/register.ts`, never restated. `DUR`
  is 0.5 and is the page-reveal vocabulary, which is sluggish for a hover, so a
  **local** `HOVER_DUR = 0.22` sits at the top of the file with a comment saying
  why it is local — the `FOOTER_DUR` precedent. This is a **judgement**, not a
  measurement: there is no recording of this interaction to fit against, and the
  implementation must say so where it records the number.
- **Mechanics, and the traps that bind here.**
  - `useGSAP(fn, { scope: ref })`, with `gsap.matchMedia()` inside and **every
    condition named** — `{ motion: "(prefers-reduced-motion: no-preference)",
    reduce: "(prefers-reduced-motion: reduce)" }`. A lone `reduce` query never
    fires for anyone else. `mm.revert()` is the returned cleanup.
  - **`contextSafe` is banned in this codebase** and has no use here. The
    handlers are React props, not `addEventListener` calls, and the tweens they
    drive are created **inside** `useGSAP` as `gsap.quickTo` setters stored in a
    ref — so every tween belongs to the context and is reverted with it. Do not
    wrap anything.
  - **The button mounts after `useGSAP` first runs.** The dialog body renders
    only while `open` is true (line 169), so on mount the ref is null. The hook
    takes `{ dependencies: [open], revertOnUpdate: true, scope: ... }`, and the
    body no-ops when the ref is empty.
  - Under the `reduce` condition, no tween is created and the handler refs stay
    null, so hovering does nothing at all — not a zero-duration tween.
  - No `clearProps`, and `scale`/`rotation` are authored explicitly at rest
    (GSAP folds Tailwind v4's independent `rotate`/`scale` into one `transform`).
  - No `markers`.

### b. The whine

A short synthesized tone on **pointer enter only** — never on focus, so a
keyboard user tabbing through the dialog is not blasted, and never on the
initial mount.

- WebAudio, no dependency: one lazily created `AudioContext` held in a ref, an
  `OscillatorNode` through a `GainNode` per hover. **The dialog is only ever
  reached through a click**, so the gesture that unlocks audio has already
  happened by the time any hover can occur; still call `resume()` defensively and
  swallow a rejection.
- The shape, all judged rather than measured: a **triangle** oscillator sweeping
  **420 Hz → 1080 Hz** over **0.18 s**, gain peaking at **0.05** and ramping down
  exponentially to silence. Quiet, brief, mechanical — a servo spinning up, not a
  notification chime. The site's register is measured and operational, and a
  cheerful ding would be off-voice.
- **Gated on the same reduced-motion preference as the tween.** Someone who has
  asked for less motion gets no sound either.
- Re-entering before the previous tone finishes must not stack: track the running
  node and stop it before starting another.
- The `AudioContext` is closed on unmount.

### c. The backdrop blur

The `<dialog>`'s class string at line 165 carries `backdrop:bg-ink/40` today.
Replace that with a blur plus a **lighter** tint — the blur is doing the
separation work that the 40% ink was doing alone, and keeping both makes the page
behind unreadable rather than deferred:

- `backdrop:backdrop-blur-md` (12px, per the docs table read above)
- `backdrop:bg-ink/25`

Both numbers are **judgements**, and the screenshot cannot measure them: it shows
the state *before* the blur, with the red marker only indicating where it belongs.
Record them as judgements.

Non-goal here: **no transition on the backdrop.** Animating a `::backdrop` in and
out needs `@starting-style` and `transition-behavior: allow-discrete`, and the
dialog has no open/close transition today. Adding one is a separate change with
its own measurement, and this prompt does not smuggle it in.

## Prerender impact

**Not "none" — declare it honestly.** The leaf is a client component but still
server-renders, so the `<dialog class="...">` element is present in the
prerendered HTML of every route carrying it: **`/`, `/journal`, `/about`,
`/design-system`**. Changing that class string changes those four routes' bytes.

What must **not** change:

- the **render mode** of any route — the table in AGENTS.md §8.1 must come back
  identical from `npm run build`;
- any **layout** — the dialog is `display: none` when closed and its `::backdrop`
  does not exist outside the top layer, so no box moves on any page;
- the diff on those four routes must be **confined to the `<dialog>` element's
  class attribute**, and the close button's markup, which lives inside the
  `open ? ... : null` branch and is therefore absent from the prerendered HTML
  entirely.

Verify per `docs/automation.md`, and the standing warning applies: **never quote
a bare page-wide `magick compare -metric AE` for `/` or `/journal`** — mask the
scrubbed cloth and the stamp perforation, report the remainder separately.

## Trust boundary

**none.** No request path changes. No action, no schema, no query, no email, no
environment variable is touched, and nothing crosses from the browser to the
server that did not before.

## Secrets and data

**none.** The change reads no environment variable, stores nothing, logs nothing
and transmits nothing. The `AudioContext` records no input — it is output only,
and no microphone permission is involved or requested.

## Non-goals

- **No open/close animation for the dialog itself**, and no `::backdrop`
  transition (see c).
- **No change to the write path** — stages a–f are untouched.
- **No new primitive.** The close button stays a bare `<button>` inside this
  leaf; it is not promoted into `primitives.tsx`, because nothing else uses it.
- **No sound anywhere else on the site**, and no global mute control. One
  interaction, one tone; a site-wide audio affordance is a much larger decision.
- **No `home/` import**, no new shared export from a client leaf — the bundle
  rule is unchanged.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build` — quote the route table and confirm it matches §8.1's
- the prerendered-HTML diff described under **Prerender impact**, per
  `docs/automation.md`
- by hand in `npm run dev`: hover and leave, tab to the button and away, hover
  repeatedly in quick succession, and confirm reduced-motion silences both the
  spin and the tone

## Where the result is recorded

- **`docs/backend.md`**, under build step 2's dialog — the animation's numbers,
  each marked **judged** rather than measured, the audio shape, the backdrop
  values, and the four routes whose prerendered bytes moved.
- **`docs/motion-site.md`** — one cross-reference line only, pointing at
  `docs/backend.md`. The dialog is backend UI and its record belongs there; this
  line exists so a session reading the motion record does not conclude the site
  has no dialog motion.
- **`AGENTS.md`** — the §7.5 bullet amended in place, per the deviation section
  above. Nothing else in AGENTS.md changes; this work adds no index row, because
  it creates no `docs/` file.

## SKILLS USED

- **`gsap-react`** — `useGSAP` with `scope`, the `dependencies` /
  `revertOnUpdate` config object for a target that mounts late, and cleanup.
  Note that its `contextSafe` guidance is **overridden** by AGENTS.md, which bans
  `contextSafe` in this codebase outright.
- **`gsap-core`** — `quickTo`, the transform aliases (`scale`, `rotation`),
  `gsap.matchMedia()` with named conditions and `prefers-reduced-motion`, and the
  ease vocabulary.
- **`gsap-performance`** — confirm the hover tween stays on transform and
  compositor-friendly properties, and that nothing triggers layout.
- **`tailwind-4-docs`** — the `backdrop:` variant and the `backdrop-blur-*`
  scale, both already read for this prompt; re-read at execution rather than
  recalled.
- **`frontend-design:frontend-design`** — the judgement calls: the magnify
  factor, the 90-degree spin on a `✕`, the tone's character, and the blur/tint
  balance that keeps the page deferred rather than obliterated.
- **`nextjs`** — only to confirm nothing here affects prerendering or the render
  mode of the four affected routes.
