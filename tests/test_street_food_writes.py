"""Reviewed route writes using synthetic ES3 snapshots, never a player save."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
import ba_street_food as sf
from tools.game_link_mock import Link
from tests.es3_fixture import encode
from tests.test_street_food import company, state


class StreetFoodWrites(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name, 'test.hsg')
        block = state(); block['schemaVersion'] = 2
        block['vehicles'][0]['vehicleType'] = 'cart'
        block['vehicles'][0]['schedule'] = {'stops':[{'day':2,'spotKey':'keep','x':1,'z':2,'openAt':600,'closeAt':800}],
            'closed':[], 'crewShifts':[{'employeeId':'crew','day':1,'start':9,'end':16}]}
        root = company(block, {'status':'fresh'})
        root['modData'] = [{'$k': k, '$v': v} for k,v in root['modData'].items()]
        self.path.write_bytes(encode(root))
        self.original = self.path.read_bytes()
        self.link = Link(str(self.path), character='person', company='test', day=5, hour=10, cash=1000, build=3682,
                         schema=4, throttle=False, refuse=None)
        self.body = {'expect':{'character':'person','company':'test'},'vehicleId':'cart','weekday':0,
            'revision':sf.read(self.link._save())['snapshot']['routeRevisions']['cart'],
            'stops':[{'x':1,'z':2,'open':600,'close':800}]}

    def tearDown(self):
        self.tmp.cleanup()

    def test_review_then_apply_and_refresh_preserve_other_days_and_disk(self):
        initial = self.link.data
        status, review = self.link.write('streetFoodRoute',{**self.body,'dryRun':True})
        self.assertEqual(status,200)
        self.assertEqual(self.link.data,initial)
        status, result = self.link.write('streetFoodRoute',{**self.body,'quote':review['quote']})
        self.assertEqual(status,200)
        self.assertTrue(result['stamp'])
        block=sf.read(self.link._save())['state']; route=block['vehicles'][0]['schedule']
        self.assertEqual([s['day'] for s in route['stops']],[1,2])
        self.assertEqual(len(route['crewShifts']),1)
        self.assertEqual(self.path.read_bytes(),self.original)
        self.assertNotEqual(sf.read(self.link._save())['snapshot']['routeRevisions']['cart'],self.body['revision'])

    def test_apply_requires_same_quote_and_same_company_and_revision(self):
        for body in [self.body, {**self.body,'expect':{'character':'someone','company':'test'}},
                     {**self.body,'revision':'old'}]:
            status,answer=self.link.write('streetFoodRoute',body)
            self.assertEqual(status,409)
            self.assertEqual(answer['error'],'changed')
        _,review=self.link.write('streetFoodRoute',{**self.body,'dryRun':True})
        edited=copy.deepcopy(self.body);edited['stops'][0]['open']=610
        self.assertEqual(self.link.write('streetFoodRoute',{**edited,'quote':review['quote']})[0],409)
        self.assertFalse(self.link.street_routes)

    def test_invalid_travel_and_overnight_conflicts_refuse_without_changes(self):
        stops=[{'x':0,'z':0,'open':600,'close':700},{'x':1000,'z':0,'open':710,'close':800}]
        status,answer=self.link.write('streetFoodRoute',{**self.body,'stops':stops,'dryRun':True})
        self.assertEqual((status,answer['reason']),(409,'travel_gap'))
        stops=[{'x':0,'z':0,'open':1300,'close':1620}]
        # Tuesday starts at 10:00, so this late Monday is legal; reversed times are not.
        self.assertEqual(self.link.write('streetFoodRoute',{**self.body,'stops':stops,'dryRun':True})[0],200)
        stops[0]['close']=1200
        self.assertEqual(self.link.write('streetFoodRoute',{**self.body,'stops':stops,'dryRun':True})[0],409)
        self.assertFalse(self.link.street_routes)


if __name__ == '__main__':
    unittest.main()
