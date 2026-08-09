# 49 — The demo dialog's close button, refitted to a recording

## Scope, and why it is next

**Not a build-sequence step.** This is a design pass on already-shipped work,
requested by the user on 9 Aug 2026 against a screenshot of the running dialog
and a screen recording of the motion they want. It is the same class of request
as prompt 45, which built this button in the first place.

Prompt 45's animation was authored entirely as **judgement**, and
`docs/backend.md` says so in as many words:

> Every number is a **judgement, not a measurement** — there is no recording of
> this interaction to fit against.

**There is now a recording.** This prompt replaces those judged numbers with
fitted ones, and replaces the tone with a fan/whirr the user asked for by ear.

Two things the user settled before this file was written, and neither is to be
re-litigated at execution:

1. The **spin** is what repeats — the sound stays one event per pointer enter.
2. The sound becomes **"a spinning or whinning sound like a fanning sound"**,
   not the current rising chirp.

## Reference material read

| path | what it gave |
| --- | --- |
| `/home/gdk26/Pictures/Screenshots/Screenshot_20260809_173057.png` | identifies the target — our own `Request a demo` dialog with the `✕` circled. Carries no motion and no timing; it is the *what*, not the *how* |
| `/home/gdk26/Videos/Screencasts/Screencast_20260809_172923.webm` | the motion reference. 481×230, VP9, 60 fps, 20.932 s, **video stream only — `ffprobe` reports no audio stream** |
| `app/_components/lead/demo-request-dialog.tsx` | the leaf being changed: `HOVER_DUR`/`HOVER_SCALE`/`HOVER_ROTATION` (53–55), `TONE_*` (60–63), the `useGSAP` body (124–180), `whine()` (195–226), `magnify`/`settle`/`onCloseEnter`/`onCloseLeave` (228–247), the button's handlers (360–368) |
| `app/_components/motion/register.ts` | `DUR = 0.5`, `EASE = "power3.out"` |
| `docs/backend.md` 617–705 | prompt 45's record — the §7.5 GSAP grant, the `quickTo` failure, the reduced-motion verification, the measured two-route prerender result |
| `AGENTS.md` front matter | GSAP discipline, the `contextSafe` ban, the `clearProps` ban, `fromTo`-never-`from`, the measured-or-judged rule |

## The measurements

Procedure, so it can be re-run rather than trusted. All of it is in
`/tmp/claude-1000/-home-gdk26-Documents-nextjs-aetherfield/1ded1d12-4b1d-4f62-8a5d-7ea86e7ee295/scratchpad`
and should be **added to `docs/automation.md`** as a reusable recipe (see
Checks, below):

1. `ffmpeg -i <webm> -vf "crop=26:26:436:15" -pix_fmt gray -f rawvideo` — the
   glyph alone, at source resolution, one 26×26 grey frame per video frame. The
   crop centres the `✕` at local (12.5, 12.5); it was located by dumping raw
   pixel values, not by eye.
2. Fit the **resting** glyph to a synthetic two-bar `✕` (4× supersampled
   coverage, ink amplitude solved in closed form) over a grid of arm half-length
   and half-width. Result: `L = 8.6 px`, `w = 1.5 px`, ink 65/255, rms 9.3.
3. Per frame, fit **rotation θ (2° steps, ±46°) and scale (0.9–1.5, 0.1 steps)**
   against that template, masking pixels below 150/255 — the cursor is black,
   the glyph's darkest pixel is 172, so the mask separates them cleanly — and
   dilating the mask by one pixel.
4. Unwrap θ forward modulo 90°, because a `✕` is invariant under a quarter turn.

### What came back

**The glyph turns through a full circle. It does not rock.**

| | |
| --- | --- |
| **total rotation** | **360°**, in one continuous, monotonically increasing sweep |
| **direction** | **clockwise** on screen (θ increasing toward +y in image coordinates) |
| **duration** | **0.450 s** — 27 frames at 60 fps, **identical in all three clean windows** (rest-to-rest at t = 3.383–3.833, 5.900–6.350, 8.667–9.117) |
| **scale** | **1.0 throughout.** The fit had 0.9–1.5 available and chose 1.0 on every frame of every window. A 1.35 magnify would take the 14 px glyph to 19 px and is not there |
| **ease** | symmetric: p(0.5) = 0.500 to within a frame. See below |

**The ease is a measurement with a floor, not a value.** RMS residual of
normalised progress against each candidate, per window:

