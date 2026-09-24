"""A gym overstaffed on three weekdays, as the site page and Today are given it.

tests/site_panel.test.cjs checks that the site page's hours block tells the
same week as the site's Today line: the same staff-hours, the same hours and
the same wages. Both halves have to come out of the real Python, or the test
only proves that two hand-written fixtures agree with each other. So the grid
is tests/test_idle_week.py's gym, `_hour_findings()` is run over it and
`_alerts()` over that, exactly as `extract()` does.

Three trainers over two boards, 8-20 on Monday, Tuesday and Wednesday, ten
customers an hour: two of them spare every hour, 24 staff-hours a day, 72 a
week. The worst run is Monday's alone.

`python -m tests.idle_week_fixture mixed` is a gym whose roster differs by day:
two trainers on Monday and four on Tuesday, over four boards, so the week is two
parts, one per headcount.
"""
import json
import sys

from ba_dashboard import _alerts, _hour_findings
from tests.test_idle_week import EMPTY_SUPPLY, MONDAY, TUESDAY, WAGES, WEDNESDAY, business, gym


def fixture(kind: str = "") -> dict:
    grid = (gym([MONDAY, TUESDAY], boards=4, on={MONDAY: 2, TUESDAY: 4}) if kind == "mixed"
            else gym([MONDAY, TUESDAY, WEDNESDAY]))
    findings = _hour_findings([grid], [business()], WAGES)
    result = _alerts([business()], EMPTY_SUPPLY, [], [], [], findings, [], 20, 0.0)
    [row] = [a for a in result["lines"] + result["minor"]["rows"] if a["group"] == "idlestaff"]
    return {"grid": grid, "findings": findings, "row": row}


if __name__ == "__main__":
    sys.stdout.write(json.dumps(fixture(sys.argv[1] if len(sys.argv) > 1 else "")))
