# Full-resolution footer texture

## Scope and why this is next

Increase the rendered pixel fidelity of the shared footer fabric band, as
explicitly requested on 21 September 2026. This is a narrow follow-up to the
pointer work in prompt 135 (`74e1b18`) and is independent of the backend plan.

"100% quality" is interpreted as **source-limited display quality**: at each
viewport/DPR, do not deliberately downsample the decorative image or its WebGL
canvas below the available treated source resolution. It does not mean inventing
new cloth detail, changing the halftone design, or requesting an arbitrary
lossless network asset regardless of device size. The repository already holds
the 3720×840 master at `public/assets/images/Footer image.png`; use that genuine
source rather than AI-restoring or regenerating the fabric.

## Reference material and preparation evidence

- `AGENTS.md`: prompt-first workflow, settled-footer exception, source-asset
  convention, reporting requirements and mandatory commit.
- `docs/chrome.md`: settled footer geometry, band crop and the source/fallback
  contract.
- `docs/motion-site.md`: prompts 132–135, especially the current 1.5 DPR /
  1920px canvas caps and the failure/reduced-motion invariants.
- `docs/automation.md`: footer probe, image-delivery and masked-comparison
  procedures.
- `app/_components/chrome.tsx`: existing responsive Image markup, currently
  declaring the 1800×409 derivative.
- `app/_components/motion/footer-texture.tsx`: existing source upload,
  object-cover crop and capped WebGL drawing buffer.
- `public/assets/images/Footer image.png`: the inspected 3720×840, 8-bit RGBA
  master. It is the source photograph/halftone, not a new reference image.