| ease | W2 | W3 | W4 |
| --- | --- | --- | --- |
| `linear` | 0.0730 | 0.0639 | 0.0808 |
| `sine.inOut` | 0.0265 | 0.0399 | **0.0188** |
| `power1.5.inOut` | 0.0300 | **0.0341** | 0.0307 |
| `power2.inOut` | 0.0339 | 0.0489 | 0.0173 |
| `power3.inOut` | 0.0743 | 0.0884 | 0.0579 |

`linear` and `power3.inOut` are **excluded** — they lose in all three windows by
2–4×. The middle three cannot be separated: each wins a different window, and
the spread between them (0.017–0.049) is the noise floor. The source has
duplicated frames (the fit returns identical θ on adjacent frames throughout),
so the recording does not carry the resolution to choose.

**Record the floor as the measurement and the pick as a judgement.**
`power1.5.inOut` is the one to ship: it is the only candidate that never loses
badly in any window, and it sits between the two that each win one.

### The correction this file also carries

An earlier reading of this same recording, by ink-centroid tracking, reported
**"4 oscillations per hover"**. That was the 90° symmetry of the `✕` aliasing a
single 360° turn into four visually identical quarter-turns. The template fit
supersedes it: **one full rotation, not four of anything.** The user's
instruction to use "exactly what you see in the recording" is therefore
satisfied by one 360° spin.

## What to implement

`app/_components/lead/demo-request-dialog.tsx` only.

### The spin

Replace the paused play/reverse `fromTo` with a **one-shot 360° turn fired on
pointer enter**:

- `rotation: 0 → 360`, `duration 0.45`, `ease "power1.5.inOut"`.
- **`fromTo`, not `from`** — the front-matter rule, and here it also guarantees
  a re-entry mid-spin restarts from 0 rather than from wherever it is.
- The tween is **created paused inside the `mm.add` handler**, exactly as today,
  and `restart()` on enter. Re-entering before it finishes must restart, not
  stack — the same discipline the tone already has.
- **Nothing reverses it.** 360° lands on 0, so there is no crooked rest state
  and `onCloseLeave` has no spin to undo. This is why the recording's gesture
  works as a one-shot where prompt 45's 90° needed a reverse.
- `duration` and `ease` are **local constants with the measurement quoted in the
  comment**. `EASE` is `power3.out` and is an *out* ease; the fit says the
  reference is symmetric, so importing it would contradict the measurement. This
  is the `HOVER_DUR`/`FOOTER_DUR` precedent, not a restatement.

### The magnify — a decision the user must confirm at approval

**The recording has no magnify.** Taken literally, "exactly what you see"
removes `HOVER_SCALE` entirely.

**Recommendation: keep it, and keep it separate.** The 1.35 scale is the hover
*affordance* prompt 45 existed to add — it holds for as long as the pointer is
on the button and tells you the target is live, which a 0.45 s spin that ends
back at rest cannot do. The user asked for the **whine** to match the recording
and named the spin as the thing that changes; they did not ask for the
affordance to go.

So: **two tweens, not one.**

- `scaleTween` — `scale 1 → 1.35`, `HOVER_DUR 0.22`, `EASE`, paused, played on
  enter/focus and reversed on leave/blur. This is today's behaviour with
  `rotation` taken out of it.
- `spinTween` — the 360° turn above, `restart()` on pointer enter only.

**They must not both animate `transform` through the same GSAP property.**
`scale` and `rotation` are separate aliases and GSAP composes them onto one
matrix, so two tweens on the same element are fine — but verify the composed
matrix in the browser rather than assuming it, because prompt 45 already lost a
magnify to exactly this class of mistake (`scale` is a shorthand over
`scaleX`/`scaleY`; the `quickTo` pair silently dropped it). **Read the computed
`transform` at rest, mid-spin and hovered-after-spin and quote all three.**

If the user says drop the magnify at approval, delete `HOVER_SCALE`,
`HOVER_DUR`, `magnify`, `settle` and the `onFocus`/`onBlur` handlers, and leave
the spin alone.

### The sound

Replace the 420 → 1080 Hz triangle sweep with a **fan**. Every number below is a
**judgement and must be recorded as one — the recording has no audio track**, so
there is nothing to fit and the brief is the user's four words.

Shape, matching the spin so the two read as one gesture:

- **Duration 0.45 s**, the spin's, not 0.18.
- **A noise bed, not an oscillator.** An `AudioBufferSourceNode` over a short
  white-noise buffer generated once and reused, through a **bandpass**
  `BiquadFilterNode`. A fan is broadband; a tone is a chime, which is what we are
  moving away from.
