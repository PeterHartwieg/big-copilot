"""Move the board script out of template/board.html into template/board.js.

    python tools/split_board_script.py --resolve  # a merge or rebase stopped on template/board.html
    python tools/split_board_script.py            # split; a no-op when already split
    python tools/split_board_script.py --join     # the reverse: put board.js back inline

The board script is the body of the last <script> block of template/board.html.
Splitting writes that body, unchanged, to template/board.js and leaves the line
/*__BOARD_SCRIPT__*/ in its place; ba_dashboard.load_template() splices it back
before render() fills any other placeholder, so the page is the same string.

A branch that edited board.html while the script was still inline conflicts
with main in template/board.html when the two meet, by merge or by rebase
either way round. Resolve it with --resolve, and only with it: it takes the
three versions of board.html git staged (base, ours, theirs), splits each one
that still holds the script inline, takes board.js for a side that is already
split from git's stage for that side (or that side's commit when git staged
none), and merges board.html and board.js three ways
with `git merge-file`. Both sides' edits survive, the markup and CSS as well as
the script. A clean result is staged; otherwise both files keep git's conflict
markers for a human, and nothing is staged. Then continue the merge or rebase
as usual. Running --resolve again starts over from what git staged, so it drops
any hand edits made to the two files since.

It recognises a merge, a rebase and a cherry-pick of an ordinary commit, by
MERGE_HEAD, REBASE_HEAD or CHERRY_PICK_HEAD. `merge --squash`, `stash pop` and
`revert` leave none of these, and a cherry-pick of a merge commit (-m) is
refused: redo those as a plain merge, then run --resolve.

Splitting and joining by hand are for files without conflict markers: both
refuse a file that carries them.

Line endings are kept as they are on disk (--resolve writes both files in the
line endings of the conflicted board.html); git normalises them on commit.
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from ba_dashboard import BOARD_SCRIPT_SLOT, splice_board_script  # noqa: E402

PAGE_PATH, SCRIPT_PATH = "template/board.html", "template/board.js"
OPEN, CLOSE = "<script>", "</script>"
# Only the board script's block holds this line; another block taken for it is refused.
SIGNATURE = "let D = /*__DATA__*/"
CONFLICT = re.compile(r"^(<{7}|>{7})( |$)", re.M)


def read(path: str) -> str:
    with open(path, encoding="utf-8", newline="") as fh:
        return fh.read()


def write(path: str, text: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def refuse_conflicts(text: str, what: str) -> None:
    if CONFLICT.search(text):
        raise SystemExit(f"{what} carries conflict markers: run --resolve, or resolve by hand")


def split(page: str) -> tuple[str, str] | None:
    """(board.html with the slot, board.js), or None when it is already split."""
    refuse_conflicts(page, PAGE_PATH)
    nl = "\r\n" if "\r\n" in page else "\n"
    slot = BOARD_SCRIPT_SLOT.replace("\n", nl)
    start = page.rindex(OPEN) + len(OPEN)
    end = page.index(CLOSE, start)
    if not page.startswith(nl, start):
        raise SystemExit(f"{PAGE_PATH}: the last <script> tag is not on a line of its own")
    body = page[start + len(nl):end]
    slots = page.count(BOARD_SCRIPT_SLOT.strip())
    if body == slot:
        if slots > 1:
            raise SystemExit(f"{PAGE_PATH} carries {BOARD_SCRIPT_SLOT.strip()} more than once: resolve by hand")
        return None
    if slots:
        raise SystemExit(f"{PAGE_PATH} carries the slot and an inline script: resolve by hand")
    if SIGNATURE not in body:
        raise SystemExit(f"{PAGE_PATH}: the last <script> block is not the board script ({SIGNATURE!r} missing)")
    if not body.endswith(nl):
        raise SystemExit(f"{PAGE_PATH}: </script> of the board script is not on a line of its own")
    new_page = page[:start + len(nl)] + slot + page[end:]
    lf = lambda s: s.replace("\r\n", "\n")  # noqa: E731
    if splice_board_script(lf(new_page), lf(body)) != lf(page):
        raise SystemExit(f"{PAGE_PATH}: the split does not splice back to the page; nothing written")
    return new_page, body


def join(page: str, script: str) -> str:
    """board.html with board.js back inline, in the page's line endings."""
    refuse_conflicts(page, PAGE_PATH)
    refuse_conflicts(script, SCRIPT_PATH)
    nl = "\r\n" if "\r\n" in page else "\n"
    try:
        joined = splice_board_script(page.replace("\r\n", "\n"), script.replace("\r\n", "\n"))
    except ValueError as err:
        raise SystemExit(str(err))
    return joined.replace("\n", nl)


# ------------------------------------------------------------------ --resolve
def git(root: str, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True,
                          encoding="utf-8", check=check)


def show(root: str, spec: str) -> str | None:
    out = git(root, "show", spec, check=False)
    return out.stdout if out.returncode == 0 else None


def _commit(root: str, ref: str) -> str | None:
    out = git(root, "rev-parse", "-q", "--verify", ref + "^{commit}", check=False)
    return out.stdout.strip() if out.returncode == 0 else None


