"""Office demand plans use synthetic customer history and preserve other duties."""
import unittest

from ba_dashboard import _hiring, _hourly, _office_staffing, _staff
from ba_save import Names
from test_staff_hire import COMPUTER, LAW, LAWYER, STREET, lawyer, office_registration, save_of, site_key


def plan(customers=1, staffed=4, history=True, missing=(), closed=False, support=False, door=50, days=14, closed_day=None):
    opens = [[] if closed else [[8, 16]] for _ in range(7)]
    employees = [lawyer(f'l{i}') for i in range(staffed)]
    for employee in employees:
        employee['demands'] = {'$items': []}
    shifts = [dict(wd=wd, employeeId=f'l{i}', itemInstanceId=f'pc{i}',
                   startingHour=8, endingHour=16, type=1)
              for wd in range(7) for i in range(staffed)]
    if closed_day is not None:
        opens[closed_day] = []
    reg = office_registration(4, opens, shifts=shifts)
    reg['customerCapacity'] = door
    if support:
        reg['itemInstances']['$items'].append({'$v': {'id': 'clean', 'itemName': 'ba:itemname_cleaningstation'}})
        reg['scheduleDays']['$items'][1]['workShifts']['$items'].append(
            dict(employeeId='l0', itemInstanceId='clean', startingHour=16, endingHour=20, type=0))
    if history:
        reg['orderHistory'] = {'$items': [
            {'dayNumber': day, 'hourReports': {'$items': [
                {'hour': h, 'customers': customers} for h in range(8, 16) if h not in missing]}}
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
    def test_measured_demand_reduces_workstation_hours_and_hiring(self):
        row, save, business = plan()
        self.assertTrue(row['demandBased'])
        self.assertEqual(row['need'][LAWYER][1][10], 1)
        self.assertEqual(row['basis'][LAWYER][1][10], 'measured')
        self.assertEqual(sum(s['t'] - s['f'] for s in row['shifts']), 56)
        self.assertEqual(row['staffedComputers'], 1)
        self.assertEqual(row['addPeople']['people'], 0)
        hiring = _hiring(save, [business], [], {}, [row])
        self.assertFalse(hiring['sites'][0]['plans']['office']['hireWeeks'])

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

    def test_zero_customers_with_staff_is_measured_zero(self):
        row, _, _ = plan(customers=0)
        self.assertTrue(row['demandBased'])
        self.assertEqual(row['shifts'], [])
        self.assertEqual(row['staffedComputers'], 0)
        self.assertEqual(len(row['_hire']['spare']), 4)

    def test_zero_customers_without_staff_uses_default(self):
        row, _, _ = plan(customers=0, staffed=0)
        self.assertNotIn('demandBased', row)
        self.assertEqual(row['need'][LAWYER][1][10], 4)

    def test_new_office_keeps_existing_default(self):
        row, _, _ = plan(history=False)
        self.assertNotIn('demandBased', row)
        self.assertEqual(row['need'][LAWYER][1][10], 4)

    def test_unread_hour_keeps_current_staffing_even_above_weekend_default(self):
        row, _, _ = plan(missing=(10,))
        self.assertEqual(row['basis'][LAWYER][0][10], 'office')
        self.assertEqual(row['need'][LAWYER][0][10], 4)
        self.assertEqual(row['need'][LAWYER][0][11], 1)
        self.assertEqual(row['need'][LAWYER][1][7], 0)

    def test_other_duties_do_not_make_their_worker_spare(self):
        row, _, _ = plan(customers=0, support=True)
        self.assertNotIn('l0', row['_hire']['spare'])
        self.assertEqual(len(row['_hire']['spare']), 3)
        self.assertEqual(row['cost']['weekly'], 560)
        self.assertTrue(any(s.get('k') for s in row['current']['list']))


if __name__ == '__main__':
    unittest.main()

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
