"""Prospective shop and office demand evidence; all input is synthetic."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from ba_dashboard import (History, _staff_evidence_ingest, _staff_evidence_need,
                          _staff_measurement_action, _office_need, _office_runs)
from tests.test_office_demand import plan


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = str(Path(self.tmp.name) / 'history.json')
        _, self.save, self.business = plan(staffed=1)
        self.save.root.update(characterId='company-a', Day=15, Hour=0, Minute=0)
        self.building = self.save.items(self.save.root['BuildingRegistrations'])[0]
        self.grid = dict(key=self.business['key'], office=True, open=[[[8, 9]]] * 7,
                         effective=[[1] * 24 for _ in range(7)], door=4,
                         roles=[dict(skill='lawyer', label='Lawyer', stationCount=4,
                                     counters=4, staffed=[[1] * 24 for _ in range(7)])],
                         stations=[dict(id=f'p{i}', skill='lawyer', rate=1) for i in range(4)])

    def ingest(self, day=None):
        if day is not None:
            self.save.root['Day'] = day
        history = History(self.path)
        _staff_evidence_ingest(history, self.save, [self.business], [self.building], [self.grid])
        self.assertTrue(history.write())
        return history

    def action(self, action):
        _staff_measurement_action(History(self.path), self.save.root['characterId'],
                                 self.business['key'], action, self.grid, self.save.root['Day'])

    def records(self, end, value=1, missing=False):
        self.building['orderHistory'] = {'$items': [
            {'dayNumber': d, 'hourReports': {'$items': [] if missing else [{'hour': 8, 'customers': value}]}}
            for d in range(1, end + 1)]}

    def need(self):
        return _staff_evidence_need(self.grid)['lawyer']

    def capacity(self, n):
        self.grid['effective'] = [[n] * 24 for _ in range(7)]
        self.grid['roles'][0]['staffed'] = [[n] * 24 for _ in range(7)]

    def complete(self, value=1, missing=False):
        self.ingest()
        self.action('start')
        self.capacity(2)
        self.ingest()  # actual coverage reread: start on day 16
        self.records(29, value, missing)
        # Preserve overlapping old reports; only subsequent days are new.
        for e in self.building['orderHistory']['$items'][:14]:
            e['hourReports']['$items'] = [{'hour': h, 'customers': 1} for h in range(8, 16)]
        self.ingest(30)
        self.assertEqual(self.grid['evidence']['session']['phase'], 'ready')

    def test_schedule_changes_never_reinterpret_old_reports_for_shops_or_offices(self):
        for office in (True, False):
            with self.subTest(office=office):
                self.grid['office'] = office
                self.ingest()
                before = copy.deepcopy(self.need())
                for n in (2, 0, 1):
                    self.capacity(n)
                    self.ingest()
                    self.assertEqual(self.need(), before)
                self.assertEqual(self.need()['basis'][1][8], 'lower')
                self.assertEqual(self.need()['demand'][1][8], 1)

    def test_proposal_and_failed_apply_cannot_learn(self):
        self.ingest(); self.action('start'); self.ingest()
        self.assertEqual(self.grid['evidence']['session']['phase'], 'pending')
        self.assertEqual(self.need()['need'][1][8], 2)
        self.assertFalse(self.grid['evidence']['learned'])

    def test_partial_office_history_keeps_default_for_each_unknown_hour(self):
        self.grid['open'] = [[[8, 10]] for _ in range(7)]
        self.grid['staffed'] = self.grid['roles'][0]['staffed']
        for wd in range(7):
            self.grid['staffed'][wd][9] = 0
            self.grid['effective'][wd][9] = 0
        self.records(14, value=1)
        self.ingest()
        runs, _ = _office_runs(4, self.grid['open'], self.grid['door'])
        need, _ = _office_need(self.grid, 'lawyer', runs)
        self.assertEqual(need['lawyer']['basis'][1][9], 'none')
        self.assertEqual(need['lawyer']['need'][1][9], 4)
        # Only an explicit confirmed measurement may turn that hour into zero.
        self.grid['evidence']['learned']['1:9'] = {'value': 0, 'stale': False}
        need, _ = _office_need(self.grid, 'lawyer', runs)
        self.assertEqual(need['lawyer']['need'][1][9], 0)

    def test_unstaffed_new_office_uses_its_default_not_every_computer_all_week(self):
        self.capacity(0)
        self.grid['staffed'] = self.grid['roles'][0]['staffed']
        self.records(14, missing=True)
        self.ingest()
        runs, _ = _office_runs(4, self.grid['open'], self.grid['door'])
        need, _ = _office_need(self.grid, 'lawyer', runs)
        for wd in range(7):
            self.assertEqual(need['lawyer']['need'][wd][8],
                             sum(8 in days[wd] for days in runs.values()))
        with self.assertRaises(ValueError):
            self.action('confirm')

    def test_successful_trial_returns_to_lean_and_stays_there(self):
        self.complete(); self.action('confirm'); self.ingest()
        self.assertEqual(self.need()['basis'][1][8], 'confirmed')
        self.assertEqual(self.need()['need'][1][8], 1)
        self.capacity(1); self.ingest()
        self.assertEqual(self.need()['need'][1][8], 1)
        self.assertEqual(self.grid['evidence']['session']['phase'], 'confirmed')

    def test_zero_needs_confirmation_and_completed_daily_records(self):
        self.complete(value=0, missing=True)
        self.assertFalse(self.grid['evidence']['learned'])
        self.action('confirm'); self.ingest()
        self.assertEqual(self.need()['need'][1][8], 0)
        self.capacity(0); self.ingest()
        self.assertEqual(self.need()['need'][1][8], 0)
        self.action('start'); self.ingest()
        self.assertEqual(self.need()['need'][1][8], 1)
        self.assertEqual(self.grid['evidence']['session']['phase'], 'pending')

    def test_current_day_and_rereads_cannot_finish_measurement(self):
        self.ingest(); self.action('start'); self.capacity(2); self.ingest()
        self.records(22)
        for e in self.building['orderHistory']['$items'][:14]:
            e['hourReports']['$items'] = [{'hour': h, 'customers': 1} for h in range(8, 16)]
        self.ingest(22)
        samples = copy.deepcopy(self.grid['evidence']['session']['samples'])
        self.ingest()
        self.assertEqual(samples, self.grid['evidence']['session']['samples'])
        self.assertNotIn('22:8', samples)
        self.assertEqual(self.grid['evidence']['session']['phase'], 'active')

    def test_undo_or_changed_configuration_stops_trial(self):
        self.ingest(); self.action('start'); self.capacity(2); self.ingest()
        self.capacity(1); self.ingest(16)
        self.assertEqual(self.grid['evidence']['session']['phase'], 'stopped')
        self.assertFalse(self.grid['evidence']['learned'])

    def test_rewind_conflict_and_replacement_discard_learning(self):
        for cause in ('rewind', 'conflict', 'replacement'):
            with self.subTest(cause=cause):
                self.setUp()
                self.complete(); self.action('confirm'); self.ingest()
                if cause == 'rewind':
                    self.save.root['Day'] = 20
                elif cause == 'conflict':
                    self.building['orderHistory']['$items'][20]['hourReports']['$items'][0]['customers'] = 9
                else:
                    self.building['creationDay'] = 29
                self.ingest()
                self.assertFalse(self.grid['evidence']['learned'])
                self.assertIsNone(self.grid['evidence']['session'])

    def test_still_constrained_requires_separate_trial(self):
        self.complete(value=2); self.action('confirm'); self.ingest()
        self.assertFalse(self.grid['evidence']['learned'])
        self.assertEqual(self.grid['evidence']['session']['phase'], 'confirmed')
        self.assertNotEqual(self.need()['basis'][1][8], 'trial')
        self.action('start'); self.ingest()
        self.assertEqual(self.grid['evidence']['session']['targets']['1:8']['capacity'], 3)

    def test_probe_keeps_coverage_of_nonlimiting_roles(self):
        self.grid['office'] = False
        self.grid['roles'].append(dict(skill='cash', stationCount=4, counters=4,
                                       staffed=[[4] * 24 for _ in range(7)]))
        self.grid['stations'] += [dict(id=f'c{i}', skill='cash', rate=1) for i in range(4)]
        self.ingest(); self.action('start'); self.ingest()
        needs = _staff_evidence_need(self.grid)
        self.assertEqual(needs['lawyer']['need'][1][8], 2)
        self.assertEqual(needs['cash']['need'][1][8], 4)


    def test_new_tenant_does_not_import_previous_business_reports(self):
        self.building['creationDay'] = 29
        self.ingest(30)
        self.assertFalse(self.grid['evidence']['lower'])


    def test_tied_role_and_building_limit_prevent_ineffective_probe(self):
        self.ingest()
        self.grid['roles'].append(copy.deepcopy(self.grid['roles'][0]))
        with self.assertRaises(ValueError): self.action('start')
        self.grid['roles'].pop(); self.grid['door'] = 1
        with self.assertRaises(ValueError): self.action('start')

    def test_office_missing_opening_hours_keeps_the_all_day_convention(self):
        self.grid['open'] = [[] for _ in range(7)]
        self.ingest()
        self.assertEqual(self.need()['need'][1][8], 1)
        self.action('start')
        self.ingest()
        self.assertEqual(self.grid['evidence']['session']['phase'], 'pending')

    def test_backfill_cannot_change_measurement(self):
        self.ingest(); self.action('start')
        before = Path(self.path).read_text()
        self.save.root['_staffingBackfill'] = True
        self.capacity(2)
        self.ingest(30)
        self.assertEqual(Path(self.path).read_text(), before)


    def test_no_company_no_persistent_learning(self):
        self.save.root.pop('characterId')
        self.ingest()
        self.assertFalse(self.grid['evidence']['persistent'])
        with self.assertRaises(ValueError):
            _staff_measurement_action(History(self.path), None, self.business['key'], 'start', self.grid, 15)

    def test_competing_writers_do_not_merge_experiments(self):
        self.ingest()
        stale = History(self.path)
        self.action('start')
        self.assertFalse(stale.write())
        self.ingest()
        self.assertEqual(self.grid['evidence']['session']['phase'], 'pending')

    def test_malformed_evidence_is_replaced(self):
        h = self.ingest()
        h.book['company-a']['staffingEvidence']['sites'][self.business['key']]['reports'] = {'bad': []}
        h.write()
        self.ingest()
        self.assertEqual(self.need()['basis'][1][8], 'lower')

    def test_manual_stop_and_deadline_never_learn(self):
        self.ingest(); self.action('start'); self.action('stop'); self.ingest()
        self.assertEqual(self.grid['evidence']['session']['phase'], 'stopped')
        self.action('start'); self.ingest(44)
        self.assertEqual(self.grid['evidence']['session']['phase'], 'stopped')
        self.assertFalse(self.grid['evidence']['learned'])


if __name__ == '__main__': unittest.main()
