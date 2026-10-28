"""Synthetic office plans shared by the browser and write-path tests."""
import json
from ba_dashboard import _hiring
from tests.test_office_demand import plan


def fixture():
    row, save, business = plan(support=True)
    business.update(shiftPrint='synthetic-print', address='10 Second Avenue')
    hiring = _hiring(save, [business], [], {}, [row])
    return {'meta': {'character': 'office-open-hours', 'day': 15},
            'businesses': [business], 'officeStaffing': [row], 'hiring': hiring,
            'staffing': [], 'supply': {}, 'staff': []}


if __name__ == '__main__':
    print(json.dumps(fixture()))
