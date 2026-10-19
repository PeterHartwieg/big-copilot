"""Synthetic wholesale contract writes: live guards, quotes and undo."""
import copy
import os
import tempfile
import unittest

from tests.test_supply_facts import Stub
from tools.game_link_mock import Link, BadRequest

SHOP = {"street": "ba:street_secondavenue", "number": 10}
SUPPLIER = {"street": "ba:street_thirdavenue", "number": 4}
SODA = "ba:itemname_sodacan"
GIFT = "ba:itemname_cheapgift"
KEY = "ba:street_thirdavenue#4"


class WholesaleWrite(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        path = os.path.join(self.tmp.name, 'synthetic.hsg')
        with open(path, 'wb') as f:
            f.write(b'not a save')
        self.link = Link(path, character='abc', company='Shop Co', day=34, hour=14,
                         cash=100, build=3682, schema=3, throttle=False, refuse=None)
        self.shop = dict(StreetName=SHOP['street'], StreetNumber=SHOP['number'], RentedByPlayer=True,
                         businessTypeName='ba:businesstype_giftshop', cachedAvailableProducts=[SODA],
                         itemInstances=[{'itemName': 'ba:itemname_storageshelf'}])
        self.vendor = dict(StreetName=SUPPLIER['street'], StreetNumber=SUPPLIER['number'], BusinessName='Wholesaler',
                           businessTypeName='ba:businesstype_wholesalestore', cachedAvailableProducts=[SODA, GIFT],
                           scheduleDays=[{'day': d, 'isOpen': True, 'openingHourSlots': [{'startingHour': 8, 'endingHour': 18}]} for d in range(1, 8)])
        self.save = Stub({'BuildingRegistrations': [self.shop, self.vendor], 'DeliveryContracts': [],
                          'Contacts': [{'streetName': SUPPLIER['street'], 'streetNumber': SUPPLIER['number']}]})
        self.link._save = lambda: self.save
        self.link.wholesale_terms = {KEY: {'fee': 100, 'products': {SODA: {'price': 2, 'cap': 1000}}}}

    def body(self, mode='weekly', **extra):
        return {'address': SHOP, 'supplier': SUPPLIER, 'mode': mode, 'snapshot': self.link.stamp,
                'expect': {'character': 'abc', 'company': 'Shop Co'}, 'items': [{'item': SODA, 'amount': 810}], **extra}

    def quote(self, body=None):
        body = body or self.body()
        status, answer = self.link.write('wholesale', dict(body, dryRun=True))
        self.assertEqual(status, 200)
        return answer

    def apply(self, mode='weekly'):
        body = self.body(mode)
        quote = self.quote(body)
        self.assertTrue(quote['ok'], quote)
        status, result = self.link.write('wholesale', dict(body, quote=quote['quote']))
        self.assertEqual(status, 200, result)
        return result

    def refuse(self, expected, body=None):
        answer = self.quote(body)
        self.assertFalse(answer['ok'])
        self.assertEqual(answer['rows'][0]['error'], expected)

    def test_weekly_and_once_quote_apply_and_undo(self):
        for mode in ('weekly', 'once'):
            with self.subTest(mode=mode):
                q = self.quote(self.body(mode))
                self.assertEqual(self.link.wholesale_contracts, [])
                self.assertEqual((q['rows'][0]['cost'], q['rows'][0]['nextDeliveryDay']), (1720, 36))
                result = self.apply(mode)
                self.assertEqual(result['rows'][0]['repeating'], mode == 'weekly')
                [c] = self.link.wholesale_contracts
                self.assertEqual((c['enabled'], c['urgent'], c['items'][0]['amount']), (True, False, 810))
                self.assertEqual(self.link.cash, 100, 'creating a contract charges nothing now')
                status, undone = self.link.write('undo', {'kind': 'wholesale'})
                self.assertEqual((status, undone['undo'], self.link.wholesale_contracts), (200, True, []))

    def test_weekly_update_restores_counters_and_original_date(self):
        self.apply()
        before = self.link.wholesale_contracts[0]
        before['items'][0].update(amount=500, ordered=100, last=400)
        before['day'] = 43
        before = copy.deepcopy(before)
        self.apply()
        self.assertEqual(self.link.wholesale_contracts[0]['items'][0]['ordered'], 100)
        self.link.write('undo', {'kind': 'wholesale'})
        self.assertEqual(self.link.wholesale_contracts[0], before)
        q = self.quote(self.body(items=[{'item': SODA, 'amount': 500}]))
        self.assertFalse(q['rows'][0]['set'])
        self.assertEqual(q['rows'][0]['nextDeliveryDay'], 43)

    def test_unchanged_weekly_order_is_not_a_new_purchase_against_this_weeks_cap(self):
        self.apply()
        self.link.wholesale_contracts[0]["items"][0]["ordered"] = 810
        q = self.quote()
        self.assertTrue(q["ok"])
        self.assertFalse(q["rows"][0]["set"])

    def test_one_off_never_replaces_an_active_contract(self):
        self.apply()
        before = copy.deepcopy(self.link.wholesale_contracts)
        self.refuse('active_order', self.body('once'))
        self.assertEqual(self.link.wholesale_contracts, before)
        self.link.wholesale_contracts[0]['enabled'] = False
        self.apply('once')
        self.assertFalse(self.link.wholesale_contracts[0]['repeating'])

    def test_weekly_does_not_duplicate_or_silently_restart_other_products(self):
        self.apply()
        c = self.link.wholesale_contracts[0]
        c['items'].append({'item': GIFT, 'amount': 30, 'ordered': 0, 'last': 0})
        self.refuse('other_products')
        c['items'].pop()
        c['supplier'] = {'street': 'other', 'number': 2}
        self.refuse('other_contract')

    def test_closing_after_quote_and_caps_are_rechecked_atomically(self):
        body = self.body()
        q = self.quote(body)
        self.link.hour = 18
        status, answer = self.link.write('wholesale', dict(body, quote=q['quote']))
        self.assertEqual((status, answer['rows'][0]['error'], self.link.wholesale_contracts), (409, 'supplier_closed', []))
        self.link.hour = 14
        p = self.link.wholesale_terms[KEY]['products'][SODA]
        for term, value, refusal in [('cap', 800, 'over_cap'), ('backorder', True, 'backorder'), ('shortage', 800, 'shortage')]:
            old = dict(p)
            p[term] = value
            self.refuse(refusal)
            p.clear(); p.update(old)

    def test_snapshot_quote_and_replayed_apply_cannot_place_twice(self):
        body = self.body('once')
        q = self.quote(body)
        self.link.wholesale_terms[KEY]['fee'] = 200
        status, answer = self.link.write('wholesale', dict(body, quote=q['quote']))
        self.assertEqual((status, answer['error']), (409, 'changed'))
        self.assertEqual(self.link.wholesale_contracts, [])
        q = self.quote(body)
        sent = dict(body, quote=q['quote'])
        self.assertEqual(self.link.write('wholesale', sent)[0], 200)
        self.assertEqual(self.link.write('wholesale', sent)[0], 409)
        self.assertEqual(len(self.link.wholesale_contracts), 1)
        self.refuse('changed', self.body(expect={'character': 'other', 'company': 'Shop Co'}))

    def test_contact_storage_product_screen_and_lock_guards(self):
        self.save.root['Contacts'] = []
        self.refuse('no_contact')
        self.save.root['Contacts'] = [{'streetName': SUPPLIER['street'], 'streetNumber': SUPPLIER['number']}]
        self.shop['itemInstances'] = []
        self.refuse('no_storage')
        self.shop['itemInstances'] = [{'itemName': 'ba:itemname_palletshelf'}]  # a shelf, not business storage
        self.refuse('no_storage')
        self.shop['itemInstances'] = [{'itemName': 'ba:itemname_storageshelf'}]
        self.refuse('product_unavailable', self.body(items=[{'item': 'unknown', 'amount': 1}]))
        self.link.screen_open.add(('any', 1))
        self.refuse('screen_open')
        self.link.screen_open.clear()
        self.apply()
        self.link.day, self.link.hour = 35, 21
        self.vendor['scheduleDays'][6]['openingHourSlots'][0]['endingHour'] = 24
        self.refuse('locked')
        self.link.wholesale_contracts[0]['day'] = 43
        self.assertTrue(self.quote()['ok'], 'later deliveries remain editable during the lock')

    def test_undo_refuses_a_delivered_edited_or_next_day_contract(self):
        self.apply()
        c = self.link.wholesale_contracts[0]
        c['items'][0]['ordered'] = 100
        self.assertEqual(self.link.write('undo', {'kind': 'wholesale'})[0], 409)
        c['items'][0]['ordered'] = 0
        self.link.day += 1
        self.assertEqual(self.link.write('undo', {'kind': 'wholesale'})[0], 409)
        self.link.day -= 1
        self.link.hour = 23  # undo may cancel an untouched order after the supplier closes
        self.assertEqual(self.link.write('undo', {'kind': 'wholesale'})[0], 200)

    def test_parser_rejects_bad_or_empty_quantities_and_missing_identity(self):
        for changes in ({'items': []}, {'items': [{'item': SODA, 'amount': True}]},
                        {'items': [{'item': SODA, 'amount': 1.5}]}, {'mode': 'rush'}, {'expect': {}},
                        {'snapshot': ''}, {'items': [{'item': SODA, 'amount': 1}] * 2}):
            with self.subTest(changes=changes), self.assertRaises(BadRequest):
                self.quote(self.body(**changes))
