"""Office demand plans use synthetic customer history and preserve other duties."""
import json
import tempfile
import unittest
from pathlib import Path

from ba_dashboard import ALL_DAY_OPEN, History, _counts_only, _hour_findings, _hourly, _office_staffing, _staff
from ba_save import Names
from tests.test_staff_hire import COMPUTER, LAW, LAWYER, STREET, lawyer, office_registration, save_of, site_key


def plan(customers=1, staffed=4, history=True, missing=(), closed=False, support=False, door=50, days=14, closed_day=None,
         computers=4):
    # `customers` is one count for every report, or a function of the day number.
    count = customers if callable(customers) else (lambda day: customers)
    opens = [[] if closed else [[8, 16]] for _ in range(7)]
    employees = [lawyer(f'l{i}') for i in range(staffed)]
    for employee in employees:
        employee['demands'] = {'$items': []}
    shifts = [dict(wd=wd, employeeId=f'l{i}', itemInstanceId=f'pc{i}',
                   startingHour=8, endingHour=16, type=1)
              for wd in range(7) for i in range(staffed)]
    if closed_day is not None:
        opens[closed_day] = []
    reg = office_registration(computers, opens, shifts=shifts)
    reg['customerCapacity'] = door
    if support:
        reg['itemInstances']['$items'].append({'$v': {'id': 'clean', 'itemName': 'ba:itemname_cleaningstation'}})
        reg['scheduleDays']['$items'][1]['workShifts']['$items'].append(
            dict(employeeId='l0', itemInstanceId='clean', startingHour=16, endingHour=20, type=0))
    if history:
        reg['orderHistory'] = {'$items': [
            {'dayNumber': day, 'hourReports': {'$items': [
                {'hour': h, 'customers': count(day)} for h in range(8, 16) if h not in missing]}}
            for day in range(1, days + 1)]}
    save = save_of({'EmployeeInstances': {'$items': employees},
                    'BuildingRegistrations': {'$items': [reg]}})
    business = {'key': site_key((STREET, 10)), 'name': 'Test Law', 'status': 'office',
                'typeSlug': LAW, 'basket': 100, 'staff': len(employees)}
    _, staff = _staff(save, Names({}))
    grids = _hourly(save, [reg], [business], {}, {COMPUTER},
                    {p['id']: p['skill'] for p in staff}, Names({}))
    [row] = _office_staffing(save, Names({}), [business], grids, staff)
    return row, save, business


