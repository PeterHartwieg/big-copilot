"""Extract a wiki catalogue from the game's own help text.

    python tools/extract_wiki.py --business giftshop --out research/wiki-data/gift-shop.json

Reads the locale file the game ships (default: the Steam install
`ba_save.DEFAULT_LOCALE` points at) and, when present, the help menu's own
table of contents beside it, and writes the facts they state as a catalogue of
records: business types with their ranges, items, recipes and workstations.
Every record carries the locale keys it was read from; the catalogue carries
the SHA256 of each source file. The raw help text is written out beside the
parsed facts, so a page the parser half understood is still there to read.

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

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import wiki_data  # noqa: E402  (tools/ is the package, the repo root is the import root)


RESEARCH_DIR = os.path.join("research", "wiki-data")


def default_paths(data_dir: str | None) -> dict:
    """Where the sources live: the game install the dashboard already knows."""
    if data_dir is None:
        from ba_save import DEFAULT_LOCALE, find_game_locale

        # The detected install when there is one, so the wiki builds on every
        # platform; the old Windows constant is only a last resort.
        default_locale = find_game_locale() or DEFAULT_LOCALE
        # .../StreamingAssets/locale/en.json -> .../StreamingAssets
        streaming_dir = os.path.dirname(os.path.dirname(default_locale))
        data_dir = os.path.dirname(streaming_dir)
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

    The id lives two levels above the game root, in steamapps; when that is
    not readable the extraction goes on without it and says so, which is why
    this returns a path and not a build id.
    """
    if not data_dir:
        return None
    game_root = os.path.dirname(data_dir)  # .../common/Big Ambitions
    candidate = os.path.abspath(os.path.join(game_root, os.pardir, os.pardir, "appmanifest_1331550.acf"))
    return candidate if os.path.isfile(candidate) else None


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

    paths = default_paths(args.data_dir)
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