- **The filter follows the spin's speed.** Ramp the bandpass centre up and back
  down across the 0.45 s — the blade note rises as the fan spins up and falls as
  it coasts. Author it as an explicit up-ramp and down-ramp; do not try to
  reproduce `power1.5.inOut` in WebAudio.
- **Blade-pass modulation.** A low-frequency `OscillatorNode` into a
  `GainNode.gain` gives the chop that makes it read as a fan rather than a
  whoosh. Rate rises with the spin.
- **Peak gain stays 0.05.** Unchanged, and not negotiable by ear at execution:
  the site's register is measured and operational, and prompt 45 set this level
  deliberately. Ramp to the 0.0001 floor, never 0 — WebAudio rejects 0 as an
  exponential ramp target.

Everything structural about the current implementation **stays**, because it was
verified in a browser and is not what the user asked to change:

- Fires on **pointer enter only**, never on focus, never on mount.
- Gated on the same reduced-motion check as the tween — no tween, no sound.
- **One** lazily created `AudioContext` in a ref, closed on unmount.
- The running source is tracked and **stopped before another starts**, so
  re-entering does not stack. `toneRef` now holds an `AudioBufferSourceNode`;
  keep the `onended` self-clear so a finished source does not leak.
- Wrapped in `try`/`catch` — the sound is an embellishment and may never break
  the dialog.
- Output only. No input device, no permission prompt.

### What must not change

- `gsap.matchMedia()` with **both** conditions named. Under `reduce`, no tween is
  created, the ref stays null, and hovering does nothing at all — not a
  zero-duration tween, and **no sound**.
- `useGSAP(fn, { dependencies: [open], revertOnUpdate: true, scope: dialogRef })`
  — the button mounts after the hook first runs.
- **No `contextSafe`.** Banned outright in this codebase; it has crashed this
  page twice. The handlers are React props and the tweens are created inside the
  context, so `mm.revert()` owns them.
- **No `clearProps`** on `opacity` or `transform`.
- A pointer leaving a **focused** button does not settle it.
- No `markers: true`.

## Prerender impact

**Expected: none — no route's markup or render mode changes. Verify it, do not
assume it.**

The reasoning, which is prompt 45's own measured result: the close button lives
inside the `open ? … : null` branch, so **its markup is absent from every
prerendered page**. This change touches only that branch, module-scope numeric
constants, and JavaScript that runs on a pointer event. Nothing it edits is
emitted into HTML.