class OfficeDemandTests(unittest.TestCase):
    def test_two_readings_well_under_todays_staffing_cut_to_them_plus_one(self):
        # 1 an hour in both of the latest weeks under today's 4: three under,
        # past what the plan's own one-computer steps can explain, so the plan
        # is the higher reading plus one spare computer.
        row, _, _ = plan()
        self.assertTrue(row['demandBased'])
        self.assertEqual(row['need'][LAWYER][1][10], 2)
        self.assertEqual(row['basis'][LAWYER][1][10], 'measured')

    def test_twenty_staffed_for_ten_cuts_to_eleven(self):
        row, _, _ = plan(customers=10, staffed=20, computers=24)
        self.assertEqual(row['need'][LAWYER][1][10], 11)

    def test_one_under_todays_staffing_never_cuts(self):
        # 10 under today's 11 may be the week before the plan's own step up.
        row, _, _ = plan(customers=10, staffed=11, computers=24)
        self.assertEqual(row['need'][LAWYER][1][10], 11)

    def test_only_one_of_the_two_readings_low_keeps_todays_staffing(self):
        # The older week read 10, the latest 19, under today's 20: no cut.
        row, _, _ = plan(customers=lambda day: 19 if day > 7 else 10, staffed=20, computers=24)
        self.assertEqual(row['need'][LAWYER][1][10], 20)

    def test_a_single_report_never_cuts(self):
        # Only the latest week filed a report for this weekday: no cut.
        _, save, business = plan(customers=10, staffed=20, computers=24)
        reg = save.items(save.root['BuildingRegistrations'])[0]
        for day in save.items(reg['orderHistory']):
            if day['dayNumber'] % 7 == 1 and day['dayNumber'] <= 7:
                day['hourReports']['$items'] = []
        _, staff = _staff(save, Names({}))
        grids = _hourly(save, [reg], [business], {}, {COMPUTER},
                        {p['id']: p['skill'] for p in staff}, Names({}))
        [row] = _office_staffing(save, Names({}), [business], grids, staff)
        self.assertEqual(row['need'][LAWYER][1][10], 20)
        self.assertEqual(row['need'][LAWYER][2][10], 11)

    def test_a_large_office_never_cuts_its_own_step_up(self):
        # From 20 computers a reading one under is full (95%) and grew the
        # hour; 19 and 19 under today's 21 must not cut it back to 20.
        row, _, _ = plan(customers=19, staffed=21, computers=24)
        self.assertEqual(row['need'][LAWYER][1][10], 21)
        # 38 at 41: full at 38, 39 and 40, so the plan settles at 41.
        row, _, _ = plan(customers=38, staffed=41, computers=50)
        self.assertEqual(row['need'][LAWYER][1][10], 41)
        row, _, _ = plan(customers=38, staffed=40, computers=50)
        self.assertEqual(row['need'][LAWYER][1][10], 41)

    def test_a_full_hour_still_grows_by_one(self):
        row, _, _ = plan(customers=20, staffed=20, computers=24)
        self.assertEqual(row['basis'][LAWYER][1][10], 'censored')
        self.assertEqual(row['need'][LAWYER][1][10], 21)

    def test_a_computer_just_added_is_not_planned_away(self):
        # Two weeks of 2 an hour, then a third computer staffed: 2 is under 95%
        # of 3, but the reports came from two computers, so the third stays.
        row, _, _ = plan(customers=2, staffed=3)
        self.assertEqual(row['need'][LAWYER][1][10], 3)

    def test_staff_limited_sales_allow_another_computer(self):
        row, _, _ = plan(customers=1, staffed=1)
        self.assertEqual(row['basis'][LAWYER][1][10], 'censored')
        self.assertEqual(row['need'][LAWYER][1][10], 2)
        self.assertGreater(row['addPeople']['people'], 0)

    def test_installed_workstations_bound_censored_hours(self):
        row, _, _ = plan(customers=4)
        self.assertEqual(row['need'][LAWYER][1][10], 4)

    def test_building_capacity_bounds_censored_hours(self):
        row, _, _ = plan(customers=2, door=2)
        self.assertEqual(row['basis'][LAWYER][1][10], 'censored')
        self.assertEqual(row['need'][LAWYER][1][10], 2)

    def test_building_capacity_below_todays_staffing_bounds_the_floor(self):
        # Three computers staffed in a building that takes two customers an
        # hour: the floor is today's staffing up to the building capacity.
        row, _, _ = plan(customers=1, staffed=3, door=2)
        self.assertEqual(row['basis'][LAWYER][1][10], 'measured')
        self.assertEqual(row['need'][LAWYER][1][10], 2)
        # The same floor for an hour with no report: on a weekend, where the
        # office default staffs two, four staffed for three customers keep three.
        row, _, _ = plan(customers=1, staffed=4, door=3, missing=(12,))
        self.assertEqual(row['basis'][LAWYER][6][12], 'office')
        self.assertEqual(row['need'][LAWYER][6][12], 3)

    def test_one_week_of_history_keeps_the_default(self):
        row, _, _ = plan(days=7)
        self.assertNotIn('demandBased', row)
        self.assertEqual(row['need'][LAWYER][1][10], 4)

    def test_closed_day_stays_closed_despite_old_customer_reports(self):
        row, _, _ = plan(closed_day=1)
        self.assertTrue(row['demandBased'])
        self.assertEqual(row['open'][1], [])
        self.assertEqual(row['need'][LAWYER][1], [0] * 24)
        self.assertFalse(any(s['d'] == 1 for s in row['shifts']))

    def test_zero_customers_with_staff_now_keeps_one_spare_computer(self):
        row, _, _ = plan(customers=0)
        self.assertTrue(row['demandBased'])
        self.assertEqual(sum(s['t'] - s['f'] for s in row['shifts']), 56)

    def test_zero_customers_without_staff_uses_default(self):
        row, _, _ = plan(customers=0, staffed=0)
        self.assertNotIn('demandBased', row)
        self.assertEqual(row['need'][LAWYER][1][10], 4)

    def test_new_office_keeps_existing_default(self):
        row, _, _ = plan(history=False)
        self.assertNotIn('demandBased', row)
        self.assertEqual(row['need'][LAWYER][1][10], 4)

    def test_staffed_hour_with_no_report_is_no_reading_once_data_is_complete(self):
        # Unlike a shop's, an hour with no report on file is not a measured
        # zero: the office may only now be staffed then (its hours extended,
        # or the office default applied), so it keeps the default or today's.
        row, _, _ = plan(customers=2, staffed=3, missing=(12, 13, 14, 15))
        self.assertEqual(row['basis'][LAWYER][1][12], 'office')
        self.assertEqual(row['need'][LAWYER][1][12], 4)
        self.assertEqual(row['basis'][LAWYER][1][11], 'measured')
        self.assertEqual(row['need'][LAWYER][1][11], 3)
        self.assertEqual(row['need'][LAWYER][1][7], 0)

    def test_unread_hour_keeps_current_staffing_before_data_is_complete(self):
        row, _, _ = plan(missing=(10,), days=8, customers=4)
        self.assertEqual(row['basis'][LAWYER][0][10], 'office')
        self.assertEqual(row['need'][LAWYER][0][10], 4)

    def test_unstaffed_hour_keeps_the_default_rather_than_measured_zero(self):
        # Nobody at a computer files no customers; that zero is not demand.
        _, save, business = plan(customers=1, staffed=4)
        reg = save.items(save.root['BuildingRegistrations'])[0]
        for scheduled in save.items(reg['scheduleDays']):
            for shift in save.items(scheduled['workShifts']):
                shift['startingHour'] = 9
        for day in save.items(reg['orderHistory']):
            day['hourReports']['$items'] = [r for r in day['hourReports']['$items'] if r['hour'] != 8]
        _, staff = _staff(save, Names({}))
        grids = _hourly(save, [reg], [business], {}, {COMPUTER},
                        {p['id']: p['skill'] for p in staff}, Names({}))
        [row] = _office_staffing(save, Names({}), [business], grids, staff)
        self.assertEqual(row['basis'][LAWYER][1][8], 'office')
        self.assertGreater(row['need'][LAWYER][1][8], 0)
        self.assertEqual(row['basis'][LAWYER][1][9], 'measured')

    def test_every_hour_staff_limited_never_plans_the_old_headcount(self):
        # Office customers are the professionals at a computer, one for one,
        # so a fully used hour says nothing of the demand above it: the shop's
        # censored estimate adds a computer there rather than keeping the week.
        row, _, _ = plan(customers=2, staffed=2)
        cells = [(wd, h) for wd in range(7) for h in range(8, 16)]
        self.assertTrue(all(row['basis'][LAWYER][wd][h] == 'censored' for wd, h in cells))
        self.assertTrue(all(row['need'][LAWYER][wd][h] == 3 for wd, h in cells))
        self.assertNotIn('demandEvidence', row)

    def test_other_duties_do_not_make_their_worker_spare(self):
        row, _, _ = plan(customers=0, support=True)
        self.assertNotIn('l0', row['_hire']['spare'])
        self.assertTrue(any(s.get('k') for s in row['current']['list']))


