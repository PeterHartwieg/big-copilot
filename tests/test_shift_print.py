"""The shift print: docs/game-link-api.md, "Shift print". The mod pins the same vector."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
import es3_fixture  # noqa: E402
from ba_dashboard import schedule_entries, shift_print  # noqa: E402
from ba_save import Save  # noqa: E402

EMPLOYEE = "AAAAemployeeAAAAAAAAAAAA"


class ShiftPrint(unittest.TestCase):
    def test_the_contract_vector(self):
        self.assertEqual(shift_print([
            (1, 8, 20, EMPLOYEE, "BBBBstationBBBBBBBBBBBBB", 1),
            (0, 0, 12, EMPLOYEE, "CCCCcleanCCCCCCCCCCCCCCC", 0),
        ]), "ee01ac86")

    def test_no_shifts_is_the_print_of_the_empty_string(self):
        self.assertEqual(shift_print([]), "811c9dc5")

    def test_read_from_a_registration_with_the_save_leaving_defaults_out(self):
        # Day 7 is Sunday (0); a cleaning shift's type 0 and a missing id are
        # left out of the save and printed at their defaults.
        registration = {"scheduleDays": {"$items": [
            {"day": 8, "workShifts": {"$items": [
                {"startingHour": 8, "endingHour": 20, "employeeId": EMPLOYEE,
                 "itemInstanceId": "BBBBstationBBBBBBBBBBBBB", "type": 1}]}},
            {"day": 7, "workShifts": {"$items": [
                {"endingHour": 12, "employeeId": EMPLOYEE, "itemInstanceId": "CCCCcleanCCCCCCCCCCCCCCC"}]}},
        ]}}
        self.assertEqual(shift_print(schedule_entries(Save({}, {}, "t.hsg"), registration)), "ee01ac86")
        self.assertEqual(schedule_entries(Save({}, {}, "t.hsg"), {"scheduleDays": {"$items": [
            {"day": 3, "workShifts": {"$items": [{"startingHour": 1, "endingHour": 2}]}}]}}),
            [(3, 1, 2, "", "", 0)])

    def test_every_business_carries_its_print(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "link.hsg")
            es3_fixture.write_link_save(path)
            prints = {b["key"]: b["shiftPrint"] for b in es3_fixture.link_payload(path)["businesses"]}
        self.assertEqual(prints["ba:street_fifthavenue#4"], "811c9dc5")
        self.assertEqual(prints["ba:street_secondavenue#10"], shift_print([
            (0, 0, 12, EMPLOYEE, "CLEANcccccccccccccccccc==ue", 0),
            (1, 8, 20, EMPLOYEE, "REGISTERaaaaaaaaaaaaaa==ue", 1)]))


if __name__ == "__main__":
    unittest.main()
