#!/usr/bin/env python3
"""Align GFM tables to markdownlint's MD060 "aligned" style.

markdownlint enforces MD060 ("aligned") but ships no fixer for it, and Prettier
is configured to ignore Markdown in this repo — so this script is the fixer.

Usage:
    python3 scripts/align-markdown-tables.py [PATHS...]   # rewrite in place
    python3 scripts/align-markdown-tables.py --check [...] # report only, exit 1 if any would change

With no PATHS, every *.md under the repo is processed (excluding build/vendor
dirs). It skips fenced code blocks and respects pipes inside `inline code` and
escaped \\| so cell content is never mangled.
"""

import os
import re
import sys

EXCLUDE_DIRS = {
    "node_modules", ".git", ".nx", ".angular", "dist", "coverage", "tmp",
    "out-tsc", ".venv", "__pycache__",
}


def split_cells(line):
    """Split a table row into trimmed cells, respecting `code` spans and \\| escapes."""
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|") and not s.endswith("\\|"):
        s = s[:-1]
    cells, buf = [], []
    i, n, backtick_run = 0, len(s), 0
    while i < n:
        c = s[i]
        if c == "\\" and i + 1 < n:
            buf.append(c)
            buf.append(s[i + 1])
            i += 2
            continue
        if c == "`":
            j = i
            while j < n and s[j] == "`":
                j += 1
            run = j - i
            if backtick_run == 0:
                backtick_run = run
            elif backtick_run == run:
                backtick_run = 0
            buf.append("`" * run)
            i = j
            continue
        if c == "|" and backtick_run == 0:
            cells.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(c)
        i += 1
    cells.append("".join(buf))
    return [c.strip() for c in cells]


def is_delim(cells):
    return bool(cells) and all(re.fullmatch(r":?-+:?", c.strip()) for c in cells) \
        and any("-" in c for c in cells)


def align_of(cell):
    d = cell.strip()
    left, right = d.startswith(":"), d.endswith(":")
    return "c" if left and right else "r" if right else "l" if left else "n"


def pad(content, width, align):
    extra = width - len(content)
    if extra <= 0:
        return content
    if align == "r":
        return " " * extra + content
    if align == "c":
        left = extra // 2
        return " " * left + content + " " * (extra - left)
    return content + " " * extra


def format_table(rows):
    ncol = max(len(cells) for _, cells in rows)
    delim = next((cells for kind, cells in rows if kind == "delim"), None)
    aligns = [align_of(delim[ci]) if delim and ci < len(delim) else "n" for ci in range(ncol)]
    widths = [3] * ncol
    for kind, cells in rows:
        if kind == "delim":
            continue
        for ci in range(ncol):
            cell = cells[ci] if ci < len(cells) else ""
            widths[ci] = max(widths[ci], len(cell))
    out = []
    for kind, cells in rows:
        parts = []
        for ci in range(ncol):
            w, a = widths[ci], aligns[ci]
            if kind == "delim":
                if a == "c":
                    parts.append(":" + "-" * (w - 2) + ":")
                elif a == "r":
                    parts.append("-" * (w - 1) + ":")
                elif a == "l":
                    parts.append(":" + "-" * (w - 1))
                else:
                    parts.append("-" * w)
            else:
                parts.append(pad(cells[ci] if ci < len(cells) else "", w, a))
        out.append("| " + " | ".join(parts) + " |")
    return out


def process(text):
    lines = text.split("\n")
    out, i, n, fence = [], 0, len(lines), None
    while i < n:
        line = lines[i]
        m = re.match(r"(```+|~~~+)", line.lstrip())
        if m:
            tok = m.group(1)[0]
            fence = tok if fence is None else (None if fence == tok else fence)
            out.append(line)
            i += 1
            continue
        if fence is not None:
            out.append(line)
            i += 1
            continue
        if "|" in line and i + 1 < n and "|" in lines[i + 1]:
            header = split_cells(line)
            delim = split_cells(lines[i + 1])
            if header and is_delim(delim):
                indent = line[: len(line) - len(line.lstrip())]
                rows = [("row", header), ("delim", delim)]
                j = i + 2
                while j < n and "|" in lines[j] and lines[j].strip() \
                        and not re.match(r"(```+|~~~+)", lines[j].lstrip()):
                    rows.append(("row", split_cells(lines[j])))
                    j += 1
                out.extend(indent + fl for fl in format_table(rows))
                i = j
                continue
        out.append(line)
        i += 1
    return "\n".join(out)


def discover():
    found = []
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        found.extend(os.path.join(root, f) for f in files if f.endswith(".md"))
    return sorted(found)


def main():
    args = sys.argv[1:]
    check = "--check" in args
    paths = [a for a in args if a != "--check"] or discover()
    changed = []
    for path in paths:
        with open(path, "r", encoding="utf-8") as f:
            orig = f.read()
        new = process(orig)
        if new == orig:
            continue
        changed.append(path)
        if not check:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new)
    if check:
        if changed:
            print("Tables not aligned (run: just align-tables):")
            print("\n".join(f"  {p}" for p in changed))
            sys.exit(1)
        print("All Markdown tables are aligned.")
        return
    for p in changed:
        print(f"aligned: {p}")
    print(f"reformatted {len(changed)} file(s)")


if __name__ == "__main__":
    main()
