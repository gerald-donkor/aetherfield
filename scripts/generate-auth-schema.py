#!/usr/bin/env python3
"""Regenerate Better Auth's Drizzle schema without leaving `server-only` off.

Why this exists
---------------
`npx auth@latest generate` cannot evaluate a config module that carries
`import "server-only"` — it refuses with:

    Please remove import 'server-only' from your auth config file temporarily.

Every module under `lib/` that touches a secret carries that guard on purpose
(AGENTS.md 6.3): the import exists so a mistaken client import is a *build*
error rather than a leaked key at runtime. Step 6 cleared this by hand, and
`docs/backend.md` records it — the guards were removed for the generator
process and restored immediately afterwards.

Doing that by hand is the failure mode. If the generator throws, or the shell
is interrupted between the two halves, the guards stay off and the next commit
silently ships a codebase whose client-import protection is gone.

So this script holds every original file body in memory and restores it in a
`finally`. The guards are off only for the duration of one subprocess, and they
go back whether it succeeds, fails or raises.

It writes to a scratch path and NEVER to `lib/db/auth-schema.ts`. That file is
not purely generated — it carries hand-added indexes, the `rate_limit` table
and a `relations()` block — so the output is diffed and merged by hand
(AGENTS.md 12 rule 1: read the diff, do not assume it).

Usage
-----
    python3 scripts/generate-auth-schema.py [--output PATH]
"""

from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
GUARD = 'import "server-only";\n'
DEFAULT_OUTPUT = REPO / ".auth-schema.generated.ts"


def guarded_files() -> list[pathlib.Path]:
    """Every module under `lib/` whose first line is the guard.

    Deliberately the whole tree rather than a hand-maintained list of the CLI's
    import graph: the graph changes whenever a plugin is added, and a list that
    silently goes stale would leave the generator failing on a file nobody
    thought to include.
    """
    found = []
    for path in sorted(REPO.joinpath("lib").rglob("*.ts")):
        if path.read_text(encoding="utf-8").startswith(GUARD):
            found.append(path)
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=pathlib.Path,
        default=DEFAULT_OUTPUT,
        help="where to write the generated schema (never lib/db/auth-schema.ts)",
    )
    args = parser.parse_args()

    output = args.output.resolve()
    if output == REPO / "lib" / "db" / "auth-schema.ts":
        print(
            "Refusing to overwrite lib/db/auth-schema.ts — it carries "
            "hand-added indexes, the rate_limit table and a relations() block. "
            "Generate to a scratch path and merge the diff by hand.",
            file=sys.stderr,
        )
        return 2

    targets = guarded_files()
    if not targets:
        print("No server-only guards found under lib/ — nothing to strip.")
    originals = {path: path.read_text(encoding="utf-8") for path in targets}

    print(f"Stripping the guard from {len(targets)} file(s) under lib/ ...")
    try:
        for path, body in originals.items():
            path.write_text(body[len(GUARD) :], encoding="utf-8")

        completed = subprocess.run(
            [
                "npx",
                "auth@latest",
                "generate",
                "--config",
                "lib/auth/cli.ts",
                "--output",
                str(output),
                "--yes",
            ],
            cwd=REPO,
            check=False,
        )
    finally:
        # The whole point of the script. Runs on success, on a generator
        # failure, and on KeyboardInterrupt.
        for path, body in originals.items():
            path.write_text(body, encoding="utf-8")
        print(f"Restored the guard in {len(originals)} file(s).")

    if completed.returncode != 0:
        print("Generator failed — see its output above.", file=sys.stderr)
        return completed.returncode

    print(f"\nGenerated: {output}")
    print("Diff it against lib/db/auth-schema.ts and merge the additions by hand.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