def side_commits(root: str) -> dict:
    """The commit each index stage of a stopped merge, rebase or cherry-pick
    comes from. Stage 2 is always HEAD: during a rebase HEAD is the branch
    being rebuilt on (main, say), and stage 3 the commit being replayed."""
    head = _commit(root, "HEAD")
    merge = _commit(root, "MERGE_HEAD")
    if merge:
        bases = git(root, "merge-base", head, merge, check=False).stdout.split()
        if not bases:
            raise SystemExit("--resolve: HEAD and MERGE_HEAD have no merge base; resolve by hand")
        return {1: bases[0], 2: head, 3: merge}
    for ref in ("REBASE_HEAD", "CHERRY_PICK_HEAD"):
        other = _commit(root, ref)
        if other:
            parents = git(root, "rev-list", "--parents", "-n", "1", other).stdout.split()[1:]
            if len(parents) != 1:
                raise SystemExit(f"--resolve: {ref} is a merge commit or a root commit; redo it as a "
                                 "plain merge, or resolve by hand")
            return {1: parents[0], 2: head, 3: other}
    raise SystemExit("--resolve: no merge, rebase or cherry-pick is in progress")


def side_files(root: str, stage: int, commit: str) -> tuple[str, str]:
    """(board.html, board.js) of one side, split if it still holds the script inline."""
    page = show(root, f":{stage}:{PAGE_PATH}")
    if page is None:
        page = show(root, f"{commit}:{PAGE_PATH}")
    if page is None:
        raise SystemExit(f"--resolve: {PAGE_PATH} is missing from stage {stage}; resolve by hand")
    parts = split(page)
    if parts is not None:
        return parts
    # When git staged board.js too, its stage is this side's version; the
    # side's commit stands in only where there is none.
    script = show(root, f":{stage}:{SCRIPT_PATH}")
    if script is None:
        script = show(root, f"{commit}:{SCRIPT_PATH}")
    if script is None:
        raise SystemExit(f"--resolve: {commit[:10]} has a split {PAGE_PATH} but no {SCRIPT_PATH}")
    return page, script


def merge3(ours: str, base: str, theirs: str, name: str) -> tuple[str, int]:
    """git merge-file of three texts: (result, conflicts)."""
    with tempfile.TemporaryDirectory() as tmp:
        paths = []
        for label, text in (("ours", ours), ("base", base), ("theirs", theirs)):
            path = os.path.join(tmp, label)
            write(path, text)
            paths.append(path)
        out = subprocess.run(["git", "merge-file", "-p", "-L", f"{name} (ours)", "-L", f"{name} (base)",
                              "-L", f"{name} (theirs)", *paths], capture_output=True)
    if out.returncode < 0 or out.returncode > 127:
        raise SystemExit(f"git merge-file failed on {name}: {out.stderr.decode(errors='replace')}")
    return out.stdout.decode("utf-8"), out.returncode


def resolve(root: str = ROOT) -> int:
    """Merge board.html and board.js three ways; the number of files left in conflict."""
    commits = side_commits(root)
    base, ours, theirs = (side_files(root, stage, commits[stage]) for stage in (1, 2, 3))
    on_disk = os.path.join(root, PAGE_PATH)
    crlf = os.path.exists(on_disk) and "\r\n" in read(on_disk)
    merged = [merge3(ours[i], base[i], theirs[i], path) for i, path in enumerate((PAGE_PATH, SCRIPT_PATH))]
    left = []
    for path, (text, conflicts) in zip((PAGE_PATH, SCRIPT_PATH), merged):
        text = text.replace("\r\n", "\n")
        write(os.path.join(root, path), text.replace("\n", "\r\n") if crlf else text)
        if conflicts:
            left.append(path)
    if left:
        print("conflicts left in " + " and ".join(left) + ": resolve them by hand, then git add both "
              "files (running --resolve again starts over from the index and drops hand edits)")
        return len(left)
    git(root, "add", PAGE_PATH, SCRIPT_PATH)
    print(f"resolved and staged {PAGE_PATH} and {SCRIPT_PATH}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--resolve", action="store_true", help="merge both files of a merge, rebase or cherry-pick stopped on board.html")
    mode.add_argument("--join", action="store_true", help="put template/board.js back inline")
    args = ap.parse_args()
    if args.resolve:
        return 1 if resolve() else 0
    page_file, script_file = os.path.join(ROOT, PAGE_PATH), os.path.join(ROOT, SCRIPT_PATH)
    page = read(page_file)
    if args.join:
        joined = join(page, read(script_file))
        write(page_file, joined)
        os.remove(script_file)
        print(f"joined {SCRIPT_PATH} into {PAGE_PATH}")
        return 0
    result = split(page)
    if result is None:
        print(f"{PAGE_PATH} is already split; nothing to do")
        return 0
    new_page, script = result
    write(script_file, script)
    write(page_file, new_page)
    print(f"split: {SCRIPT_PATH} written, {PAGE_PATH} carries {BOARD_SCRIPT_SLOT.strip()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
