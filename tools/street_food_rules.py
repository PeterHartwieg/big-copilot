"""Export public planning facts from the Street Food source checkout.

python tools/street_food_rules.py PATH_TO_STREET_FOOD
No sales weights, forecasts, event probabilities, or regulars are exported.
"""
import argparse
import hashlib
import json
from pathlib import Path


def export(root):
    def read(name):
        return json.loads((root / 'data' / (name + '.json')).read_text())
    demand, pitches, rules, commissaries = [read(n) for n in ('demand', 'pitches', 'rules', 'commissaries')]
    labels = json.loads((root / 'unity/FoodTrucks/Locales/en.json').read_text())
    def place(row):
        return {'id': row['id'], 'name': labels.get(row['name'], row['id']), 'address': row['address'],
                'categories': [k for k in row.get('areas', {}) if k != 'transit'],
                **({'bay': row['bay']} if 'bay' in row else {})}
    classifier = demand['classifier']
    return {'schema': 1, 'source': {n: hashlib.sha256((root / 'data' / (n + '.json')).read_bytes()).hexdigest()
                                  for n in ('demand', 'pitches', 'rules', 'commissaries')},
            'rules': {'radiusMetres': classifier['radiusMetres'], 'travel': rules['fleet']['travel'],
                      'schedules': rules['fleet']['schedules']},
            'classifier': {kind: {k: list(v) for k, v in classifier[kind].items()}
                           for kind in ('buildingTypes', 'businessTypes')},
            'pitches': [place(r) for r in pitches['premium']['spots']],
            'eventPlaces': [place(r) for r in pitches['events']['places']],
            'eventKinds': {r['id']: {'name': labels.get(r['name'], r['id']), 'categories': list(r['areas'])}
                           for r in pitches['events']['kinds']},
            'commissaries': [place(r) for r in commissaries['commissaries']]}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path)
    args = p.parse_args()
    target = Path(__file__).resolve().parents[1] / 'ba_street_food_rules.json'
    target.write_text(json.dumps(export(args.source), indent=2, ensure_ascii=False) + '\n')