class CountsOnlyTests(unittest.TestCase):
    def test_shops_and_offices_are_read_from_their_counts_alone(self):
        shop = dict(office=False, open=[[[8, 16]]] * 7, capHours=5)
        office = dict(office=True, open=[[] for _ in range(7)], capHours=5)
        _counts_only([shop, office])
        for grid in (shop, office):
            self.assertTrue(grid['countsOnly'])
            self.assertEqual(grid['capHours'], 0)
        self.assertEqual(shop['open'], [[[8, 16]]] * 7)
        self.assertEqual(office['open'], ALL_DAY_OPEN)

    def test_an_office_gets_no_hour_findings(self):
        # 1 an hour under 4 computers would be overstaffed hours on today's
        # staffing; an office's reports cannot say what was on, so none.
        _, save, business = plan(customers=1, staffed=4)
        _, staff = _staff(save, Names({}))
        grids = _hourly(save, save.items(save.root['BuildingRegistrations']), [business], {}, {COMPUTER},
                        {p['id']: p['skill'] for p in staff}, Names({}))
        wages = {business['key']: {role['skill']: 100 for role in grids[0]['roles']}}
        self.assertTrue(_hour_findings(grids, [business], wages))
        _counts_only(grids)
        self.assertEqual(_hour_findings(grids, [business], wages), [])

    def test_old_measurement_records_leave_the_history_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / 'history.json')
            Path(path).write_text(json.dumps({'characters': {'company-a': {
                'staffingEvidence': {'version': 1, 'sites': {'x': {}}},
                'lineNames': {'r1': 'ba:itemname_x'}}}}), encoding='utf-8')
            self.assertTrue(History(path).write())
            book = json.loads(Path(path).read_text(encoding='utf-8'))['characters']['company-a']
            self.assertNotIn('staffingEvidence', book)
            self.assertEqual(book['lineNames'], {'r1': 'ba:itemname_x'})


