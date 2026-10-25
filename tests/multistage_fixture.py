"""Synthetic settled/fallback payloads for the saved-import browser regression."""
import contextlib
import io
import json
from pathlib import Path
from unittest.mock import patch

import ba_dashboard
from tests.test_factory_staffing import People, factory_rows
from tests.test_factory_use import run_with
from tests.test_multistage_demand import F1, F2, RECIPES, WATER, Company, two_breweries


def payloads():
    real_save = Company.save

    def scheduled_save(company):
        save = real_save(company)
        for registration in save.root["BuildingRegistrations"]:
            for day in registration["scheduleDays"]:
                for hours in day["workShifts"]:
                    hours["endingHour"] = 20
        return save

    result = {}
    with patch.object(Company, "save", scheduled_save):
        company = two_breweries(1000)
        for addr in (F1, F2):
            company.contract(addr, WATER, 100)
        for mode in ("settled", "fallback"):
            with patch.object(ba_dashboard, "LEAST_LOAD_STEPS",
                              0 if mode == "fallback" else ba_dashboard.LEAST_LOAD_STEPS):
                with contextlib.redirect_stderr(io.StringIO()):
                    run_with(company, RECIPES)
            data = json.loads((Path(__file__).parent / "fixtures/r8_supply.json").read_text(encoding="utf-8"))
            data.update(supply=company.supply, businesses=company.business_list, alerts=[],
                        factoryStaffing=factory_rows(company, People()))
            for business in data["businesses"]:
                business.update(typeSlug=business["typeSlug"].replace("ba:businesstype_", ""),
                                address=business["key"], crew=[])
                business["type"] = "Factory" if business["typeSlug"] == "factory" else "Gift Shop"
            result[mode] = data
    return result


if __name__ == "__main__":
    print(json.dumps(payloads()))
