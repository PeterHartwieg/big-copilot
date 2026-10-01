"""Move the board script out of template/board.html into template/board.js.

    python tools/split_board_script.py          # split; a no-op when already split
    python tools/split_board_script.py --join   # the reverse: put board.js back inline

The board script is the body of the last <script> block of template/board.html.
Splitting writes that body, unchanged, to template/board.js and leaves the line
/*__BOARD_SCRIPT__*/ in its place; ba_dashboard.load_template() splices it back
before render() fills any other placeholder, so the page is the same string.

What it is for: a branch that edited the script while it was still inline in
board.html. Merging main into such a branch conflicts in board.html. When main
has not changed board.js since the split, take the branch's board.html (the
inline one, with its edits) and run this script: it rewrites both files. When
both sides changed the script, join main's two files with --join, merge the
inline pages with `git merge-file`, and split the result.

Line endings are kept as they are on disk; git normalises them on commit.
"""
import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from ba_dashboard import BOARD_SCRIPT_SLOT, splice_board_script  # noqa: E402

FOLDER = os.path.join(ROOT, "template")
PAGE = os.path.join(FOLDER, "board.html")
SCRIPT = os.path.join(FOLDER, "board.js")
OPEN, CLOSE = "<script>", "</script>"


def read(path: str) -> str:
    with open(path, encoding="utf-8", newline="") as fh:
        return fh.read()


def write(path: str, text: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def split(page: str) -> tuple[str, str] | None:
    """(board.html with the slot, board.js), or None when it is already split."""
    nl = "\r\n" if "\r\n" in page else "\n"
    slot = BOARD_SCRIPT_SLOT.replace("\n", nl)
    start = page.rindex(OPEN) + len(OPEN)
    end = page.index(CLOSE, start)
    if not page.startswith(nl, start):
        raise SystemExit("template/board.html: the last <script> tag is not on a line of its own")
    body = page[start + len(nl):end]
    if body == slot:
        return None
    if BOARD_SCRIPT_SLOT.strip() in page:
        raise SystemExit("template/board.html carries the slot and an inline script: resolve by hand")
    if not body.endswith(nl):
        raise SystemExit("template/board.html: </script> of the board script is not on a line of its own")
    new_page = page[:start + len(nl)] + slot + page[end:]
    # The splice gives back the page this started from, byte for byte.
    assert splice_board_script(new_page.replace("\r\n", "\n"), body.replace("\r\n", "\n")) == page.replace("\r\n", "\n")
    return new_page, body


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--join", action="store_true", help="put template/board.js back inline")
    args = ap.parse_args()
    page = read(PAGE)
    if args.join:
        nl = "\r\n" if "\r\n" in page else "\n"
        joined = splice_board_script(page.replace(nl, "\n"), read(SCRIPT).replace("\r\n", "\n"))
        write(PAGE, joined.replace("\n", nl))
        os.remove(SCRIPT)
        print("joined template/board.js into template/board.html")
        return 0
    result = split(page)
    if result is None:
        print("template/board.html is already split; nothing to do")
        return 0
    new_page, script = result
    write(SCRIPT, script)
    write(PAGE, new_page)
    print("split: template/board.js written, template/board.html carries %s" % BOARD_SCRIPT_SLOT.strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
