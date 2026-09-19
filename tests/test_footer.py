"""The footer is built once and placed twice, and the two homes differ.

The split that matters is the legal one. The Impressum and the privacy notice
are files under web/, so they are only beside the page on the site. The CLI
writes dashboard.html next to the player's saves and the watch server answers a
fixed allowlist, so a link to either from those would 404 -- and a board on
someone's own disk publishes nothing and owes no notice anyway.
"""
import re
import unittest

from ba_dashboard import VERIFIED_BUILD, footer_html, render


class Footer(unittest.TestCase):
    def test_only_the_site_carries_the_legal_links(self):
        site = footer_html(site=True)
        self.assertIn('href="impressum.html"', site)
        self.assertIn('href="privacy.html"', site)
        # The hrefs, not the words: both footers carry a comment that mentions
        # the privacy notice, and matching prose would pass for the wrong reason.
        for name, markup in (("board", footer_html()), ("landing", footer_html(landing=True))):
            with self.subTest(name):
                self.assertNotIn('href="impressum.html"', markup)
                self.assertNotIn('href="privacy.html"', markup)
                self.assertNotIn("bigcopilot.com/impressum", markup)

    def test_a_cli_page_names_neither_legal_page(self):
        # render() without site= is what main() writes and what --watch serves.
        page = render(None)
        self.assertNotIn("impressum.html", page)
        self.assertNotIn("privacy.html", page)

    def test_the_two_homes_do_not_share_an_id(self):
        # Both footers are in the site's page until the board replaces the
        # landing, so anything they both carry has to be a class or a data
        # attribute. The board fills #footFile and #footBuild, and the landing
        # has neither; the landing owns #helpLink.
        landing = set(re.findall(r'id="([^"]+)"', footer_html(landing=True, site=True)))
        board = set(re.findall(r'id="([^"]+)"', footer_html(site=True)))
        self.assertEqual(landing & board, set())
        self.assertIn("helpLink", landing)
        self.assertLessEqual({"footFile", "footBuild"}, board)

    def test_the_vote_card_ships_hidden(self):
        # community.js reveals it; nothing else may, or the CLI's dashboard.html
        # would offer a vote it cannot cast.
        for name, markup in (("board", footer_html()), ("landing", footer_html(landing=True))):
            with self.subTest(name):
                card = re.search(r'<div class="sf-card" data-vote-card([^>]*)>', markup)
                self.assertIsNotNone(card)
                self.assertIn("hidden", card.group(1))

    def test_the_landing_states_the_build_it_was_checked_on(self):
        # It has no save yet, so it cannot be told one the way the board is.
        self.assertIn(f"Game build {VERIFIED_BUILD}", footer_html(landing=True, site=True))


if __name__ == "__main__":
    unittest.main()
