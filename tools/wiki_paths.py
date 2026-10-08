"""Locate the installed game sources used by the wiki build."""
from __future__ import annotations

import os

try:
    from . import wiki_data
except ImportError:  # direct tools script
    import wiki_data


def game_layout(locale_path: str) -> tuple[str, str] | None:
    """(data_dir, StreamingAssets) for an en.json inside an install, else None.

    Only the game's own layout, <game>/.../StreamingAssets/locale/en.json, puts
    helpstructure.json and the Steam manifest where this module looks for them,
    and BA_LOCALE can name an en.json anywhere -- so callers ask here instead of
    deriving a directory from whatever parent the path happens to have.

    Both spellings count, resolved first. Resolved catches a path reaching a
    real install through "..", a link, or an 8.3 name like STREAMI~1, and it is
    asked first because it names the install the file actually comes from: when
    one install's en.json links into another's, taking the literal spelling
    would file the second install's text under the first one's help pages and
    build id, which is a lie told by the one module whose job is provenance.
    As written is the fallback, for the cases where nothing is at the other end
    of the link to recognise -- a modded en.json linked out of an install, or a
    StreamingAssets junction whose target is named something else.

    Whichever fits decides both directories together: deriving one from the
    resolved path and the other from the literal one is how helpstructure.json
    ends up looked for somewhere the locale never was, and that surfaces much
    later as a missing file rather than here as a refusal.
    """
    for candidate in (os.path.realpath(locale_path), os.path.abspath(locale_path)):
        streaming_dir, locale_name = os.path.split(os.path.dirname(candidate))
        if (locale_name.lower() == "locale"
                and os.path.basename(streaming_dir).lower() == "streamingassets"):
            return os.path.dirname(streaming_dir), streaming_dir
    return None


def game_data_dir(locale_path: str) -> str | None:
    """The game data directory an en.json belongs to, or None if it is loose."""
    layout = game_layout(locale_path)
    return layout[0] if layout else None


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
        # .../StreamingAssets/locale/en.json -> .../Big Ambitions_Data, and the
        # StreamingAssets beside it, from the one spelling that fit.
        layout = game_layout(default_locale)
        if layout is None:
            raise wiki_data.SourceError(
                f"{default_locale} is not inside a game install: the wiki reads "
                "helpstructure.json beside the locale folder, so the path has to be "
                "<game>/.../StreamingAssets/locale/en.json. Point BA_LOCALE at the "
                "game's own en.json, or pass --data-dir"
            )
        data_dir, streaming_dir = layout
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
        # The folder the locale really sits in, so callers do not rebuild it
        # from data_dir and lose whatever spelling or link got them here.
        "streaming_dir": streaming_dir,
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