class RetainedDutyTests(unittest.TestCase):
    def rerun(self, save, business):
        regs = save.items(save.root['BuildingRegistrations'])
        _, staff = _staff(save, Names({}))
        grids = _hourly(save, regs, [business], {}, {COMPUTER},
                        {p['id']: p['skill'] for p in staff}, Names({}))
        return _office_staffing(save, Names({}), [business], grids, staff)[0]

    def test_professional_and_retained_hours_together_meet_fulltime_minimum(self):
        _, save, business = plan(staffed=1)
        person = save.items(save.root['EmployeeInstances'])[0]
        person['demands'] = {'$items': ['ba:jobdemand_fulltime']}
        person['assignedWeeklyHours'] = 50
        reg = save.items(save.root['BuildingRegistrations'])[0]
        reg['itemInstances']['$items'].append({'$v': {'id': 'clean', 'itemName': 'ba:itemname_cleaningstation'}})
        for scheduled in save.items(reg['scheduleDays']):
            wd = scheduled['day'] % 7
            if wd in (0, 6):
                scheduled['workShifts'] = {'$items': []}
                scheduled['openingHourSlots'] = {'$items': []}
            else:
                scheduled['workShifts']['$items'].append(dict(employeeId='l0', itemInstanceId='clean', startingHour=16, endingHour=18, type=0))
        for day in save.items(reg['orderHistory']):
            for hour in save.items(day['hourReports']):
                hour['customers'] = int(day['dayNumber'] % 7 not in (0, 6) and hour['hour'] < 12)
        row = self.rerun(save, business)
        self.assertEqual(sum(s['t']-s['f'] for s in row['shifts'] if s['p'] is not None), 20)
        self.assertEqual(row['shortHours'], [])
        self.assertEqual(row['_hire']['fewer'][0]['hours'], 30)

    def test_zero_professional_need_does_not_leave_a_retained_worker_below_minimum(self):
        _, save, business = plan(customers=0, staffed=1, support=True)
        save.items(save.root['EmployeeInstances'])[0]['demands'] = {'$items': ['ba:jobdemand_fulltime']}
        row = self.rerun(save, business)
        p = next(i for i, p in enumerate(row['people']) if p['id'] == 'l0')
        total = 4 + sum(s['t'] - s['f'] for s in row['shifts'] if s['p'] == p)
        self.assertGreaterEqual(total, 30)
        self.assertLessEqual(total, 50)
        self.assertEqual(row['shortHours'], [])

    def test_pinned_hours_include_retained_duties_under_the_weekly_limit(self):
        _, save, business = plan(staffed=1, support=True)
        save.items(save.root['EmployeeInstances'])[0]['demands'] = {'$items': ['ba:jobdemand_fulltime']}
        row = self.rerun(save, business)
        p = next(i for i, p in enumerate(row['people']) if p['id'] == 'l0')
        proposed = [s for s in row['shifts'] if s['p'] == p]
        retained = [s for s in row['current']['list'] if s['p'] == p and s.get('k')]
        all_hours = proposed + retained
        self.assertLessEqual(sum(s['t']-s['f'] for s in all_hours), 50)
        for d in range(7):
            slots = [h for s in all_hours if s['d'] == d for h in range(s['f'], s['t'])]
            self.assertLessEqual(len(slots), 12)
            self.assertEqual(len(slots), len(set(slots)))


if __name__ == '__main__':
    unittest.main()
