#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
containerfile="$repo_root/tools/playwright-webkit/Containerfile"

if ! command -v podman >/dev/null 2>&1; then
  echo "Podman is required for WebKit on Arch Linux." >&2
  echo "Install it with: sudo pacman -S --needed podman" >&2
  exit 1
fi

playwright_version=$(
  cd "$repo_root"
  node -p "require('@playwright/test/package.json').version"
)
pinned_version=$(sed -n 's/^ARG PLAYWRIGHT_VERSION=//p' "$containerfile")

if [ -z "$pinned_version" ] || [ "$playwright_version" != "$pinned_version" ]; then
  echo "Playwright version mismatch: project=$playwright_version container=${pinned_version:-missing}." >&2
  echo "Update PLAYWRIGHT_VERSION in tools/playwright-webkit/Containerfile before running WebKit." >&2
  exit 1
fi

image="localhost/aetherfield-playwright-webkit:$playwright_version"

if ! podman image exists "$image"; then
  podman build \
    --build-arg "PLAYWRIGHT_VERSION=$playwright_version" \
    --file "$containerfile" \
    --tag "$image" \
    "$repo_root/tools/playwright-webkit"
fi

# `E2E_LIFECYCLE_BROWSER` — the lifecycle projects launch WebKit, the only engine
# this image carries (prompt 128; see the comment in playwright.config.ts).
#
# The container's Neon handshake budget is not set here: it is the same problem
# on both legs of the matrix, and it is fixed once, in `e2e/support/database.ts`
# and `playwright.config.ts`'s `webServer.env`.
exec podman run \
  --rm \
  --ipc=host \
  --userns=keep-id \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp \
  --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  --env E2E_LIFECYCLE_BROWSER=webkit \
  --volume "$repo_root:/work" \
  --workdir /work \
  "$image" \
  node_modules/.bin/playwright test --project=webkit "$@"