`/` and `/design-system` are the only two prerendered routes that render this
dialog at all (measured at prompt 45 — `CtaBand`'s `demo` prop is opt-in, so
`/journal`'s band is the newsletter's and `/about`'s reads "View open roles").
Both must come back **byte-identical**.

Method, per `docs/automation.md`: build before and after, strip the RSC flight
scripts, normalise `BUILD_ID` and generated chunk names, diff all 18 prerendered
pages. Confirm the route table is unchanged. The standing warning about bare
page-wide `magick compare -metric AE` on `/`, `/journal` and `/careers` does not
apply — this is an HTML diff, not a render comparison.

**Also re-check the bundle**, as prompt 45 did: per-route chunk counts
containing `gsap` must be unchanged on all 18 prerendered pages. Nothing here
adds an import, so a change would mean something went wrong.

## Trust boundary

**None.** No stage of the write path is touched: no Server Action, schema,
query, email, rate limit, BotID path or environment variable. The change is a
hover animation and a sound inside an already-shipped client leaf.

## Secrets and data

**None.** No environment variable is read. No personal data is stored, logged or
transmitted. No `NEXT_PUBLIC_*` is added — phase one still needs none. The
`AudioContext` is output-only: no microphone, no permission request, nothing
recorded.

## Non-goals

- **The apply dialog and the newsletter dialog stay plain.**
  `app/_components/application/apply-dialog.tsx` and
  `app/_components/newsletter/subscribe-dialog.tsx` both carry a comment saying
  they deliberately do *not* copy this button, precisely so the §7.5 GSAP grant
  does not spread. **Do not touch either file.** They are also live in another
  session's uncommitted working tree.
- **No `::backdrop` transition.** Still needs `@starting-style` and
  `transition-behavior: allow-discrete` and still has no open/close transition to
  hang on. Separate change, separate measurement.
- **No new shared motion constant.** The spin's duration and ease are local to
  this leaf; they are not `motion/register.ts` vocabulary and must not be
  promoted there.
- **No change to the dialog's open/close, focus management, validation, or
  submit path.**
- **No sound anywhere else on the site.**

## Checks

Run and quote the exact output of each (§2):

- `npm run lint`
- `npm run typecheck`
- `npm run build` — and produce the route table rather than describing it

**Another session is mid-flight on prompt 48** (job applications and blob
upload) with `package.json`, `next.config.ts`, `lib/rate-limit/index.ts`,
`instrumentation-client.ts`, `app/_components/primitives.tsx`, `cards.tsx`,
`careers/sections.tsx` and `job/sections.tsx` modified and uncommitted. A build
run from this session compiles **their** half-finished tree. **Before running
any check, confirm with the user that prompt 48 is committed or paused**, and if
a check fails, establish whether the failure is in this change or in theirs
before reporting it as either.

Browser verification, against the production build, quoting numbers not
impressions:

1. Computed `transform` on the close button at rest, mid-spin, and hovered after
   the spin completes.
2. It comes to rest **upright** — a 360° turn must not leave a residual angle.
3. Re-entering mid-spin restarts rather than stacking; count oscillator/source
   nodes created against `stop()` calls over five rapid hover cycles, as prompt
   45 did.
4. Focus alone creates **0** audio sources.
5. Under `prefers-reduced-motion: reduce`: computed `transform` is `none` through
   hover, leave, focus and blur, and **no** audio source is created.
6. Close and reopen the dialog, then hover — exercises `revertOnUpdate`.
7. No page errors.

## Where the result is recorded

**`docs/backend.md`**, rewriting the "The close button's hover, and the blurred
backdrop — prompt 45" section at line 617 rather than appending a second
section — the numbers there are now wrong, and §12 rule 8 requires fixing a
stale line in the same change rather than leaving it to be re-read as fact. It
must state:

- that the animation is now **fitted to a recording**, with the file path, the
  fitting procedure, and the 360° / 0.450 s / clockwise result;
- that scale in the reference measured **1.0**, and what we did about it;
- the ease table, that `linear` and `power3.inOut` are excluded, that the
  remaining three are **inside the noise floor**, and that `power1.5.inOut` is
  therefore a **judgement on a measured floor**;
- that the "4 oscillations" reading was 90° aliasing, and is superseded;
- that every number in the fan sound is a **judgement**, because the reference
  has no audio stream;
- the browser verification numbers, and the prerender and bundle results.

**`docs/automation.md`** gains the glyph-fitting recipe under the standing
instruction to promote hand-worked steps: the crop-to-raw-grey `ffmpeg` call,
the synthetic-template fit, the darkness mask that separates a black cursor from
a grey glyph, and the modulo-90 unwrap that a symmetric glyph forces. It is
mechanical, it took a session to work out, and the next motion reference will
need it.

`AGENTS.md` gets **nothing** — the §7.5 GSAP grant already points here, and this
adds no site-wide invariant. One index row is not needed either; both files are
already indexed.

## SKILLS USED

- **`gsap-core`** — `gsap.fromTo`, `restart()` on a paused tween, the
  `power1.5.inOut` ease name and whether GSAP accepts a fractional power ease,
  and `gsap.matchMedia()` with named conditions.
- **`gsap-react`** — `useGSAP` with `dependencies` + `revertOnUpdate` + `scope`,
  and cleanup via `mm.revert()`. Confirms the `contextSafe` reasoning.
- **`gsap-performance`** — that `rotation` and `scale` stay on the compositor and
  trigger no layout, and how two concurrent tweens on one element compose.
- **`nextjs`** — client-leaf boundaries and that nothing here changes a route's
  render mode.
- **`tailwind-4-docs`** — only if a class string is touched; the independent
  `translate`/`rotate`/`scale` utilities are what GSAP folds into one
  `transform`, and the front matter's rule about authoring resting values
  explicitly depends on it.
- **`motion`** — the animation-quality and MotionScore guidance, and its advice
  on hover gestures that fire repeatedly.
- **`frontend-design:frontend-design`** — the magnify-versus-spin judgement and
  keeping the gesture inside the site's measured, operational register.

**None of these cover WebAudio.** There is no audio skill installed, and
`docs/skills.md` records no exclusion for one. The fan must be written against
**MDN's Web Audio API documentation fetched live in the executing session** —
`AudioBufferSourceNode`, `BiquadFilterNode` bandpass, and
`AudioParam.exponentialRampToValueAtTime`'s rejection of 0 as a target. Do not
write it from memory (§12 rule 2), and say so explicitly if the docs cannot be
reached.
