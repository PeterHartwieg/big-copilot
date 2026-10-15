"""The shared Wiki stays usable in local watch and exported dashboards."""
import json
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from types import SimpleNamespace

from ba_dashboard import BoardHandler, WIKI_SERVED, compact_wiki, render, script_json

ROOT = Path(__file__).resolve().parents[1]


class WikiAssets(unittest.TestCase):
    def test_local_server_serves_public_catalogue_only(self):
        class Handler(BoardHandler):
            board = SimpleNamespace(lock=threading.Lock(), html=b'', data=b'', stamp=b'')

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f'http://127.0.0.1:{server.server_port}'
            # the compact copy the page fetches, made from the committed catalogue
            with urllib.request.urlopen(base + '/' + WIKI_SERVED + '?v=test') as response:
                self.assertEqual(response.headers['Content-Type'], 'application/json')
                body = response.read().decode('utf-8')
            committed = (ROOT / 'web/wiki-data.json').read_text(encoding='utf-8')
            self.assertEqual(body, compact_wiki(committed))
            self.assertEqual(json.loads(body), json.loads(committed))
            self.assertNotIn('\n', body)
            for route in ['/tools/wiki_sample.json', '/research/wiki-data/catalogue.json', '/web/wiki-data.json',
                          '/wiki-data.json']:
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(base + route)
                self.assertEqual(error.exception.code, 404)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_export_embeds_reference_data_and_web_build_fetches_it(self):
        # A save is not necessary to inspect the embedded reference catalogue.
        exported = render(None, live=False)
        self.assertTrue('window.BIG_COPILOT_WIKI=' in exported, 'Export lacks embedded Wiki data')
        self.assertTrue('businesstypes-giftshop' in exported, 'Export lacks the Gift Shop page')
        # embedded without the committed file's indentation
        committed = (ROOT / 'web/wiki-data.json').read_text(encoding='utf-8')
        self.assertIn('window.BIG_COPILOT_WIKI=' + script_json(compact_wiki(committed)) + ';', exported)
        hosted = render(None, live=True)
        self.assertFalse('window.BIG_COPILOT_WIKI=' in hosted, 'Hosted page should fetch Wiki data')
