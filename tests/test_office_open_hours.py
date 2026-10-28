"""Opt-in office coverage uses saved hours and keeps the default independent."""
import copy
import unittest
from unittest.mock import patch

import ba_dashboard as bd
from tests.test_office_demand import plan
from tests.test_staff_hire import office_rows, lawyer


class OfficeOpenHoursTests(unittest.TestCase):
    def test_every_computer_every_saved_hour_including_split_days_and_nights(self):
        opens = [[[0, 4], [18, 24]], [], [[6, 12]], [[8, 22]], [], [[9, 17]], [[0, 24]]]
        _, _, [base] = office_rows(4, opens, [])
        opened = base['openCover']
        self.assertFalse(opened['openAllHours'])
        self.assertEqual(opened['variant'], 'open')
        self.assertNotIn('demandBased', opened)
        self.assertNotIn('need', opened)
        self.assertNotIn('basis', opened)
        self.assertEqual(opened['open'], opens)
        self.assertGreater(opened['addPeople']['people'], 0)
        for d, slots in enumerate(opens):
            hours = {h for a, z in slots for h in range(a, z)}
            for st in range(4):
                got = {h for s in opened['shifts'] if s['d'] == d and s['s'] == st
                       for h in range(s['f'], s['t'])}
                self.assertEqual(got, hours, (d, st))

    def test_no_opening_hours_does_not_offer_an_open_hours_plan(self):
        _, _, [row] = office_rows(2, [[] for _ in range(7)], [])
        self.assertNotIn('openCover', row)

    def test_default_is_identical_when_optional_planning_is_skipped(self):
        original = bd._office_site_plan
        for history in (False, True):
            with self.subTest(history=history):
                row, _, _ = plan(history=history)
                opened = row.pop('openCover')
                def skip(*args, **kwargs):
                    if kwargs.get('every_open'):
                        return {'failed': True}, []
                    return original(*args, **kwargs)
                with patch.object(bd, '_office_site_plan', side_effect=skip):
                    default, _, _ = plan(history=history)
                default.pop('openCover')
                self.assertEqual(row, default)
                self.assertNotEqual(row['shifts'], opened['shifts'])

    def test_alternative_does_not_repeat_discarded_demand_analysis(self):
        for name in ('_days_open', '_open_day_average', '_office_recent', '_office_need'):
            with self.subTest(helper=name), patch.object(bd, name, wraps=getattr(bd, name)) as helper:
                row, _, _ = plan()
                self.assertIn('openCover', row)
                self.assertEqual(helper.call_count, 1)

    def test_mod_compatibility_blocks_suppress_the_alternative(self):
        for gate, result in (('_mod_staffing_issues', ['synthetic-mod-issue']),
                             ('_mod_office_fallback_issue', True)):
            with self.subTest(gate=gate), patch.object(bd, gate, return_value=result):
                row, _, _ = plan(history=False)
                self.assertTrue(row['failed'])
                self.assertEqual(row['unavailable'], 'modCompatibility')
                self.assertNotIn('openCover', row)

    def test_offering_the_alternative_does_not_reserve_more_people_or_hours(self):
        original, worlds = bd._office_site_plan, []
        world_factory = bd._plan_world
        def capture(*args, **kwargs):
            world = world_factory(*args, **kwargs)
            worlds.append(world)
            return world
        def skip(*args, **kwargs):
            return ({'failed': True}, []) if kwargs.get('every_open') else original(*args, **kwargs)
        crew = [lawyer('own')] + [lawyer(f'bench{i}', here=False) for i in range(12)]
        opens = [[[0, 24]] for _ in range(7)]
        with patch.object(bd, '_plan_world', side_effect=capture):
            _, _, [with_option] = office_rows(4, opens, crew)
            with patch.object(bd, '_office_site_plan', side_effect=skip):
                _, _, [without] = office_rows(4, opens, crew)
        with_option.pop('openCover')
        without.pop('openCover')
        self.assertEqual(with_option, without)
        self.assertEqual(worlds[0], worlds[1])

    def test_alternative_failure_keeps_the_default_available(self):
        original = bd._office_site_plan
        def fail(*args, **kwargs):
            if kwargs.get('every_open'):
                raise ValueError('synthetic alternate failure')
            return original(*args, **kwargs)
        with patch.object(bd, '_office_site_plan', side_effect=fail), patch.object(bd, '_plan_failed', return_value='failed'):
            row, _, _ = plan()
        self.assertNotIn('failed', row)
        self.assertTrue(row['openCover']['failed'])

    def test_other_duties_still_reserve_employee_hours(self):
        row, _, _ = plan(support=True)
        opened = row['openCover']
        for s in opened['shifts']:
            if s['p'] is not None and opened['people'][s['p']]['id'] == 'l0' and s['d'] == 1:
                self.assertTrue(s['t'] <= 16 or s['f'] >= 20)

    def test_hiring_uses_the_alternatives_own_table_and_consumes_private_fields(self):
        save, business, [row] = office_rows(3, [[[8, 20]] for _ in range(7)], [lawyer('one')])
        expected = copy.deepcopy(row['openCover']['_hire'])
        hires = bd._take_hires([row])
        hiring = bd._hiring(save, [business], [], {}, [row], hires=hires)
        site = hiring['sites'][0]
        self.assertEqual(set(site['plans']), {'office', 'open'})
        self.assertEqual(site['plans']['open'], expected)
        self.assertNotIn('_hire', row)
        self.assertNotIn('_hire', row['openCover'])
        for week in site['plans']['open']['hireWeeks']:
            for slot in week['slots']:
                placed = row['openCover']['shifts'][slot['shift']]
                self.assertEqual(row['openCover']['stations'][placed['s']]['id'], slot['station'])
                self.assertEqual([placed[k] for k in ('d', 'f', 't')],
                                 [slot[k] for k in ('d', 'f', 't')])



if __name__ == '__main__':
    unittest.main()
