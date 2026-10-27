from pathlib import Path
import unittest
from unittest.mock import patch
import ba_dashboard as d
import ba_street_food as sf
from ba_save import Names
from tests import save_fixtures as f
from tests.test_street_food import load, company, state


class StreetFoodPlannerTests(unittest.TestCase):
    def payload(self, root):
        save = load(root)
        return sf.planner(save, Names(f.data_names()), d.load_buildings(save), d._open_hours)

    def test_schema_two_is_read_and_section_is_deferred(self):
        block = state(); block['schemaVersion'] = 2
        save = load(company(block))
        with patch("os.path.getmtime", return_value=1):
            build = d.build_core(save, Names(f.data_names()))
        self.assertNotIn('streetFood', build.core)
        self.assertEqual(d.section(build, 'streetFood')['streetFood']['schemaVersion'], 2)

    def test_browser_rules_are_read_from_the_worker_data_directory(self):
        sf.planning_rules.cache_clear()
        try:
            with patch.object(sf.sys, 'platform', 'emscripten'), patch.object(Path, 'read_text', autospec=True,
                    return_value='{"rules": {}}') as read:
                self.assertEqual(sf.planning_rules(), {'rules': {}})
                self.assertEqual(read.call_args.args[0], Path('/data/ba_street_food_rules.json'))
        finally:
            sf.planning_rules.cache_clear()

    def test_city_without_mod_still_has_opportunities_and_unknown_hours(self):
        root = f.data_company()
        for reg in root['BuildingRegistrations']:
            reg.pop('scheduleDays', None)
        data = self.payload(root)
        self.assertEqual(data['status'], 'absent')
        self.assertFalse(data['vehicles'])
        rows = [r for r in data['opportunities'] if r['kind'] == 'building']
        self.assertTrue(rows)
        self.assertTrue(all(r['hours'] is None for r in rows))
        self.assertTrue(all('traffic' not in r and 'footfall' not in r for r in data['opportunities']))

    def test_weekdays_minutes_closed_days_and_bad_routes_are_explicit(self):
        block = state(); block['schemaVersion'] = 2
        block['vehicles'][0]['schedule'] = {'stops':[{'day':1,'spotKey':'lunch','x':1,'z':2,'openAt':660,'closeAt':840}],
            'closed':[1], 'crewShifts':[{'employeeId':'crew','day':1,'start':9,'end':16}]}
        data = self.payload(company(block))
        schedule = data['vehicles'][0]['schedule']
        self.assertEqual(schedule['stops'][0]['day'], 0)
        self.assertEqual(schedule['days'], [])
        self.assertEqual(schedule['crewHours'][0]['start'], 540)
        block['vehicles'][0]['schedule']['stops'][0]['x'] = None
        vehicle = self.payload(company(block))['vehicles'][0]
        self.assertIsNone(vehicle['schedule'])
        self.assertEqual(vehicle['routeStatus'], 'unavailable')

    def test_legacy_route_repeats_only_saved_days(self):
        block = state()
        block['vehicles'][0]['schedule'] = {'days':[1,3], 'stops':[{'spotKey':'lunch','x':1,'z':2,'openAt':660,'closeAt':840}]}
        schedule = self.payload(company(block))['vehicles'][0]['schedule']
        self.assertEqual(schedule['days'], [0,2])
        self.assertEqual([s['day'] for s in schedule['stops']], [0,2])

    def test_announced_events_only_and_live_speed_revision(self):
        block = state()
        place = sf.planning_rules()['eventPlaces'][0]
        event = {'id':1,'kind':'market','placeId':place['id'],'announcedDay':4,'day':6,'start':600,'end':960,'booked':1}
        block['events'] = {'events':[event, {**event,'id':2,'announcedDay':6}, {**event,'id':3,'day':3}]}
        data = self.payload(company(block, {'status':'fresh','gameSpeed':2,'routeRevisions':{'cart':'rev'}}))
        events = [r for r in data['opportunities'] if r['kind'] == 'event']
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['eventDay'], 6)
        self.assertEqual(events[0]['buildingKey'], place['address'])
        self.assertEqual(data['gameSpeed'], 2)
        self.assertEqual(data['vehicles'][0]['routeRevision'], 'rev')

    def test_optional_planning_records_can_be_missing_or_malformed(self):
        block = state()
        block.update(events={'events': None}, vehicleNumbers=None)
        data = self.payload(company(block, {'status': 'fresh', 'routeRevisions': []}))
        self.assertEqual(len(data['vehicles']), 1)
        self.assertIsNone(data['vehicles'][0]['routeRevision'])
        self.assertFalse([r for r in data['opportunities'] if r['kind'] == 'event'])

    def test_vehicle_names_use_saved_numbers_only_when_needed(self):
        block = state()
        kind = 'foodtrucks:vehicletype_foodcart'
        block['vehicleNumbers'] = [{'id': 'cart', 'kind': kind, 'number': 7}]
        root = company(block)
        one = self.payload(root)['vehicles'][0]['name']
        root['VehicleInstances'].append({'id': 'second-cart', 'vehicleTypeName': kind})
        self.assertEqual(self.payload(root)['vehicles'][0]['name'], one + ' 7')


if __name__ == '__main__':
    unittest.main()
