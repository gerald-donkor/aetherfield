#!/usr/bin/env python3
"""
Convert the DESNZ ("DEFRA") GHG conversion-factor workbook's flat-format sheet
into the CSV the seeder reads.

    python3 scripts/defra-xlsx-to-csv.py <workbook.xlsx> lib/db/seed/defra-2026-factors.csv

Run once per published revision. The derived CSV is committed; the workbook is
not, and neither is a spreadsheet dependency — build step 10 deliberately adds
no xlsx parser to the application (the seeder reads this output with the pure
`parseCsv` already in `lib/domain/csv.ts`). This script is stdlib-only: an
`.xlsx` is a zip of XML, which `zipfile` and `ElementTree` read without help.

Three things this does that a naive conversion does not, each of which would be
a silent error in a disclosure figure:

1. **It reads the sheet's raw `<v>` text, not a rendered cell.** The workbook's
   display format shows fewer digits than it stores.

2. **It recovers the published decimal from Excel's serialization.** An `.xlsx`
   stores a binary double, and Excel writes it with up to 17 significant
   digits: the published `1.74296` appears in the XML as
   `1.7429600000000001`. `repr(float(...))` returns the shortest decimal that
   round-trips to the same double, which recovers `1.74296` exactly.

   Where the stored double is itself a computed value, the shortest round-trip
   form keeps all 17 digits, and those trailing digits are floating-point noise
   from DEFRA's own spreadsheet rather than published precision. Measured over
   the 2026 set: 7,007 valued rows carry 10 significant digits or fewer,
   **nothing carries 11 to 15**, and 28 rows carry 16 or 17. Rounding to
   `SIGNIFICANT_DIGITS` = 12 therefore sits inside that gap — it collapses
   exactly those 28 (`0.13388999999999998` becomes `0.13389`) and leaves the
   other 7,007 bit-identical. `--report` prints both counts so the claim is
   re-checkable against any later revision rather than trusted from here.

3. **It never writes an exponent.** `numeric` accepts one, but the seed file is
   read by a hand-written CSV parser and diffed by people; `3.3152e-06` and
   `0.0000033152` are the same number and only one of them is legible in a
   column of decimals.

Rows whose factor column is empty are kept, with an empty `value`. DEFRA
publishes 1,705 such rows in the 2026 set — the hierarchy exists but no number
applies to it. The seeder skips them rather than storing a null a mapping could
later select; keeping them here means this file is the sheet, and the skip is
one decision made in one place.
"""

from __future__ import annotations

import csv
import re
import sys
import zipfile
from decimal import Context, Decimal, ROUND_HALF_UP
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# The flat sheet's ten columns, in sheet order. `id` is DEFRA's own stable row
# identifier and is what makes the seeder idempotent.
COLUMNS = [
    "id",
    "scope",
    "level_1",
    "level_2",
    "level_3",
    "level_4",
    "column_text",
    "uom",
    "ghg_unit",
    "value",
]

# The sheet's data starts here; rows 1-5 are the title block and row 6 is the
# header. Read back from the workbook's own `_FilterDatabase` defined name,
# which the 2026 file gives as 'Factors by Category'!$A$6:$J$8746.
FIRST_DATA_ROW = 7

SIGNIFICANT_DIGITS = 12

_ROUND = Context(prec=SIGNIFICANT_DIGITS, rounding=ROUND_HALF_UP)


def column_index(ref: str) -> int:
    """`"C7"` -> 2. Cells are addressed, not positional: a row's XML omits
    empty cells entirely, so reading `<c>` elements in order shifts columns."""
    n = 0
    for ch in re.match(r"([A-Z]+)", ref).group(1):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return [
        "".join(t.text or "" for t in si.iter(f"{NS}t"))
        for si in root.findall(f"{NS}si")
    ]


def row_cells(row: ET.Element, shared: list[str]) -> dict[int, str]:
    out: dict[int, str] = {}
    for cell in row.findall(f"{NS}c"):
        kind = cell.get("t")
        value = cell.find(f"{NS}v")
        if kind == "s":
            text = shared[int(value.text)] if value is not None else ""
        elif kind == "inlineStr":
            inline = cell.find(f"{NS}is")
            text = (
                "".join(t.text or "" for t in inline.iter(f"{NS}t"))
                if inline is not None
                else ""
            )
        else:
            text = value.text if value is not None else ""
        out[column_index(cell.get("r"))] = text
    return out


def published_decimal(raw: str) -> tuple[str, bool]:
    """The stored double as a plain decimal string, and whether rounding to
    `SIGNIFICANT_DIGITS` moved it. See the module docstring, point 2."""
    exact = Decimal(repr(float(raw)))
    rounded = _ROUND.plus(exact)
    text = format(rounded.normalize(), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text, float(text) != float(raw)


def find_sheet(archive: zipfile.ZipFile, name: str) -> str:
    """Resolve a sheet name to its part, through the workbook relationships —
    sheet order and `sheetN.xml` numbering are not the same thing."""
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rel_ns = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
    rid = None
    for sheet in workbook.iter(f"{NS}sheet"):
        if sheet.get("name") == name:
            rid = sheet.get(f"{rel_ns}id")
    if rid is None:
        raise SystemExit(f"no sheet named {name!r} in this workbook")

    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for rel in rels:
        if rel.get("Id") == rid:
            target = rel.get("Target")
            return target if target.startswith("xl/") else f"xl/{target.lstrip('/')}"
    raise SystemExit(f"unresolved relationship {rid!r}")


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--report"]
    report = "--report" in sys.argv[1:]
    if len(args) != 2:
        raise SystemExit(__doc__.strip().splitlines()[2].strip())

    source, destination = args
    archive = zipfile.ZipFile(source)
    shared = shared_strings(archive)
    sheet = ET.fromstring(archive.read(find_sheet(archive, "Factors by Category")))

    rows: list[list[str]] = []
    rounded_count = 0
    blank_count = 0

    for row in sheet.find(f"{NS}sheetData").findall(f"{NS}row"):
        if int(row.get("r")) < FIRST_DATA_ROW:
            continue
        cells = row_cells(row, shared)
        fields = [(cells.get(i) or "").strip() for i in range(len(COLUMNS))]
        # The sheet ends with a blank line and an 'END' marker row, neither of
        # which carries an id.
        if not fields[0]:
            continue
        if fields[-1]:
            fields[-1], moved = published_decimal(fields[-1])
            rounded_count += moved
        else:
            blank_count += 1
        rows.append(fields)

    with open(destination, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(COLUMNS)
        writer.writerows(rows)

    if report:
        scopes: dict[str, int] = {}
        for row in rows:
            scopes[row[1]] = scopes.get(row[1], 0) + 1
        print(f"rows            {len(rows)}")
        for scope in sorted(scopes):
            print(f"  {scope:<20} {scopes[scope]}")
        print(f"with a value    {len(rows) - blank_count}")
        print(f"blank value     {blank_count}")
        print(f"noise rounded   {rounded_count}")


if __name__ == "__main__":
    main()
