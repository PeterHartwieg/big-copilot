"""Extract a wiki catalogue from the game's own help text.

    python tools/extract_wiki.py --business giftshop --out research/wiki-data/gift-shop.json

Reads the locale file the game ships (default: the install
`ba_save.find_game_locale()` detects, or the one `BA_LOCALE` names) and, when
present, the help menu's own table of contents beside it, and writes the facts
they state as a catalogue of records: business types with their ranges, items,
recipes and workstations. Every record carries the locale keys it was read
from; the catalogue carries the SHA256 of each source file. The raw help text
is written out beside the parsed facts, so a page the parser half understood is
still there to read.

Nothing here is runtime truth. The help can lag the running game, so these are
documented game facts; see docs/wiki-data-pipeline.md for the limits.

    --all             every business type, not just the selected ones
    --business SLUG   a business type's tail slug, repeatable (giftshop)
    --list            list the business types the locale has pages for
    --out PATH        where to write the catalogue
    --compare PATH    diff against an earlier catalogue and report it
    --no-raw          leave the raw help text out of the output
    --locale PATH     another locale file
    --data-dir PATH   the game's Big Ambitions_Data directory
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import wiki_data  # noqa: E402  (tools/ is the package, the repo root is the import root)


RESEARCH_DIR = os.path.join("research", "wiki-data")


def game_data_dir(locale_path: str) -> str | None:
    """The game data directory an en.json belongs to, or None if it is loose.

    Only the game's own layout, <game>/.../StreamingAssets/locale/en.json, puts
    helpstructure.json and the Steam manifest where this module looks for them.
    BA_LOCALE can name an en.json anywhere, so every caller that needs the rest
    of the install asks here rather than deriving a directory from whatever
    parent the path happens to have.
    """
    # Resolved first, not just absolutised: a path can reach the right file
    # through "..", a link, or an 8.3 short name such as STREAMI~1, and judging
    # it by its spelling would refuse an install that really is one.
    locale_dir, _ = os.path.split(os.path.realpath(locale_path))
    streaming_dir, locale_name = os.path.split(locale_dir)
    if locale_name.lower() != "locale":
        return None
    if os.path.basename(streaming_dir).lower() != "streamingassets":
        return None
    return os.path.dirname(streaming_dir)


def default_paths(data_dir: str | None) -> dict:
    """Where the sources live: the game install the dashboard already knows."""
    if data_dir is None:
        from ba_save import find_game_locale

        # The detected install, on every platform. DEFAULT_LOCALE is already
        # the first candidate, so nothing found here means nothing anywhere.
        default_locale = find_game_locale()
        if not default_locale:
            raise wiki_data.SourceError(
                "no game text found; set BA_LOCALE to your game's en.json, at "
                "<game>/.../StreamingAssets/locale/en.json, or pass --data-dir"
            )
        # .../StreamingAssets/locale/en.json -> .../Big Ambitions_Data
        data_dir = game_data_dir(default_locale)
        if data_dir is None:
            raise wiki_data.SourceError(
                f"{default_locale} is not inside a game install: the wiki reads "
                "helpstructure.json beside the locale folder, so the path has to be "
                "<game>/.../StreamingAssets/locale/en.json. Point BA_LOCALE at the "
                "game's own en.json, or pass --data-dir"
            )
        # Kept from the path itself, so its real spelling survives.
        streaming_dir = os.path.dirname(os.path.dirname(default_locale))
    else:
        data_dir = os.path.abspath(data_dir)
        # Accept direct StreamingAssets paths used by earlier callers too.
        if os.path.basename(data_dir).lower() == "streamingassets":
            streaming_dir = data_dir
            data_dir = os.path.dirname(data_dir)
        else:
            streaming_dir = os.path.join(data_dir, "StreamingAssets")
        default_locale = os.path.join(streaming_dir, "locale", "en.json")
    return {
        "data_dir": data_dir,
        "locale": default_locale,
        "help_structure": os.path.join(streaming_dir, "helpstructure.json"),
    }


def find_steam_manifest(data_dir: str | None) -> str | None:
    """The game's appmanifest, next to the install Steam laid it down.

    The id lives in steamapps, which is two levels above the game root on the
    Windows and Linux layouts but four inside a macOS .app bundle, so walk up
    looking for the manifest beside a common/ rather than counting levels or
    trusting a folder name. When it is not readable the extraction goes on
    without it and says so, which is why this returns a path, not a build id.
    """
    if not data_dir:
        return None
    here, below = os.path.abspath(data_dir), ""
    while True:
        # steamapps is recognised by holding the manifest next to the common/
        # the walk came up through, not by its own name: a library mapped to a
        # drive or a share has an empty basename at its root. Requiring common/
        # keeps a copy stored elsewhere under the library from borrowing the
        # real install's build id.
        if below.lower() == "common":
            candidate = os.path.join(here, "appmanifest_1331550.acf")
            if os.path.isfile(candidate):
                return candidate
        parent = os.path.dirname(here)
        if parent == here:  # the filesystem root, and no library on the way
            return None
        here, below = parent, os.path.basename(here)


def build_metadata(args, data_dir: str | None) -> dict:
    """Build metadata that was actually observed, or the honest nulls."""
    manifest = args.steam_manifest or (None if args.no_steam_lookup else find_steam_manifest(data_dir))
    if not manifest:
        return wiki_data._unknown_build()
    try:
        return wiki_data.steam_build_id(manifest)
    except wiki_data.SourceError as exc:
        print(f"note: {exc}; build id left unknown", file=sys.stderr)
        return wiki_data._unknown_build()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--data-dir", help="Big Ambitions_Data directory (default: the Steam install)")
    parser.add_argument("--locale", help="locale en.json (default: <data-dir>/StreamingAssets/locale/en.json)")
    parser.add_argument("--help-structure", help="helpstructure.json (default: <data-dir>/StreamingAssets/helpstructure.json)")
    parser.add_argument("--out", help="output path (default: research/wiki-data/<selection>.json)")
    parser.add_argument("--business", action="append", dest="businesses", help="business type slug to extract")
    parser.add_argument("--all", action="store_true", help="extract every business type")
    parser.add_argument("--list", action="store_true", help="list the business types and exit")
    parser.add_argument("--compare", help="an earlier catalogue to diff this one against")
    parser.add_argument("--no-raw", action="store_true", help="omit the raw help text from the output")
    parser.add_argument("--steam-manifest", help="appmanifest_<id>.acf to read the Steam build id from")
    parser.add_argument("--no-steam-lookup", action="store_true", help="do not look for the appmanifest")
    args = parser.parse_args(argv)

    # Detecting the install can now refuse a BA_LOCALE that is not inside one.
    # That gate protects the paths this run would otherwise have to guess, so a
    # caller who named both of them does not need it -- and either way the
    # refusal leaves through fail(), like every other bad source.
    try:
        paths = default_paths(args.data_dir)
    except wiki_data.SourceError as exc:
        # Only the locale is required: the help structure is a bonus and the
        # data directory feeds the Steam build id, which already degrades to an
        # honest unknown. So a run that named its locale does not need the
        # install this gate protects.
        if not args.locale:
            return fail(exc)
        paths = {"data_dir": None, "locale": None, "help_structure": None}
    locale_path = args.locale or paths["locale"]
    structure_path = args.help_structure or paths["help_structure"]

    try:
        locale = wiki_data.load_locale(locale_path)
    except wiki_data.SourceError as exc:
        return fail(exc)

    if args.list:
        for slug in sorted(wiki_data._select_businesses(locale, None)):
            print(slug)
        return 0

    businesses = None if args.all else (args.businesses or ["giftshop"])
    if not args.all and args.businesses is None:
        print("no --business given; extracting giftshop (see --all, --list)", file=sys.stderr)

    help_pages, structure_info = [], None
    if structure_path and os.path.exists(structure_path):
        try:
            help_pages, structure_info = wiki_data.load_help_structure(structure_path)
        except wiki_data.SourceError as exc:
            # The table of contents is a bonus: the locale alone carries every
            # fact. A file that is there and unreadable is still reported, in
            # the output and not only on the terminal.
            structure_info = {"used": False, "error": str(exc)}
            print(f"warning: {exc}; continuing without the help structure", file=sys.stderr)
    elif structure_path:
        structure_info = {"used": False, "error": f"{structure_path} is not there"}

    source_files = {
        name: wiki_data.file_meta(path)
        for name, path in (
            ("locale/en.json", locale_path),
            ("helpstructure.json", structure_path if help_pages else None),
        )
        if path
    }

    try:
        catalogue = wiki_data.build_catalogue(
            locale,
            businesses=businesses,
            help_pages=help_pages,
            source_files=source_files,
            build_metadata=build_metadata(args, paths["data_dir"]),
            with_raw=not args.no_raw,
        )
    except wiki_data.SourceError as exc:
        return fail(exc)
    if structure_info:
        catalogue["helpStructure"] = {**catalogue["helpStructure"], **structure_info}
        catalogue["helpStructure"]["used"] = bool(help_pages)

    out = args.out or os.path.join(RESEARCH_DIR, "wiki-%s.json" % ("-all" if args.all else "-".join(sorted(businesses))))
    # Read the previous snapshot before writing: --compare may equal --out.
    if args.compare:
        comparison_code = compare(args.compare, catalogue)
        if comparison_code:
            return comparison_code
    try:
        text = wiki_data.write_catalogue(out, catalogue)
    except wiki_data.SourceError as exc:
        # Nothing was written: the previous catalogue, if any, still stands.
        return fail(exc)

    counts = catalogue["counts"]
    print(
        "wrote %s (%d KB): %s"
        % (
            out,
            len(text) // 1024,
            ", ".join(f"{count} {name}" for name, count in counts.items() if name != "records"),
        )
    )
    print(
        "sources: %s"
        % "; ".join(
            "%s %s" % (name, meta["sha256"][:12]) for name, meta in source_files.items()
        )
    )
    if catalogue["unparsed"]:
        print(
            "%d item(s) in the help were not parsed into a field; see 'unparsed'"
            % len(catalogue["unparsed"]),
            file=sys.stderr,
        )
    return 0


def compare(previous_path: str, catalogue: dict) -> int:
    """Report what moved since the last extraction, as record-level facts."""
    try:
        previous = wiki_data.load_catalogue(previous_path)
        diff = wiki_data.diff_records(previous.get("records", []), catalogue["records"])
    except (wiki_data.SourceError, ValueError) as exc:
        return fail(exc)
    print(
        "compared with %s: %d added, %d removed, %d changed"
        % (previous_path, len(diff["added"]), len(diff["removed"]), len(diff["changed"]))
    )
    for record_id in diff["added"]:
        print("  + %s" % record_id)
    for record_id in diff["removed"]:
        print("  - %s" % record_id)
    for change in diff["changed"]:
        print("  ~ %s: %s" % (change["id"], ", ".join(change["fields"])))
    return 0


def fail(exc: Exception) -> int:
    print("error: %s" % exc, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
