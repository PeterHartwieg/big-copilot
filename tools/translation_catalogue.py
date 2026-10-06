"""Public translation catalogues compiled from authored call sites, never saves.

The same compiled placeholder contract is used by submissions and the hosted loader.
Run ``python tools/translation_catalogue.py --help`` for selected overlay import/export.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from tools import i18n

MAX_LENGTH = 2000
FORMATS = ('', ',', '$', '$c', 'day', *(f'{comma}.{n}f' for comma in ('', ',') for n in range(10)))
AREA_NAMES = {'nav': 'Navigation and preferences', 'land': 'Welcome page', 'app': 'Save selection',
              'foot': 'Footer and language picker', 'today': 'Today', 'f': 'Findings', 'co': 'Company',
              'sp': 'Business details', 'sb': 'Supply', 'gr': 'Expansion', 'map': 'Map and location finder',
              'wiki': 'Wiki', 'comm': 'Community', 'upd': 'Updates', 'br': 'Bug reports', 'day': 'Weekdays'}


def digest(value):
    return hashlib.sha256(i18n._dump(value).encode('utf-8')).hexdigest()


def validation(key, english, lang, params):
    """Compile fits() into exact tokens and required alternative groups.

    A plural form may use any placeholder of its family, but it must keep only
    those of its own English (the form of its category, else `other`): "{n}
    {kind}" beside "{n} {kinds}" cannot need both a kind and a kinds token."""
    _, tokens = i18n._english_for(key, english)
    own = i18n.fields(i18n._english_text(key, english))
    base = i18n._base_key(key)
    plural = base != key and base not in english
    category = key[len(base) + 1:] if plural else None
    given = params.get(base if plural else key)
    if given is None:
        required = [[t] for t in sorted(own)] if not plural or category == 'other' else []
        return {'allowed': sorted(tokens), 'required': required, 'maxLength': MAX_LENGTH}
    specs = {}
    for token in tokens:
        name, spec = token.split(':', 1)
        specs.setdefault(name, set()).add(spec)
    allowed = sorted(f'{name}:{spec}' for name in given for spec in specs.get(name, FORMATS))
    required = []
    for name in sorted({token.split(':', 1)[0] for token in own}):
        if name == 'n' and category in ('one', 'zero'):
            continue
        alternatives = [token for token in allowed if token.split(':', 1)[0] == name or
                        (token.split(':', 1)[0] not in specs and i18n._names_it(token.split(':', 1)[0], name))]
        required.append(alternatives)
    return {'allowed': allowed, 'required': required, 'maxLength': MAX_LENGTH}


def valid_text(text, rule):
    if not isinstance(text, str) or not text.strip() or len(text) > rule['maxLength']:
        return False
    # Keep one plain-text representation, identical to the API validator.
    if re.search(r'[<>\x00-\x08\x0b-\x1f\x7f-\x9f]', text) or re.search(
            r'&(?:#(?:x[\da-f]+|\d+);?|[a-z][a-z\d]+;)', text, re.I):
        return False
    if re.search(r'[{}]', i18n.FIELD.sub('', text)):
        return False
    return keeps_placeholders(text, rule)


def keeps_placeholders(text, rule):
    """The placeholder half of valid_text(): only allowed tokens, one of each required group."""
    tokens = i18n.fields(text)
    return tokens <= set(rule['allowed']) and all(tokens.intersection(group) for group in rule['required'])


def check_contracts(data):
    """Refuse a catalogue whose contract its own English or bundled text breaks.

    Such a contract makes the natural wording impossible: the API answers
    invalid_translation for it, and the overlay drops a selected text that
    breaks it. Only the placeholder rule is checked, not the plain-text one:
    English and bundled wording may carry markup the community API refuses."""
    dead = [entry['key'] for entry in data['entries']
            if not keeps_placeholders(entry['en'], entry['validation'])
            or (entry['text'] is not None and not keeps_placeholders(entry['text'], entry['validation']))]
    if dead:
        raise i18n.CatalogueError(f'{data["lang"]}: {len(dead)} translation contracts reject their own English '
                                  f'or bundled text: {", ".join(dead[:10])}')


