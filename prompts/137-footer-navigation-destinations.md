# 137 — Footer navigation destinations

## Scope and why it is next

Wire the five text links in the settled shared `SiteFooter` to the same public
destinations as the site navbar, as explicitly requested on 21 September 2026.
The footer record calls this out as a separate decision from the prior navbar
wiring; the user has now made that decision. This is a narrow navigation-only
change, following the committed footer texture work (`def81b5`).

## Reference material

- User screenshot: `/home/dgk/Pictures/screenshot-2026-09-21_03-07-55.png`,
  highlighting the footer row: Product, Journal, About, Careers, Get started.
- `AGENTS.md`: prompt-first workflow, settled-footer invariant, mandatory
  checks, documentation, and commit requirements.
- `docs/chrome.md`: footer geometry/type/colour invariants and the explicit
  note that its placeholder links await a distinct wiring decision.
- `docs/motion-site.md`: footer split-reveal accessibility markers and its
  site-wide route reach.
- `app/_components/chrome.tsx`: canonical `NAV_ITEMS` route map, the logged-out
  navbar `/sign-in` CTA, and the footer's current labels-only `href="#"` map.
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`:
  installed Next.js `Link` behavior for internal client-side navigation.

## Implementation requirements

1. In `app/_components/chrome.tsx`, render each footer navigation item from the
   existing `NAV_ITEMS` data as an internal `next/link` `Link`, preserving each
   item label and current class string, key, and `data-footer-split` marker.
   The resulting destinations must be Product → `/`, Journal → `/journal`,
   About → `/about`, and Careers → `/careers`.
2. Preserve the visible label “Get started” and make it an internal `Link` to
   `/sign-in`, the same destination used by the unauthenticated navbar CTA.
   Do not make the footer session-aware or relabel it “Account”: this prompt
   concerns the visible footer links in the supplied reference, and the footer
   must remain static for its shared prerendered markup.
3. Preserve every footer box, class string, order, text, spacing, colour,
   texture, wordmark, motion marker, and animation behavior. Do not restyle it.
   The only deliberate rendered-markup change is five `href` values (with the
   standard `Link` anchor output), so no geometry measurement is needed: the
   text and type metrics do not change.
4. Update the footer navigation record in `docs/chrome.md`: replace the
   outstanding placeholder-link note with the exact route mapping and state
   that the geometry/type/motion treatment remains unchanged.

## Expected impact and prerendering

Every route that renders `SiteFooter` has the five deliberate footer-link
destination changes in its prerendered HTML. Route modes, server/data paths,
CSS, client motion, and all non-footer markup must remain unchanged. Confirm
the change is limited to the intended anchors; do not claim byte-identical
prerendered HTML because these `href` attributes necessarily differ.

## Non-goals

Do not alter `SiteNav`, `NAV_ITEMS`, auth behavior, the dynamic navbar Account
CTA, any CTA dialog, marketing copy, footer layout or visual styling, footer
texture/motion, dependencies, server actions, API routes, or unrelated working
tree changes (including `.claude/settings.local.json`).

## SKILLS USED

- `nextjs` — validates the installed App Router `Link` component behavior for
  internal navigation before replacing the footer's placeholder anchors.

Reload the listed skill before implementation.

## Checks, documentation and delivery

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
Use a focused production or local browser check to confirm all five footer
links expose and navigate to the routes above without changing the footer
layout or text. Record the completed navigation mapping in `docs/chrome.md`.
Commit the prompt, implementation, and documentation to `main`; do not push.
Provide exact local review steps.

## Execution gate

Prepared under AGENTS.md section 1. Implement only after approval; `y` or `Y`
means approved, execute.
