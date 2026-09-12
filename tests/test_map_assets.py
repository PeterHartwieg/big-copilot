"""Portable contracts for the published geometry and local map delivery."""
import hashlib
import json
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from types import SimpleNamespace

from ba_dashboard import BoardHandler

ROOT = Path(__file__).resolve().parents[1]


class MapAssets(unittest.TestCase):
    def test_coverage_provenance_and_region_coordinates(self):
        data = json.loads((ROOT / 'web/maps/locations.json').read_text(encoding='utf-8'))
        self.assertEqual(data['schema'], 1)
        self.assertEqual(len(data['buildings']), 883)
        self.assertEqual(len({b['key'] for b in data['buildings']}), 883)
        self.assertEqual(sum(not b['path'] for b in data['buildings']), 1)
        self.assertEqual(hashlib.sha256((ROOT / 'web/maps' / data['image']).read_bytes()).hexdigest(), data['imageHash'])
        self.assertEqual(hashlib.sha256((ROOT / 'web/maps/full-map.svg').read_bytes()).hexdigest(), data['source']['svgHash'])
        regions = {r['id']: r['bounds'] for r in data['regions']}
        for b in data['buildings']:
            x, y, w, h = regions[b['region']]
            ax, ay = b['anchor']
            with self.subTest(address=b['address']):
                self.assertTrue(x <= ax <= x+w and y <= ay <= y+h)
                self.assertTrue(b['key'].startswith('ba:street_'))

    def test_local_server_serves_only_the_two_runtime_map_assets(self):
        class Handler(BoardHandler):
            board = SimpleNamespace(lock=threading.Lock(), html=b'', data=b'', stamp=b'')
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f'http://127.0.0.1:{server.server_port}'
            for filename, content_type in [('locations.json', 'application/json'), ('map-background.svg', 'image/svg+xml')]:
                with urllib.request.urlopen(base + '/maps/' + filename + '?v=test') as response:
                    self.assertEqual(response.headers['Content-Type'], content_type)
                    self.assertEqual(response.read(), (ROOT / 'web/maps' / filename).read_bytes())
            for route in ['/maps/full-map.svg', '/maps/../ba_dashboard.py', '/maps/unrelated.json']:
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(base + route)
                self.assertEqual(error.exception.code, 404)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