def catalogue(lang, found=None, root=ROOT):
    if lang not in i18n.PLURALS or lang == 'en':
        raise i18n.CatalogueError(f'unsupported translation language: {lang}')
    found = i18n.calls() if found is None else found
    english, locations, params = i18n.catalogue(found), i18n.catalogue(found, where=True), i18n.passed(found)
    bundled = i18n.shipped(lang, english, str(root), params)
    marks = i18n.drafted(lang, str(root))
    keys = set()
    for key in english:
        base = i18n._base_key(key)
        if base != key and base not in english:
            keys.update(f'{base}_{cat}' for cat in i18n.PLURALS[lang])
        else:
            keys.add(key)
    entries = []
    for key in sorted(keys):
        base = i18n._base_key(key)
        en = i18n._english_text(key, english)
        rule = validation(key, english, lang, params)
        family = {k: english[k] for k in (f'{base}_{cat}' for cat in i18n.PLURAL_CATEGORIES) if k in english}
        source_version = digest({'key': key, 'english': family or en, 'validation': rule})
        area = key.split('.')[0]
        where = locations.get(key, locations.get(f'{base}_other', {})).get('where', [])
        entries.append({'key': key, 'en': en, 'text': bundled.get(key), 'drafted': key in marks and key in bundled,
                        'area': area, 'context': AREA_NAMES.get(area, area), 'where': where,
                        'sourceVersion': source_version, 'validation': rule})
    data = {'schemaVersion': 1, 'lang': lang, 'entries': entries}
    check_contracts(data)
    # Line numbers are navigation hints, not source or content revisions.
    data['revision'] = digest({**data, 'entries': [{k:v for k,v in e.items() if k != 'where'} for e in entries]})
    return data


def ship(check=False, root=ROOT):
    root = Path(root)
    found = i18n.calls()
    expected = {}
    for lang in i18n.languages():
        data = catalogue(lang, found)
        expected[f'{lang}.json'] = data
        expected[f'{lang}.manifest.json'] = {'schemaVersion': 1, 'lang': lang, 'revision': data['revision'],
            'entries': {e['key']: {'sourceVersion': e['sourceVersion'], 'validation': e['validation']} for e in data['entries']}}
    folder = root / 'web' / 'translations'
    stale = []
    for name, data in expected.items():
        path = folder / name
        text = i18n._dump(data)
        if path.exists() and path.read_text(encoding='utf-8') == text:
            continue
        if check:
            stale.append(f'web/translations/{name}')
        else:
            folder.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding='utf-8')
    for path in folder.glob('*.json'):
        if path.name not in expected:
            if check:
                stale.append(f'web/translations/{path.name}')
            else:
                path.unlink()
    return stale


def selected_overlay(lang, overlay, data=None):
    """Reduce a public overlay to current, valid text; never preserve identities/votes."""
    data = catalogue(lang) if data is None else data
    if not isinstance(overlay, dict) or not isinstance(overlay.get('translations'), dict):
        raise i18n.CatalogueError('overlay must contain a translations object')
    if overlay.get('schemaVersion') != 1 or overlay.get('lang') != lang:
        raise i18n.CatalogueError('overlay schema or language does not match')
    entries = {e['key']: e for e in data['entries']}
    translations = {}
    for key, row in overlay.get('translations', {}).items():
        entry = entries.get(key)
        if not entry or not isinstance(row, dict) or row.get('sourceVersion') != entry['sourceVersion']:
            raise i18n.CatalogueError(f'{key}: stale or unknown translation')
        if not valid_text(row.get('text'), entry['validation']):
            raise i18n.CatalogueError(f'{key}: unsafe text or invalid placeholders')
        translations[key] = {'text': row['text'], 'sourceVersion': row['sourceVersion']}
    return {'schemaVersion': 1, 'lang': lang, 'revision': data['revision'], 'translations': translations}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('export', 'import'))
    parser.add_argument('lang')
    parser.add_argument('file', help='downloaded public overlay JSON')
    parser.add_argument('--out', help='sanitized JSON output (export only; stdout by default)')
    args = parser.parse_args()
    try:
        data = catalogue(args.lang)
        overlay = selected_overlay(args.lang, json.loads(Path(args.file).read_text(encoding='utf-8')), data)
        if args.command == 'export':
            text = json.dumps(overlay, ensure_ascii=False, indent=2) + '\n'
            if args.out:
                Path(args.out).write_text(text, encoding='utf-8')
            else:
                print(text, end='')
        else:
            table, base = i18n.load(args.lang)
            marks = i18n.drafted(args.lang)
            entries = {e['key']: e for e in data['entries']}
            for key, row in overlay['translations'].items():
                table[key], base[key] = row['text'], entries[key]['en']
                marks.pop(key, None)
            i18n._write(f'{args.lang}.json', table)
            i18n._write(f'{args.lang}.base.json', base)
            i18n._write(f'{args.lang}.ai.json', marks)
            print(f'Imported {len(overlay["translations"])} community translations for {args.lang}.')
    except (i18n.CatalogueError, ValueError, OSError) as exc:
        parser.exit(1, f'{exc}\n')


if __name__ == '__main__':
    main()
