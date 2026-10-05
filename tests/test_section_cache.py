"""Cross-build planning capsules, always over synthetic companies."""
import copy
import gc
import os
import tempfile
import unittest
import weakref
from unittest.mock import patch
import ba_dashboard as board
from ba_save import Names, load_save
from tests import save_fixtures

class PlanningCacheTests(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, 'synthetic.hsg')
        save_fixtures.write_data_save(self.path, save_fixtures.DAY)
        self.names = save_fixtures.data_names()
        self.cache = board.PlanningCache(min_compute_seconds=0)

    def build(self, cache=True):
        return board.build_core(load_save(self.path), Names(dict(self.names)), planning_cache=self.cache if cache else None)

    def plans(self, build):
        board.section(build, 'hiring')
        return {name: build.sections[name] for name in ('staffing', 'officeStaffing', 'factoryStaffing', 'hiring')}

    def test_hit_restores_all_worlds_private_hires_and_complete_payload(self):
        producers = ('_staffing', '_office_staffing', '_factory_staffing')
        with patch.object(board, '_staffing', wraps=board._staffing) as shop, patch.object(board, '_office_staffing', wraps=board._office_staffing) as office, patch.object(board, '_factory_staffing', wraps=board._factory_staffing) as factory:
            first = self.build()
            expected = board.materialize_all(first)
            second = self.build()
            got = board.materialize_all(second)
            self.assertEqual(got, expected)
            self.assertEqual([shop.call_count, office.call_count, factory.call_count], [1, 1, 1])
            self.assertEqual(second.shared['planning'], first.shared['planning'])
            self.assertEqual(sorted(second.private['hires'].values(), key=str), sorted(first.private['hires'].values(), key=str))
            self.assertTrue(set(second.private['hires']).isdisjoint(first.private['hires']))
            self.assertEqual(len(self.cache.entries), 3)

    def test_mutations_of_restored_payload_world_and_hires_do_not_poison_cache(self):
        first = self.build()
        expected = copy.deepcopy(self.plans(first))
        second = self.build()
        self.plans(second)
        second.sections['staffing']['staffing'][0]['name'] = 'Poison'
        second.shared['planning']['staffing']['bench'].clear()
        for hire in second.private['hires'].values():
            if isinstance(hire, dict):
                hire['poison'] = True
        third = self.build()
        self.assertEqual(self.plans(third), expected)
        self.assertEqual(third.shared['planning'], first.shared['planning'])

    def test_cache_does_not_retain_save_or_build(self):
        first = self.build()
        self.plans(first)
        saved = weakref.ref(first.save)
        built = weakref.ref(first)
        del first
        gc.collect()
        self.assertIsNone(saved())
        self.assertIsNone(built())

    def test_cash_only_change_hits_while_core_updates_and_hiring_runs_fresh(self):
        first = self.build()
        self.plans(first)
        second = self.build()
        second.save.root['Money'] += 100
        second = board.build_core(second.save, second.names, planning_cache=self.cache)
        with patch.object(board, '_staffing', wraps=board._staffing) as shop, patch.object(board, '_hiring', wraps=board._hiring) as hiring:
            self.plans(second)
            self.assertEqual(shop.call_count, 0)
            self.assertEqual(hiring.call_count, 1)
        self.assertEqual(second.core['kpi']['cash'], first.core['kpi']['cash'] + 100)

    def test_key_covers_relevant_raw_refs_world_locale_tables_and_rules(self):
        build = self.build()
        world = board._planning_world(build)
        key = board._planning_key(build, 'staffing', world)
        changes = [lambda b, w: b.shared['staff'][0].update(name='Changed'), lambda b, w: b.shared['businesses'][0].update(name='Changed'), lambda b, w: b.shared['all_grids'][0].update(cacheEvidence='reset'), lambda b, w: b.names.locale.update(help_cache='Changed'), lambda b, w: b.save.root.update(characterId='Other'), lambda b, w: b.save.root.update(Day=b.save.root['Day'] + 1), lambda b, w: w['bench'].append(next(iter(w['people'].values())))]
        for change in changes:
            with self.subTest(change=change):
                other = self.build()
                other_world = board._planning_world(other)
                change(other, other_world)
                self.assertNotEqual(board._planning_key(other, 'staffing', other_world), key)
        with patch.object(board, 'PLANNING_CACHE_VERSION', board.PLANNING_CACHE_VERSION + 1):
            self.assertNotEqual(board._planning_key(build, 'staffing', world), key)
        other = self.build()
        other_world = board._planning_world(other)
        with patch.object(board, 'load_buildings', return_value={'different': 'facts'}):
            self.assertNotEqual(board._planning_key(other, 'staffing', other_world), key)
        other = self.build()
        other_world = board._planning_world(other)
        with patch.object(board, 'load_demand_curves', return_value={'different': 'curves'}):
            self.assertNotEqual(board._planning_key(other, 'staffing', other_world), key)

    def test_reachable_reference_contents_invalidate_unreachable_do_not(self):
        build = self.build()
        world = board._planning_world(build)
        build.save.refs[999999] = build.save.root['EmployeeInstances']
        build.save.root['EmployeeInstances'] = {'$ref': 999999}
        raw = board._planning_raw_inputs(build.save)
        self.assertTrue(raw['refs'])
        key = board._planning_key(build, 'staffing', world)
        other = self.build()
        other_world = board._planning_world(other)
        other.save.refs[999999] = dict(other.save.root['EmployeeInstances'], cacheSynthetic='changed')
        other.save.root['EmployeeInstances'] = {'$ref':999999}
        self.assertNotEqual(board._planning_key(other, 'staffing', other_world), key)
        build = self.build()
        world = board._planning_world(build)
        build.save.refs[999999] = build.save.root['EmployeeInstances']
        build.save.root['EmployeeInstances'] = {'$ref': 999999}
        build.save.refs[-1000000] = {'unreachable': 'candidate'}
        self.assertEqual(board._planning_key(build, 'staffing', world), key)

    def test_failure_rows_and_exceptions_are_not_cached_and_retry_cleanly(self):
        build = self.build()
        world = board._planning_world(build)
        world['bench'].append(next(iter(world['people'].values())))

        def failed(current):
            current['bench'].clear()
            return [{'failed': True}]
        rows, _ = board._cached_planning(build, 'staffing', world, failed)
        self.assertEqual(rows, [{'failed': True}])
        self.assertFalse(self.cache.entries)
        self.assertTrue(world['bench'])

        def explode(current):
            current['bench'].clear()
            raise RuntimeError('synthetic failure')
        with self.assertRaisesRegex(RuntimeError, 'synthetic failure'):
            board._cached_planning(build, 'staffing', world, explode)
        self.assertFalse(self.cache.entries)
        self.assertTrue(world['bench'])
        self.plans(build)
        self.assertEqual(len(self.cache.entries), 3)

    def test_private_extraction_or_wire_failure_does_not_publish_a_capsule(self):
        for helper in ('_take_hires', '_wire_msgs'):
            build = self.build()
            with self.subTest(helper=helper):
                with patch.object(board, helper, side_effect=RuntimeError('synthetic post-producer failure')):
                    with self.assertRaisesRegex(RuntimeError, 'post-producer failure'):
                        board.section(build, 'staffing')
                self.assertFalse(self.cache.entries)
                self.assertFalse(build._planning_pending)
                self.assertNotIn('staffing', build.sections)
                with patch.object(board, '_staffing', wraps=board._staffing) as shop:
                    board.section(build, 'staffing')
                    self.assertEqual(shop.call_count, 1)
                self.cache = board.PlanningCache(min_compute_seconds=0)

    def test_typed_keys_preserve_order_sets_and_msg_metadata(self):
        digest = board._planning_bytes
        self.assertEqual(digest({None: {2, 1}, ('line', 1): {1: 'x', '1': 'y'}}), digest({('line', 1): {'1': 'y', 1: 'x'}, None: {1, 2}}))
        for a, b in [(1, '1'), (True, 1), ([1, 2], [2, 1]), ((1, 2), [1, 2]), (board.Msg('same', 'a', {'n': 1}), board.Msg('same', 'b', {'n': 1})), (board.Msg('same', 'a', {'n': 1}), board.Msg('same', 'a', {'n': 2}))]:
            self.assertNotEqual(digest(a), digest(b))

    def test_request_orders_keep_predecessor_world_and_payload_equivalent(self):
        expected = board.materialize_all(self.build(cache=False))
        for order in [('factoryStaffing', 'staffing', 'officeStaffing'), ('officeStaffing', 'hiring', 'staffing'), ('hiring',)]:
            build = self.build()
            for name in order:
                board.section(build, name)
            self.assertEqual(board.materialize_all(build), expected)

    def test_factory_posts_and_predecessor_state_change_its_key(self):
        build = self.build()
        board.section(build, 'officeStaffing')
        world = board._planning_world(build, 'officeStaffing')
        key = board._planning_key(build, 'factoryStaffing', world)
        build.private['posts']['line', 123, 0] = ['new-machine']
        self.assertNotEqual(board._planning_key(build, 'factoryStaffing', world), key)
        build = self.build()
        board.section(build, 'officeStaffing')
        world = board._planning_world(build, 'officeStaffing')
        next(iter(world['state'].values()))['hours'] += 1
        self.assertNotEqual(board._planning_key(build, 'factoryStaffing', world), key)

    def test_browser_hit_still_obeys_new_generation_and_failed_build(self):
        import json
        locale = os.path.join(self.tmp.name, 'en.json')
        history = os.path.join(self.tmp.name, 'history.json')
        with open(locale, 'w', encoding='utf-8') as fh:
            json.dump(self.names, fh)
        with patch.object(board, '_BROWSER_PLANNING_CACHE', self.cache):
            board.browser_build(self.path, locale, history, generation=1)
            board.browser_section('hiring', 1)
            with patch.object(board, '_staffing', wraps=board._staffing) as shop:
                board.browser_build(self.path, locale, history, generation=2)
                with self.assertRaises(board.StaleBuild):
                    board.browser_section('hiring', 1)
                reply = json.loads(board.browser_section('hiring', 2))
                self.assertEqual(reply['generation'], 2)
                self.assertEqual(shop.call_count, 0)
            with self.assertRaises(board.SaveShapeError):
                board.browser_build(os.path.join(self.tmp.name, 'missing.hsg'), locale, history, generation=3)
            with self.assertRaises(board.StaleBuild):
                board.browser_section('hiring', 2)

    def test_warm_plans_use_current_candidates_and_their_demands(self):
        first = self.build()
        self.plans(first)
        second = self.build()
        person = copy.deepcopy(second.save.items(second.save.root['EmployeeInstances'])[0])
        person.update(id='CANDIDATEcache', candidateInfo={'hoursUntilExpiring': 24}, demands={'$items': ['ba:jobdemand_nomornings']}, hourlyWage=12.0)
        second.save.root['CandidateEmployeeInstances'] = {'$items': [person]}
        with patch.object(board, '_staffing', wraps=board._staffing) as shop:
            self.plans(second)
            self.assertEqual(shop.call_count, 0)
        candidates = second.sections['hiring']['candidates']
        self.assertEqual(candidates[0]['id'], 'CANDIDATEcache')
        self.assertEqual(candidates[0]['wage'], 12)
        self.assertIn('ba:jobdemand_nomornings', candidates[0]['demands'])

    def test_employee_and_station_fields_invalidate_raw_inputs(self):
        first = self.build()
        world = board._planning_world(first)
        key = board._planning_key(first, 'staffing', world)
        fields = {'hourlyWage': 19.5, 'isInTraining': True, 'name': 'Different', 'demands': {'$items': ['ba:jobdemand_nomornings']}, 'assignedAddress': {'streetName': 'ba:other', 'streetNumber': 1}, 'characterData': {'name': 'Changed', 'skills': {'$items': [{'name': 'ba:skill_cleaning', 'value': 90}]}}}
        for field, value in fields.items():
            with self.subTest(field=field):
                other = self.build()
                other_world = board._planning_world(other)
                other.save.items(other.save.root['EmployeeInstances'])[0][field] = value
                self.assertNotEqual(board._planning_key(other, 'staffing', other_world), key)
        other = self.build()
        other_world = board._planning_world(other)
        reg = other.save.items(other.save.root['BuildingRegistrations'])[0]
        reg['scheduleDays'] = {'$items': []}
        self.assertNotEqual(board._planning_key(other, 'staffing', other_world), key)

    def test_entry_lru_byte_budget_and_oversized_bypass(self):
        cache = board.PlanningCache(max_entries=2, max_bytes=2000)
        cache.put(('shop', 'a'), {'rows': [1]})
        cache.put(('shop', 'b'), {'rows': [2]})
        cache.get(('shop', 'a'))
        cache.put(('shop', 'c'), {'rows': [3]})
        self.assertIsNone(cache.get(('shop', 'b')))
        before = cache.bytes
        cache.put(('shop', 'huge'), {'rows': ['x' * 3000]})
        self.assertEqual(cache.bytes, before)
        self.assertIsNone(cache.get(('shop', 'huge')))
        capsule = {'rows': [123456]}
        budget = board._planning_size(capsule)
        small = board.PlanningCache(max_entries=10, max_bytes=budget)
        small.put('first', capsule)
        self.assertIsNotNone(small.get('first'))
        small.put('second', capsule)
        self.assertIsNone(small.get('first'))
        self.assertIsNotNone(small.get('second'))
        self.assertEqual(len(small.entries), 1)
        self.assertLessEqual(small.bytes, budget)

    def test_cheap_admission_skips_fingerprint_and_capsule_copy(self):
        self.cache = board.PlanningCache()
        expected = board.section(self.build(cache=False), 'staffing')
        with patch.object(board, '_planning_key', side_effect=AssertionError('cheap plan hashed')), patch.object(board.time, 'perf_counter', side_effect=[0, .001, 0, .001]), patch.object(board, '_staffing', wraps=board._staffing) as producer:
            for _ in range(2):
                build = self.build()
                self.assertEqual(board.section(build, 'staffing'), expected)
                self.assertIsNone(build._planning_invariant)
            self.assertEqual(producer.call_count, 2)
        self.assertFalse(self.cache.entries)

    def test_expensive_admission_reuses_result_and_restores_world(self):
        self.cache = board.PlanningCache()
        first = self.build()
        with patch.object(board.time, 'perf_counter', side_effect=[0, 1]):
            expected = board.section(first, 'staffing')
        self.assertEqual(len(self.cache.entries), 1)
        second = self.build()
        with patch.object(board, '_staffing', side_effect=AssertionError('admitted plan recomputed')):
            self.assertEqual(board.section(second, 'staffing'), expected)
        self.assertEqual(second.shared['planning'], first.shared['planning'])
        self.assertEqual(sorted(second.private['hires'].values(), key=str), sorted(first.private['hires'].values(), key=str))

    def test_common_fingerprint_is_computed_once_per_accepted_build(self):
        with patch.object(board, '_planning_raw_inputs', wraps=board._planning_raw_inputs) as inputs:
            self.plans(self.build())
            self.assertEqual(inputs.call_count, 1)
            self.plans(self.build())
            self.assertEqual(inputs.call_count, 2)

    def test_publication_memory_error_preserves_successful_section(self):
        expected = board.section(self.build(cache=False), 'staffing')
        first = self.build()
        with patch.object(self.cache, 'put', side_effect=MemoryError):
            self.assertEqual(board.section(first, 'staffing'), expected)
        self.assertFalse(self.cache.entries)
        self.assertEqual(board.section(self.build(), 'staffing'), expected)
        self.assertEqual(len(self.cache.entries), 1)

    def test_typed_mapping_optimization_preserves_distinctions(self):
        self.assertEqual(board._planning_typed({'b': 2, 'a': 1}), board._planning_typed({'a': 1, 'b': 2}))
        self.assertNotEqual(board._planning_typed({'1': 2}), board._planning_typed({1: 2}))
        self.assertNotEqual(board._planning_typed({1}), board._planning_typed(frozenset({1})))
if __name__ == '__main__':
    unittest.main()
