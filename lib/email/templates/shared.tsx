import type { CSSProperties, ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

/**
 * The two transactional templates' shared shell.
 *
 * **`templates/` is the one part of `lib/email/` without `import
 * "server-only"`, deliberately.** AGENTS.md 8.4 puts the marker on every
 * module that touches a secret; these touch none — they are pure presentation
 * over props. Keeping them importable outside the `react-server` condition is
 * what lets them be rendered and inspected on their own (`server-only`'s
 * `index.js` throws unconditionally under any other condition). Everything in
 * `lib/email/` that does read a secret — `config.ts`, `send.ts`,
 * `demo-request.ts` — carries it.
 *
 * **This is not an email design system** (AGENTS.md 7.5 forbids a second one).
 * It is a single column, the site's own tokens as inline literals, and a
 * wordmark in type — no attempt to reproduce `SiteFooter` in table layout.
 *
 * **Inline styles, not the `Tailwind` component.** Tailwind classes do not
 * survive a mail client, `react-email`'s `Tailwind` wrapper pulls the whole
 * `tailwindcss` package into the server bundle to inline them, and two plain
 * messages do not earn that. The colour literals below are copied from
 * `app/globals.css`'s `@theme` and are the only place in the repository they
 * are restated.
 *
 * Accessibility, per the `email-best-practices` skill's checklist:
 * `<Html lang dir>` **and** the same pair on `<Body>`'s direct child, because
 * several clients strip them from `<html>`; `<Preview>` emits the `<title>`;
 * one `<h1>` per message; body text is `#000000` on `#ffffff` and the muted
 * `#6c6c6c` is 5.3:1, both past 4.5:1. No image, so no `alt` question, and no
 * hand-built layout table, so no `role="presentation"` question.
 */

/** From `app/globals.css`'s `@theme`. */
const INK = "#000000";
const MUTED = "#6c6c6c";
const BORDER = "#dbe0ec";
const WHITE = "#ffffff";

const SANS =
  'Archivo, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

const body: CSSProperties = {
  backgroundColor: WHITE,
  color: INK,
  fontFamily: SANS,
  margin: 0,
  padding: "24px 0",
};

const container: CSSProperties = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "0 24px",
};

const wordmark: CSSProperties = {
  fontFamily: SANS,
  fontSize: "13px",
  lineHeight: "18px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: INK,
  margin: 0,
};

const rule: CSSProperties = {
  borderTop: `1px solid ${BORDER}`,
  marginTop: "24px",
  paddingTop: "16px",
};

const footer: CSSProperties = {
  fontFamily: SANS,
  fontSize: "13px",
  lineHeight: "20px",
  color: MUTED,
  margin: 0,
};

export const heading: CSSProperties = {
  fontFamily: SANS,
  fontSize: "24px",
  lineHeight: "30px",
  fontWeight: 700,
  color: INK,
  margin: "24px 0 0",
};

export const paragraph: CSSProperties = {
  fontFamily: SANS,
  fontSize: "16px",
  lineHeight: "24px",
  color: INK,
  margin: "16px 0 0",
};

export const label: CSSProperties = {
  fontFamily: SANS,
  fontSize: "12px",
  lineHeight: "18px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: MUTED,
  margin: "16px 0 0",
};

export const value: CSSProperties = {
  fontFamily: SANS,
  fontSize: "16px",
  lineHeight: "24px",
  color: INK,
  margin: "2px 0 0",
  whiteSpace: "pre-wrap",
};

export function Shell({
  preview,
  footerText,
  children,
}: {
  /** Doubles as the `<title>`, so it says what the message is, not who sent
      it — the `email-best-practices` accessibility rule. */
  preview: string;
  /** A `ReactNode` rather than a `string` since step 4: the newsletter's
      welcome message is marketing, so its footer has to carry a visible
      unsubscribe `<Link>` inside the sentence. Widening the existing prop beats
      adding a second one — a `string` is still a `ReactNode`, so both step-3
      templates are untouched and there is only ever one footer. */
  footerText: ReactNode;
  children: ReactNode;
}) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Body style={body}>
        <Preview>{preview}</Preview>
        {/* `lang` and `dir` repeated on `<body>`'s direct child: several
            clients strip them from `<html>`. */}
        <Container lang="en" dir="ltr" style={container}>
          <Text style={wordmark}>Aetherfield</Text>
          {children}
          <Section style={rule}>
            <Text style={footer}>{footerText}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
