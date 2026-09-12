"""Export browser hit geometry from an approved world snapshot and its SVG.

python export_map.py --geometry PATH --recipe PATH

No installed game is needed. The SVG's actual axes clip rectangles determine the
screen projection, including equal aspect and the extra space for the legend.
The source snapshot stays private; only compact address geometry is published.
"""
import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

from ba_save import Names

ROOT = Path(__file__).resolve().parent
NS = {'s': 'http://www.w3.org/2000/svg'}


def export(geometry_path, recipe_path, svg_path):
    geometry = json.loads(geometry_path.read_text(encoding='utf-8'))
    recipe = json.loads(recipe_path.read_text(encoding='utf-8'))
    svg = ET.fromstring(svg_path.read_bytes())
    names = Names(json.loads((ROOT / 'web/py/gametext.json').read_text(encoding='utf-8')))
    clips = {c.attrib['id']: c.find('s:rect', NS) for c in svg.findall('.//s:clipPath', NS)}
    regions, projectors = [], {}
    for i, panel in enumerate(recipe['panels'], 1):
        axes = svg.find(f".//s:g[@id='axes_{i}']", NS)
        clip_ids = {e.attrib['clip-path'][5:-1] for e in axes.iter() if 'clip-path' in e.attrib}
        if len(clip_ids) != 1:
            raise ValueError(f"Ambiguous axes projection: {panel['id']}")
        rect = clips[clip_ids.pop()]
        frame = [float(rect.attrib[k]) for k in ('x', 'y', 'width', 'height')]
        x0, z0, x1, z1 = panel['bounds']
        sx, sz = frame[2] / (x1-x0), frame[3] / (z1-z0)
        if abs(sx-sz) > .00001:
            raise ValueError('SVG and recipe do not have matching aspect ratios')
        def project(point, x0=x0, z1=z1, frame=frame, sx=sx, sz=sz):
            return [round(frame[0] + (point[0]-x0)*sx, 3), round(frame[1] + (z1-point[1])*sz, 3)]
        regions.append({'id': panel['id'], 'label': panel['title'], 'bounds': frame})
        for slug in panel['districts']:
            projectors[recipe['districts'][slug]['neighbourhood']] = (panel['id'], project)

    buildings = []
    for f in geometry['features']:
        if f['kind'] not in ('building', 'building_anchor'):
            continue
        region, project = projectors[f['neighbourhood']]
        geo = f['geometry']
        polys = geo['coordinates'] if geo['type'] == 'MultiPolygon' else [geo['coordinates']]
        # The casino has a point surrogate, not a footprint.
        rings = [list(map(project, ring)) for poly in polys for ring in poly] if f['kind'] == 'building' else []
        points = [p for ring in rings for p in ring]
        entrance = project([f['entrances'][0][0], f['entrances'][0][2]])
        if not points:
            points = [entrance]
        xs, ys = zip(*points)
        bounds = [min(xs), min(ys), max(xs)-min(xs), max(ys)-min(ys)]
        path = ' '.join('M'+' L'.join(f'{x},{y}' for x,y in ring)+' Z' for ring in rings)
        buildings.append({'key': f"{f['street']}#{f['number']}",
                          'address': names.addr((f['street'], f['number'])),
                          'hood': names.label(f['neighbourhood']), 'region': region,
                          'path': path, 'bounds': bounds, 'anchor': entrance})
    keys = [b['key'] for b in buildings]
    if len(keys) != len(set(keys)) or len(keys) != len(recipe['expected_addresses']):
        raise ValueError('Address coverage mismatch')
    # Poster district titles would cover whole streets when zoomed in. Keep
    # their exact anchors, but let the viewer render them at screen text size.
    district_names = {d['title'].upper() for d in recipe['districts'].values()}
    labels = []
    for parent in list(svg.iter()):
        for child in list(parent):
            if not child.attrib.get('id', '').startswith('text_'):
                continue
            texts = child.findall('s:text', NS)
            if len(texts) == 1 and texts[0].text in district_names:
                t = texts[0]
                labels.append({'label': t.text, 'anchor': [float(t.attrib['x']), float(t.attrib['y'])]})
                parent.remove(child)
    # The interactive viewer does not need the poster's footer or landmark
    # legend. Crop below the region panels without moving any map coordinates.
    bottom = max(r['bounds'][1] + r['bounds'][3] for r in regions) + 16
    figure = svg.find(".//s:g[@id='figure_1']", NS)
    for child in list(figure):
        ident = child.attrib.get('id', '')
        texts = child.findall('s:text', NS)
        if (ident.startswith('patch_') and ident != 'patch_1') or (
                texts and all(float(t.attrib['y']) > bottom for t in texts)):
            figure.remove(child)
    view_box = list(map(float, svg.attrib['viewBox'].split()))
    view_box[3] = bottom - view_box[1]
    svg.set('viewBox', ' '.join(map(str, view_box)))
    svg.set('height', f'{view_box[3]}pt')
    ET.register_namespace('', NS['s'])
    ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
    background = svg_path.with_name('map-background.svg')
    background.write_bytes(ET.tostring(svg, encoding='utf-8', xml_declaration=True))
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    return {'schema': 1, 'image': background.name, 'imageHash': digest(background),
            'viewBox': list(map(float, svg.attrib['viewBox'].split())),
            'source': {'geometryHash': digest(geometry_path), 'recipeHash': digest(recipe_path), 'svgHash': digest(svg_path)},
            'regions': regions, 'districtLabels': labels, 'buildings': buildings}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--geometry', type=Path, required=True)
    p.add_argument('--recipe', type=Path, required=True)
    p.add_argument('--svg', type=Path, default=ROOT / 'web/maps/full-map.svg')
    p.add_argument('--output', type=Path, default=ROOT / 'web/maps/locations.json')
    args = p.parse_args()
    result = export(args.geometry, args.recipe, args.svg)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"Exported {len(result['buildings'])} addresses to {args.output}")
