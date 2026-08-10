# Containerized Playwright WebKit on Arch Linux

## Scope and why this is next

Make Playwright's WebKit project genuinely runnable from this Arch Linux
workstation without replacing Arch system libraries or copying foreign shared
objects onto the host. Chromium and Firefox continue to run natively; WebKit
runs inside a pinned Debian-based container under rootless Podman.

This is next because prompt 51 initialized Playwright successfully for Chromium
and Firefox, but Playwright does not support Arch Linux as a WebKit host. The
current fallback download is an Ubuntu build whose ICU and other shared-library
requirements do not match Arch. A reproducible container boundary closes that
remaining acceptance gap without destabilizing the workstation.

## Reference material read

- `AGENTS.md`, especially the implementation workflow, command-reporting rules,
  prompt contract, and byte-stable marketing-site boundary.
- `docs/automation.md`, especially the existing Playwright setup, port rules,
  production-server test path, build comparison procedure, and recorded Arch
  WebKit failure.
- `package.json`, `package-lock.json`, `playwright.config.ts`, and
  `e2e/home.spec.ts`.
- `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md` for the
  installed Next.js version's Playwright guidance.
- Playwright's official Docker documentation:
  `https://playwright.dev/docs/docker`.
- Playwright's official browser installation and supported-system guidance:
  `https://playwright.dev/docs/browsers` and
  `https://playwright.dev/docs/intro#system-requirements`.
- Podman's official build and run documentation:
  `https://docs.podman.io/en/latest/markdown/podman-build.1.html` and
  `https://docs.podman.io/en/latest/markdown/podman-run.1.html`.
- The installed Arch package metadata from `pacman -Si podman`: Podman is
  available from Arch's official `extra` repository, but is not installed.
- Microsoft Container Registry checks performed on 9 Aug 2026: the expected
  Playwright `v1.62.0-noble` and `v1.62.1-noble` image tags return HTTP 404.
  Therefore this work must build an exact-version image from an official Node
  Debian base rather than depending on a missing prebuilt Playwright image.

## SKILLS USED

- `agent-browser` — verified the available browser-automation surface and its
  limits; its Chromium-only CLI is not a substitute for Playwright WebKit.
- `nextjs` — keeps the Playwright production build/start workflow aligned with
  this Next.js 16 application.
- `next-best-practices` — checks the framework-native test setup and prevents
  the test harness from changing application rendering behavior.

## Current measured state

- The project uses `@playwright/test` `1.62.1` as a direct development
  dependency.
- The current Playwright configuration contains Chromium and Firefox desktop
  projects, starts a production Next.js server on `127.0.0.1:3100`, and runs one
  role-based homepage smoke test.
- `npm run test:e2e` currently passes two tests: Chromium and Firefox.
- Playwright's WebKit browser archive can be downloaded on Arch, but launching
  it fails because the fallback Ubuntu executable requires incompatible or
  absent host libraries, including an older ICU ABI.
- `npx playwright install-deps --dry-run webkit` attempts to invoke `apt-get`,
  which is not available on Arch and would not be an appropriate host-package
  strategy.
- No Docker-compatible container runtime is currently installed. Arch's
  official Podman package is available and supports rootless containers.

## Implementation

### 1. Install and verify the host prerequisite

Install Podman from Arch's official repository:

```sh
sudo pacman -S --needed podman
```

This is an intentional host-level change and requires the user's explicit
execution approval. Do not install Docker, enable a privileged daemon, replace
system ICU, or copy Debian/Ubuntu libraries onto Arch. Verify rootless operation
with `podman info` before changing the npm test contract.

If rootless Podman needs a documented one-time user-namespace configuration on
this machine, diagnose it from the exact `podman info` error and apply only the
minimum Arch-supported setup. Record the exact additional step in
`docs/automation.md`; do not guess or silently switch to rootful containers.

### 2. Add a small, pinned WebKit image definition

Add `tools/playwright-webkit/Containerfile` using an official Node 22 Bookworm
base. Install only WebKit and its Linux dependencies with Playwright's supported
installer:

```Dockerfile
FROM node:22-bookworm

ARG PLAYWRIGHT_VERSION=1.62.1
RUN npx -y playwright@${PLAYWRIGHT_VERSION} install --with-deps webkit

WORKDIR /work
```

Keep the Playwright version explicit and equal to the project's installed
`@playwright/test` version. The build context must be the small
`tools/playwright-webkit/` directory so the repository, `.env.local`, build
artifacts, and dependencies are not copied into an image layer.

### 3. Add the rootless runner

Add `scripts/playwright-webkit.sh`. It must:

1. use POSIX shell with `set -eu`;
2. fail with a concise installation instruction when `podman` is absent;
3. resolve the repository root without assuming the caller's current directory;
4. read the installed Playwright version from the local package metadata;
5. verify that it is exactly the version pinned by the Containerfile, failing
   with a clear rebuild/update instruction on mismatch;
6. tag the image with that version, for example
   `localhost/aetherfield-playwright-webkit:1.62.1`;
7. build the image only when that exact tag is absent, using
   `tools/playwright-webkit/` as its build context;
