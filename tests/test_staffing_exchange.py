"""Synthetic exchange regressions: moving entries must update both weeks and indexes."""
import copy
import unittest
from unittest.mock import patch

import ba_dashboard as board


def person(pid, skills, ceiling=4, floor=0):
    return dict(id=pid, name=pid, skills=set(skills), band=(floor, ceiling),
                days=None, addr='test-site', nocleaning=False,
                weekendsOff=False, blackouts=[])


def row(employee, skill, wd, start=8, end=12, station='Register'):
    return dict(employee=employee, skill=skill, kind='serve', wd=wd,
                **{'from': start, 'to': end}, station=station)


def weeks(people, shifts):
    state = {p['id']: board._fresh_state() for p in people}
    by_id = {p['id']: p for p in people}
    for shift in shifts:
        if shift['employee'] is not None:
            board._take_over(shift, by_id[shift['employee']], state)
    return state


class ExchangeTest(unittest.TestCase):
    def test_chained_swaps_can_give_away_both_newly_filled_and_received_entries(self):
        people = [person('A', ['x', 'y', 'z']), person('B', ['x', 'w']),
                  person('C', ['y']), person('D', ['x'])]
        shifts = [row('A', 'x', 0), row(None, 'y', 1),
                  row(None, 'z', 2), row(None, 'w', 3)]
        state = weeks(people, shifts)
        self.assertEqual(board._fill_by_exchange(shifts, people, state, set(state)), 3)
        self.assertEqual([s['employee'] for s in shifts], ['D', 'C', 'A', 'B'])
        for pid, day in [('A', 2), ('B', 3), ('C', 1), ('D', 0)]:
            self.assertEqual(state[pid]['hours'], 4)
            self.assertEqual(state[pid]['days'], {day})
            self.assertEqual(state[pid]['busy'][day], set(range(8, 12)))
            self.assertEqual(state[pid]['stations'], {('Register', day)})

    def test_givers_newly_filled_entry_precedes_its_later_existing_entry(self):
        people = [person('A', ['x', 'v', 'y', 'z'], ceiling=8),
                  person('B', ['x']), person('C', ['y']), person('D', ['v'])]
        shifts = [row('A', 'x', 0), row('A', 'v', 5),
                  row(None, 'y', 1), row(None, 'z', 2)]
        state = weeks(people, shifts)
        self.assertEqual(board._fill_by_exchange(shifts, people, state, set(state)), 2)
        # After filling day 1, A must consider that new entry before the
        # pre-existing day 5 entry when making room for day 2.
        self.assertEqual([s['employee'] for s in shifts], ['B', 'A', 'C', 'A'])
        self.assertEqual(state['A']['days'], {2, 5})
        self.assertEqual(state['C']['days'], {1})
        self.assertEqual(state['D']['hours'], 0)

    def test_takers_received_entry_precedes_its_later_existing_entry(self):
        people = [person('A', ['x', 'y']),
                  person('B', ['x', 'v', 'z'], ceiling=8),
                  person('C', ['x']), person('D', ['v'])]
        shifts = [row('A', 'x', 0), row('B', 'v', 5),
                  row(None, 'y', 1), row(None, 'z', 2)]
        state = weeks(people, shifts)
        self.assertEqual(board._fill_by_exchange(shifts, people, state, set(state)), 2)
        # B receives day 0 after day 5 is already indexed. Giving
        # day 0 to C is the first legal exchange by clock order.
        self.assertEqual([s['employee'] for s in shifts], ['C', 'B', 'A', 'B'])
        self.assertEqual(state['B']['days'], {2, 5})
        self.assertEqual(state['C']['days'], {0})
        self.assertEqual(state['D']['hours'], 0)

    def test_equal_clock_holes_keep_original_list_order(self):
        # Only one of these interchangeable holes can be filled: A's old
        # entry can move once, and B cannot take the newly filled role.
        people = [person('A', ['x', 'y']), person('B', ['x'])]
        first, second = row(None, 'y', 1), row(None, 'y', 1)
        shifts = [row('A', 'x', 0), first, second]
        state = weeks(people, shifts)
        self.assertEqual(board._fill_by_exchange(shifts, people, state, set(state)), 1)
        self.assertEqual(first['employee'], 'A')
        self.assertIsNone(second['employee'])

    def test_rejected_swap_preserves_weeks_and_final_stops_at_first_failure(self):
        people = [person('A', ['x', 'y'], ceiling=8, floor=8), person('B', ['x'], ceiling=8)]
        shifts = [row('A', 'x', 0, 8, 16), row(None, 'y', 1), row(None, 'y', 2)]
        state = weeks(people, shifts)
        before = copy.deepcopy((shifts, state))
        failures = []
        def final(hole):
            failures.append(hole)
            return True
        self.assertEqual(board._fill_by_exchange(shifts, people, state, set(state), final=final), 0)
        self.assertEqual(failures, [shifts[1]])
        self.assertEqual((shifts, state), before)

    def test_shared_role_answers_are_reused_across_fresh_weeks(self):
        people = [person('A', ['x', 'y']), person('B', ['x'])]
        answers = {}
        with patch.object(board, '_may_take', wraps=board._may_take) as may_take:
            for run in range(2):
                shifts = [row('A', 'x', 0), row(None, 'y', 1)]
                state = weeks(people, shifts)
                self.assertEqual(board._fill_by_exchange(shifts, people, state, set(state), answers=answers), 1)
                self.assertEqual([s['employee'] for s in shifts], ['B', 'A'])
                if run == 0:
                    first_calls = may_take.call_count
                    self.assertGreater(first_calls, 0)
                else:
                    self.assertEqual(may_take.call_count, first_calls)

    def test_many_swaps_do_not_reindex_every_unchanged_entry(self):
        # Independent roles make twenty successful swaps deterministic. Counting
        # shape calculations detects repeated full indexing without wall-clock
        # thresholds, even on fast machines or under heavily loaded CI.
        count = 20
        people, shifts = [], []
        for i in range(count):
            people.extend([person(f'g{i:02}', [f'x{i}', f'y{i}']),
                           person(f't{i:02}', [f'x{i}'])])
            shifts.extend([row(f'g{i:02}', f'x{i}', 0), row(None, f'y{i}', 1)])
        state = weeks(people, shifts)
        with patch.object(board, '_slot_shape', wraps=board._slot_shape) as shape:
            self.assertEqual(board._fill_by_exchange(shifts, people, state, set(state)), count)
        self.assertEqual([s['employee'] for s in shifts[::2]], [f't{i:02}' for i in range(count)])
        self.assertEqual([s['employee'] for s in shifts[1::2]], [f'g{i:02}' for i in range(count)])
        self.assertLessEqual(shape.call_count, 4 * len(shifts))


if __name__ == '__main__':
    unittest.main()