- `public/assets/generated/texture-brand.png`: the inspected 1800×409 treated
  derivative currently used by the footer.
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`:
  installed Next.js Image behaviour for intrinsic dimensions, `sizes`, and
  image optimization quality.

Preparation measurement: the master contains 3,124,800 pixels while the shipped
derivative contains 736,200 (4.24× fewer). At the settled 1280px viewport, the
band is 1232×280 CSS pixels. The current canvas cap produces 1848×420 pixels at
DPR 2 or 3; an available 3720×840 treated source can instead supply a 2464×560
DPR-2 buffer and a 3696×840 DPR-3 buffer without upscaling texture data.

The source master and current derivative are not byte-identical colour variants:
the source has alpha and 53 sampled colours while the derived PNG is opaque and
has 28. Reconstruct the existing yellow/olive treatment deterministically from
the master, with the current derivative used as the colour/crop reference. Do
not substitute the un-treated master or use an AI edit; that would change the
settled artwork rather than its quality.

## Implementation requirements

1. Create a new full-resolution treated PNG in `public/assets/generated/`,
   retaining the current `texture-brand.png` as rollback/reference until final
   visual comparison selects the replacement. The final project asset may
   replace `texture-brand.png` only after it is shown to preserve the current
   artwork; otherwise use a versioned sibling and update the sole consumer.
2. Derive it directly from `Footer image.png` with a recorded ImageMagick recipe.
   Preserve the current landscape framing, yellow paper, olive ink, halftone
   character and opacity treatment. Work from the 3720×840 master; never upscale
   the old 1800×409 derivative. Tune only deterministic processing needed to
   match the existing source asset's treatment, and record the exact command in
   `docs/chrome.md`.
3. Update the Image intrinsic `width` and `height` to the final treated file's
   true dimensions. Preserve its `sizes="100vw"`, decorative accessibility,
   object-cover crop, responsive heights (120/210/280), classes, loading
   behaviour and surrounding markup. Apply `quality={100}` only after checking
   the installed Image configuration accepts it; the intent is to prevent the
   Next optimizer's default 75-quality encoding from softening this fine
   halftone, not to alter global image defaults.
4. Remove the arbitrary `MAX_DPR`/`MAX_WIDTH` quality ceiling in
   `footer-texture.tsx` only to the extent required for source-limited output.
   Bound the canvas ratio by `window.devicePixelRatio` and by both the loaded
   image's natural width/height relative to the CSS band. This prevents a
   drawing buffer larger than its source texels while allowing DPR 2 and DPR 3
   at the settled desktop and mobile sizes. Retain a finite safe fallback when
   dimensions are zero or unavailable.
5. Preserve one canvas, one image texture upload, its current source crop, the
   12-second autonomous phase, dot field, pointer response, input allocation
   profile, pause/resume semantics, media-query lifecycle, no-JavaScript and
   reduced-motion image fallback, WebGL failure/context-loss fallback, cleanup,
   and footer geometry. Do not change shader aesthetics to disguise sharpness.
6. Confirm source delivery by inspecting `currentSrc` and the optimizer request
   rather than `img.naturalWidth`; the latter is density-corrected for responsive
   `srcset` candidates. Do not claim a browser delivers the full master where
   its selected candidate or DPR does not require it.

## Measurement and acceptance

1. Capture baseline production results at 375, 800 and 1280 widths at DPR 1, 2
   and 3 where supported. Record the image optimizer candidate, its real pixel
   dimensions/bytes, CSS band box, canvas buffer dimensions and canvas-to-source
   ratio. Include the current DPR-3 mobile 503px buffer and 1280px 1848×420
   buffer as baseline checks from the existing capped behaviour.
2. With fixed autonomous phase and zero wake, compare a crop around dense dots
   and a crop crossing a high-contrast fold. The final canvas buffer must reach
   `min(device DPR, source width / CSS width, source height / CSS height)` on
   each tested case (within integer rounding). At 1280px this is 2464×560 at
   DPR 2 and 3696×840 at DPR 3, subject only to actual computed CSS bounds.
3. Visually inspect 100%-scale final crops against the current footer and the
   supplied screenshot: dots must remain individually crisp without JPEG/WebP
   ringing, blur, moire, colour shift or a changed crop. Treat this as a visual
   judgement; report the objective delivery/buffer measurements separately.
4. At 375, 800 and 1280 verify the settled footer, band, nav and wordmark boxes
   are unchanged. Mask the entire animated band (including any fractional edge
   row) and require `AE 0 (0)` for the remainder.
5. Re-run focused Chromium and Firefox checks on `/about` and `/`: normal,
   no-JavaScript, reduced motion, unavailable WebGL, shader failure, context
   loss, resize, DPR change, offscreen/hidden pause/resume, pointer sweep,
   route-away/return and zero console/page errors. The image fallback must
   itself be sharp at each tested DPR.
6. Profile idle and active rendering without recording overhead. Report the
   renderer, source/buffer dimensions, frame intervals, submission cost and GPU
   memory implication. If a source-limited DPR 3 buffer causes material jank or
   allocation failure on the documented software renderer, stop and report the
   measured limit rather than silently restoring the old cap.

## Expected impact and prerendering

Every `SiteFooter` consumer receives a higher-fidelity client image and canvas:
the marketing routes, authenticated workspace routes and auth/boundary states
listed in `docs/motion-site.md`. No route render mode, server action, data path,
secret or personal data changes. The Image element's intrinsic metadata and URL
may change in prerendered HTML; compare that deliberate markup delta separately.
All surrounding rendered markup, CSS, layout and route classifications must
remain unchanged. Client chunks may change for the resolution calculation.

## Non-goals

No new artwork, AI image generation/edit, footer restyle, palette change,
different crop, image format migration, global Next image configuration,
loading-priority change, navbar/wordmark/link change, animation/pointer tuning,
dependency, backend, analytics or unrelated refactor. Preserve
`.claude/settings.local.json` and all unrelated worktree changes.

## SKILLS USED

- `imagegen` — confirms that a raster-quality request normally uses image
  generation/editing, then selects the deterministic existing 3720×840 master
  because it preserves the exact established artwork more faithfully than an AI
  recreation.
- `nextjs` — verifies current Next.js Image intrinsic dimensions, `sizes` and
  quality semantics before changing the shared Image.
- `gsap-core` — preserves the continuous footer clock and named media conditions
  around the higher-resolution drawing buffer.
- `gsap-react` — preserves scoped lifecycle and complete canvas/listener cleanup;
  the project's `contextSafe` prohibition controls.
- `gsap-performance` — evaluates the higher DPR buffer's idle/active cost and
  prevents quality work from creating an unbounded render surface.
- `vercel-react-best-practices` — preserves transient, non-React render state in
  the existing animation client leaf.
- `browser-use` — runs production image-delivery, DPR, lifecycle and visual
  verification using the installed Playwright package if its CLI is unavailable.

Reload every listed skill before implementation.

## Checks, documentation and delivery

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. Run the
focused browser, delivery, high-DPR, visual, fallback, performance and
prerender-comparison checks above; report exact output and any environmental
block. Record the selected asset's source/target dimensions, ImageMagick recipe,
optimizer quality/delivery evidence, measured buffers, visual judgement and
performance trade-off in `docs/chrome.md` and `docs/motion-site.md`; add only a
reusable delivery/canvas probe to `docs/automation.md` if one is discovered.

Commit the prompt, implementation, final asset and owning documentation to
`main`; do not push. Provide exact local review steps and relevant crop or video
artifact paths.

## Execution gate

Prepared under AGENTS.md section 1. Implement only after approval; `y` or `Y`
means approved, execute.