8. launch it rootlessly with `--rm`, `--ipc=host`, the repository bind-mounted
   at `/work`, and `/work` as the working directory;
9. run the repository's local Playwright CLI with
   `playwright test --project=webkit`, forwarding any extra shell-script
   arguments after that project selector;
10. preserve host ownership of any bind-mounted report artifacts and leave no
    running container after success or failure.

The Next.js production server and WebKit process must run inside the same
container. The existing `127.0.0.1:3100` configuration therefore remains valid
and does not need host networking or an exposed host port.

Do not install npm dependencies inside the mounted repository. The container
uses the existing bind-mounted `node_modules`; confirm that this works with the
project's dependencies before accepting the design. If a native dependency
proves ABI-incompatible, replace this detail with a container-only dependency
volume/cache that does not overwrite the host's `node_modules`, and document
the measured solution.

### 4. Restore the WebKit project and split native/container scripts

Restore the desktop WebKit project in `playwright.config.ts` using Playwright's
verified `devices["Desktop Safari"]` descriptor. Keep all existing server,
reporter, trace, CI, hostname, port, and output settings unchanged.

Update `package.json` so the command contract is explicit:

- `test:e2e:local` runs Chromium and Firefox natively;
- `test:e2e:webkit` invokes `sh scripts/playwright-webkit.sh`;
- `test:e2e` runs the native suite and then the containerized WebKit suite;
- `test:e2e:ui` remains a native Chromium/Firefox UI command, because the
  WebKit container path is intentionally headless.

Do not make a three-project unqualified native Playwright command the main Arch
test path: it would attempt to launch the unsupported WebKit binary on the host.
`npx playwright test --list` may still enumerate all three project cases and is
used as a configuration check, not the execution command.

### 5. Document the exact workflow and results

Update `docs/automation.md` to replace the current "WebKit is unsupported here"
endpoint with:

- the rootless Podman prerequisite and exact Arch installation command;
- why host library surgery is rejected;
- the image definition, exact Playwright-version coupling, and small build
  context;
- first-run build behavior and measured image/build characteristics;
- subsequent `npm run test:e2e:webkit` and full `npm run test:e2e` commands;
- the local UI limitation;
- the exact successful command output from this implementation;
- the rebuild behavior after a Playwright upgrade;
- cleanup commands for the versioned image, clearly marked optional and
  destructive only to the reproducible local container image.

Update the script list in `AGENTS.md` to describe the new local, WebKit, full,
and UI test commands. This is a command-contract update, not a build record.

## Expected impact

- Playwright lists three desktop browser projects: Chromium, Firefox, and
  WebKit.
- Chromium and Firefox execute natively on Arch.
- WebKit executes successfully inside a pinned Debian container through
  rootless Podman.
- `npm run test:e2e` becomes the complete cross-browser acceptance command and
  passes all three project cases across its two execution environments.
- The application source and rendered markup do not change.
- Every existing prerendered HTML file must remain byte-identical after
  normalizing only the Next.js build ID, following `docs/automation.md`.

## Non-goals

- No application UI, behavior, content, server action, API, database, auth,
  email, storage, or provider change.
- No new E2E scenarios beyond the existing homepage smoke test.
- No Docker daemon, Docker Desktop, privileged/rootful container workflow, or
  Kubernetes configuration.
- No attempt to make Playwright's Ubuntu WebKit executable link directly
  against Arch's libraries.
- No replacement or downgrade of Arch's ICU, libxml2, Flite, or other system
  packages.
- No copied foreign `.so` files, ad-hoc `LD_LIBRARY_PATH`, patched browser
  binary, or unsupported Playwright browser archive.
- No CI workflow in this prompt; this task fixes the approved local Arch
  development path.
- No tracked Playwright reports, test results, browser caches, image layers, or
  container state.
- No staging or modification of unrelated existing skill-installation changes
  in the dirty worktree.

## Checks

Run every check and record its exact output; do not infer a pass:

1. `podman --version`
2. `podman info` with evidence that it is rootless
3. `npx playwright --version`
4. `npx playwright test --list` — exactly three cases in one spec
5. `npm run test:e2e:local` — Chromium and Firefox pass natively
6. `npm run test:e2e:webkit` — WebKit passes in the container
7. `npm run test:e2e` — the complete public command passes all three browser
   cases through its native and container phases
8. `npm run lint`
9. `npm run typecheck`
10. `npm run build`
11. Compare fresh `.next/server/app/**/*.html` output with a clean baseline from
    the parent commit, replacing only each side's exact build ID. File lists,
    counts, and normalized bytes must match.
12. `git diff --check`
13. Inspect `git status --short --ignored` and confirm that reports, results,
    image/container state, `.next`, browser caches, and other generated outputs
    are not tracked.

If WebKit does not launch and pass, the task is not complete. Preserve and
report the exact failing command rather than claiming that downloading the
browser or building the image proves operation.

## Completion and commit boundary

Record the implementation and measured check results in `docs/automation.md`.
Stage only prompt 55's files and the deliberate command-contract edits. Preserve
the unrelated pre-existing skill installation changes. Commit the completed
work to `main` without pushing.
