"""Validate RLO's independently versioned planning data without reading private saves.

The declarative field shapes mirror the owner's public planning.schema.json.
Unknown additive fields are permitted, but bounded by the shared transport.
No files are opened: the same adapter runs in CPython and Pyodide.
"""
from __future__ import annotations

import math
import re
from decimal import Decimal, InvalidOperation

from ba_companion import MAX_INT, _bounded, boolean, integer, rows, text

_DECIMAL = re.compile(r"^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?$")

# Generated from RLO contracts/companion/v1/planning.schema.json; retain field names.
SHAPES = {'utilities': {'model': ('enum', 'rlo-utilities-v1'),
               'terms': {'accrualBasis': ('enum', 'daily-cents'),
                         'boughtStartup': ('enum', 'temporary-then-apply'),
                         'closedShareThousandths': 'int',
                         'connectDays': 'int',
                         'dailyCapCents': 'int',
                         'depositBackBills': 'int',
                         'depositMonthsByGrade': ('array', 'int'),
                         'extraPersonShareThousandths': 'int',
                         'homePowerBase': 'int',
                         'homePowerPerSqm': 'int',
                         'homeWaterPerPerson': 'int',
                         'moneyRounding': ('enum', 'cents-half-up-to-whole'),
                         'monthDays': 'int',
                         'powerPerSqm': ('array', 'int'),
                         'powerSeasonThousandths': ('array', 'int'),
                         'priceLevel': 'int',
                         'priceLevelMax': 'int',
                         'priceLevelMin': 'int',
                         'rentedStartup': ('enum', 'active-no-deposit'),
                         'seasonByDayOfYear': ('array', 'int'),
                         'standingCents': ('array', 'int'),
                         'temporaryDays': 'int',
                         'temporarySurchargeThousandths': 'int',
                         'unitCents': ('array', 'int'),
                         'waterPerSqm': ('array', 'int'),
                         'waterSeasonThousandths': ('array', 'int'),
                         'yearDays': 'int'},
               'typeKinds': ('array', {'typeId': 'text', 'kind': 'int'}),
               'accounts': ('array',
                            {'address': {'street': 'text', 'number': 'uint'},
                             'service': ('enum', 'power', 'water', 'internet'),
                             'state': ('enum', 'pending', 'active', 'temporary', 'cut', 'closed'),
                             'owned': 'boolean',
                             'accruedCents': 'int',
                             'fromDay': 'int',
                             'lastDay': 'int',
                             'owedCents': 'int',
                             'dueDay': 'int',
                             'lastBillCents': 'int',
                             'lastBillDay': 'int',
                             'depositCents': 'int',
                             'connectDay': 'int',
                             'temporaryUntilDay': 'int',
                             'provider': 'int',
                             'plan': 'int',
                             'contractUntilDay': 'int',
                             'monthCents': 'int',
                             'outageFromHour': 'int',
                             'outageUntilHour': 'int',
                             'businessPlan': 'boolean'}),
               'unresolvedAccountServices': ('array', 'text'),
               'internet': {'providers': ('array',
                                          {'provider': 'int',
                                           'id': 'text',
                                           'districts': ('array', 'text'),
                                           'plans': ('array',
                                                     {'plan': 'int',
                                                      'mbps': 'int',
                                                      'businessContractMonthCents': 'int',
                                                      'businessMonthlyMonthCents': 'int'})}),
                            'installDays': 'int',
                            'installFeeCents': 'int',
                            'contractInstallFeeCents': 'int',
                            'contractDays': 'int',
                            'needs': ('array', 'text'),
                            'futureOutageAssumption': ('enum', 'no-outage-days'),
                            'dailyRounding': 'text',
                            'accrualIncludesOtherProviderSeatCharges': 'boolean'},
               'internetEnabled': 'boolean',
               'graceUntilDay': 'int',
               'graceAddresses': ('array', {'street': 'text', 'number': 'uint'}),
               'closureConditions': ('array', 'text')},
 'prices': {'model': ('enum', 'rlo-prices-v1'),
            'wholesaleBasis': ('enum', 'item-field-before-market-index-and-multiplier'),
            'defaultMarketBasis': ('enum', 'item-field-before-market-index-and-multiplier'),
            'defaultMarketSource': ('enum', 'live-registered-item'),
            'levelThousandths': 'int',
            'quietBand': 'int',
            'adjustmentQuiet': 'int',
            'costFactorThousandths': 'int',
            'takingsFactorThousandths': 'int',
            'items': ('array',
                      {'itemId': 'text',
                       'ownAmount': 'decimal',
                       'effectiveAmount': 'decimal',
                       'kind': 'int',
                       'factorThousandths': 'int',
                       'exchangeFactor': ('nullable', 'decimal'),
                       'provenance': ('enum', 'material-exchange', 'city-kind', 'registered-current'),
                       'defaultMarketAmount': 'decimal'}),
            'livingTransactionTypes': ('array', 'text'),
            'livingExcludesWholesalePurchases': 'boolean',
            'adjustmentRounding': 'text',
            'statementAdjustment': ('enum', 'already-included'),
            'depositAdjustment': ('nullable', ('enum', 'none', 'rentCostFactor')),
            'depositAdjustmentBasis': 'text',
            'depositRefundAdjustment': ('enum', 'none'),
            'carriedDebtInSiteForecast': 'boolean'},
 'company': {'partStates': {'staff': ('enum', 'ready', 'disabled', 'failed'),
                            'cover': ('enum', 'ready', 'disabled', 'failed'),
                            'marketing': ('enum', 'ready', 'disabled', 'failed'),
                            'tax': ('enum', 'ready', 'disabled', 'failed'),
                            'licences': ('enum', 'ready', 'disabled', 'failed')},
             'model': ('enum', 'rlo-company-v1'),
             'sites': ('array',
                       {'address': {'street': 'text', 'number': 'uint'},
                        'raises': ('array', {'employeeId': 'text', 'raiseHourlyCents': 'int'}),
                        'sickPayPolicy': 'int',
                        'managerDailyAllowanceCents': 'uint',
                        'overtime': {'active': 'boolean',
                                     'fromDay': 'int',
                                     'untilDay': 'int',
                                     'dailyCents': 'int'},
                        'cover': ('array',
                                  {'kind': 'int',
                                   'insurer': 'int',
                                   'dailyCents': 'int',
                                   'fromDay': 'int',
                                   'untilDay': 'int',
                                   'claims': 'int',
                                   'active': 'boolean',
                                   'quoteInputs': {'averageTakingsCents': 'int',
                                                   'income': 'int',
                                                   'index': 'int',
                                                   'carriedClaims': 'int'},
                                   'quotes': ('array',
                                              {'insurer': 'int',
                                               'eligible': 'boolean',
                                               'dayCents': 'uint'})}),
                        'licences': ('array',
                                     {'kind': 'int',
                                      'untilDay': 'int',
                                      'valid': 'boolean',
                                      'autoRenew': 'boolean'}),
                        'hiddenCashShareThousandths': 'int',
                        'campaign': {'kind': 'int',
                                     'active': 'boolean',
                                     'fromDay': 'int',
                                     'untilDay': 'int',
                                     'paidCents': 'int',
                                     'percent': 'int',
                                     'discountGivenCents': 'int'}}),
             'parts': {'staff': 'boolean',
                       'cover': 'boolean',
                       'marketing': 'boolean',
                       'tax': 'boolean',
                       'licences': 'boolean'},
             'newHireWageFactorThousandths': 'int',
             'sickShareThousandthsByPolicy': ('array', 'int'),
             'sickFallbackDayHours': 'int',
             'newSiteDefaults': {'raiseHourlyCents': 'int',
                                 'sickPayPolicy': 'int',
                                 'cover': ('enum', 'none'),
                                 'campaign': ('enum', 'none'),
                                 'hiddenCashShareThousandths': 'int'},
             'accountant': {'tier': 'int', 'monthlyFeeCents': 'int', 'nextDay': 'int', 'monthDays': 'int'},
             'coverTerms': {'baseMoney': ('array', 'int'),
                            'takingsShareThousandths': ('array', 'int'),
                            'insurerPriceThousandths': ('array', 'int'),
                            'incomePerPoint': ('array', 'int'),
                            'districtMinThousandths': 'int',
                            'districtMaxThousandths': 'int',
                            'claimLoadingThousandths': 'int',
                            'termDays': 'int'},
             'statementInclusion': ('array',
                                    {'costKind': 'int',
                                     'costName': ('enum',
                                                  'wages',
                                                  'premiums',
                                                  'marketing',
                                                  'licences',
                                                  'accountant'),
                                     'statementCategory': ('nullable', 'text')})},
 'requirements': {'model': ('enum', 'rlo-opening-requirements-v1'),
                  'types': ('array', {'typeId': 'text', 'licenceNeedsMask': 'int'}),
                  'licences': ('array',
                               {'kind': 'int',
                                'feeCents': 'int',
                                'termDays': 'int',
                                'closesWhenMissing': 'boolean'}),
                  'lateOpeningHours': {'before': 'int', 'after': 'int', 'permitKind': 'int'},
                  'permitValidity': ('enum', 'untilDay-inclusive'),
                  'newSiteGraceDays': 'int',
                  'paymentBasis': ('enum', 'startup-then-term-renewal'),
                  'internetNeeds': ('array', 'text')},
 'education': {'model': ('enum', 'rlo-education-v1'),
               'quoteBasis': ('enum', 'captured-settings-cash-and-loan-room'),
               'courses': ('array',
                           {'courseId': 'int',
                            'offered': 'boolean',
                            'qualified': 'boolean',
                            'prerequisitesMet': 'boolean',
                            'enrollment': ('nullable',
                                           {'status': 'text',
                                            'paidCents': 'int',
                                            'loanCents': 'int',
                                            'installmentsPaid': 'int',
                                            'installmentsTotal': 'int',
                                            'owedCents': 'int',
                                            'startDay': 'int',
                                            'mode': 'int',
                                            'onLoan': 'boolean'}),
                            'quotes': ('array',
                                       {'mode': 'int',
                                        'loan': 'boolean',
                                        'immediateCashCents': 'uint',
                                        'totalFeeCents': 'uint',
                                        'installmentsTotal': 'int',
                                        'installments': ('array',
                                                         {'index': 'int',
                                                          'afterSessions': 'int',
                                                          'amountCents': 'uint'}),
                                        'futurePriceBasis': ('enum', 'captured-level'),
                                        'quoteStatus': ('enum', 'ok', 'ineligible', 'unknown'),
                                        'reason': ('nullable', 'text'),
                                        'feeNowCents': 'int',
                                        'grantCents': 'int',
                                        'grantThousandths': 'int',
                                        'retakeCents': 'int',
                                        'approximateDurationDays': 'int',
                                        'daysMask': 'int',
                                        'startHour': 'int'}),
                            'timetable': {'daysMask': 'int',
                                          'startHour': 'int',
                                          'hours': 'int',
                                          'sessions': 'int',
                                          'homework': 'int'}}),
               'loanOwedCents': 'uint',
               'loanRateBasisPointsPerYear': 'int',
               'completionGuarantee': 'boolean'},
 'footfall': {'terms': {'issueMin': 'int',
                        'issueMax': 'int',
                        'ambientMin': 'int',
                        'ambientMax': 'int',
                        'interiorMin': 'int',
                        'interiorMax': 'int',
                        'promotionMin': 'int',
                        'promotionMax': 'int',
                        'promotionCoefficient': 'decimal',
                        'rounding': ('enum', 'float32-add-half-truncate')},
              'model': ('enum', 'rlo-footfall-v1'),
              'sites': ('array',
                        {'address': {'street': 'text', 'number': 'uint'},
                         'status': ('enum', 'ready', 'unavailable'),
                         'ownPromotion': ('nullable', 'int'),
                         'writtenPromotion': ('nullable', 'int'),
                         'registrationPromotionAtCapture': ('nullable', 'int'),
                         'issuePercent': ('nullable', 'int'),
                         'ambientPercent': ('nullable', 'int'),
                         'interiorPercent': ('nullable', 'int'),
                         'cityPercent': 'int',
                         'companyPercent': 'int',
                         'baseMultiplier': ('nullable', 'decimal')}),
              'priceTolerance': ('nullable',
                                 {'marketSource': ('enum', 'city-find-goods-captured-item'),
                                  'marketBasis': ('enum', 'item-field-before-market-index-and-multiplier'),
                                  'districts': ('array',
                                                {'districtId': 'text',
                                                 'priceIndex': ('nullable', 'decimal'),
                                                 'toleranceThousandths': 'int',
                                                 'cyclePercent': 'int',
                                                 'districtPercent': 'int'}),
                                  'items': ('array', {'itemId': 'text', 'marketAmount': 'decimal'}),
                                  'monopolies': ('array', {'itemId': 'text', 'districtId': 'text'}),
                                  'bearsMinThousandths': 'int',
                                  'bearsMaxThousandths': 'int',
                                  'monopolyAllowanceThousandths': 'int',
                                  'overBandThousandths': 'int',
                                  'underGainPercent': 'int',
                                  'overLossPerPercent': 'int',
                                  'overLossMaxPercent': 'int',
                                  'footfallMinPercent': 'int',
                                  'footfallMaxPercent': 'int',
                                  'footfallQuietPercent': 'int',
                                  'ratioRounding': 'text'}),
              'futureAssumption': ('enum', 'captured-city-settings-held-constant')},
 'interiors': {'model': ('enum', 'rlo-interiors-v1'),
               'districts': ('array',
                             {'districtId': 'text',
                              'income': 'int',
                              'nativeMinimum': 'int',
                              'requiredScore': 'int'}),
               'sites': ('array',
                         {'address': {'street': 'text', 'number': 'uint'},
                          'overall': 'int',
                          'decor': 'int',
                          'interior': 'int',
                          'requiredScore': 'int',
                          'footfallPercent': 'int',
                          'priceToleranceThousandths': 'int',
                          'basketThousandths': 'int',
                          'rampThousandths': 'int',
                          'standardFromDay': 'int',
                          'officeBoostThousandths': 'int',
                          'fitting': 'boolean',
                          'saleStop': 'text'}),
               'items': ('array',
                         {'itemId': 'text',
                          'category': 'int',
                          'seat': 'boolean',
                          'table': 'boolean',
                          'kitchen': 'boolean'}),
               'terms': {'standardScaleThousandths': 'int',
                         'decorMille': 'int',
                         'priceScaleThousandths': 'int',
                         'interiorShareThousandths': 'int',
                         'shortPointsPerPercent': 'int',
                         'shortFootfallMaxPercent': 'int',
                         'overPointsPerPercent': 'int',
                         'overFootfallMaxPercent': 'int',
                         'bearsOverMaxThousandths': 'int',
                         'basketFullAt': 'int',
                         'basketMostPoorThousandths': 'int',
                         'basketMostRichThousandths': 'int',
                         'standardLeast': 'int',
                         'standardMost': 'int',
                         'graceDays': 'int',
                         'rampDays': 'int',
                         'repeatShareThousandths': 'int',
                         'repeatMost': 'int',
                         'targetLeast': 'int',
                         'targetFromSqm': 'int',
                         'targetSqmPerPoint': 'int',
                         'targetMost': 'int',
                         'varietyFrom': 'int',
                         'varietyMost': 'int',
                         'incomeLeast': 'int',
                         'incomeMost': 'int',
                         'footfallLeast': 'int',
                         'footfallMost': 'int',
                         'maxDecorMille': 'int',
                         'officeBoostMost': 'int',
                         'basketOfficeMost': 'int',
                         'basket': 'boolean',
                         'categoryIds': ('array', 'text'),
                         'itemPoints': ('array', 'int'),
                         'capShareThousandths': ('array', 'int')},
               'hypotheticalDecorCoverage': ('enum', 'catalogue-items')},
 'closures': {'rows': ('array',
                       {'address': {'street': 'text', 'number': 'uint'},
                        'source': 'text',
                        'fromDay': ('nullable', 'int'),
                        'untilDay': 'int',
                        'untilHour': 'int',
                        'end': ('enum', 'observed-hold'),
                        'mayRenew': 'boolean'}),
              'futureEvents': ('enum', 'risk-not-predicted'),
              'coverage': ('enum', 'owner-holds')},
 'bankTerms': {'model': ('enum', 'rlo-native-bank-terms-v1'),
               'quoteBasis': ('enum', 'captured-rating-and-settings'),
               'banks': ('array',
                         {'bankId': 'text',
                          'address': {'street': 'text', 'number': 'uint'},
                          'capCents': 'uint',
                          'annualRatePercent': 'decimal',
                          'termDays': 'int',
                          'debtBasis': ('enum', 'native-loans'),
                          'wealthBasis': ('enum', 'native-wealth-before-loans'),
                          'profitBasis': ('enum', 'native-statement-daily-income'),
                          'incomeTermShareThousandths': 'int',
                          'securedAccountRulesApply': 'boolean',
                          'securedCapTreatment': ('enum', 'included-in-effective-cap'),
                          'tutorialMinimumCents': 'uint',
                          'nativeDebtAtBankCents': 'uint'}),
               'additionalCreditIncluded': 'boolean',
               'principalIsExpense': 'boolean'},
 'outsideStatements': {'rows': ('array',
                                {'scope': ('enum', 'place', 'company'),
                                 'address': ('nullable', {'street': 'text', 'number': 'uint'}),
                                 'category': ('enum',
                                              'utilities.power',
                                              'utilities.water',
                                              'utilities.internet',
                                              'cover.premium',
                                              'cover.excess',
                                              'tax.accountant',
                                              'tax.penalty',
                                              'tax.rebate',
                                              'tax.backtax',
                                              'racket',
                                              'repair',
                                              'other'),
                                 'basis': ('enum', 'paid', 'accrued', 'owed'),
                                 'fromDay': 'int',
                                 'toDay': 'int',
                                 'cents': 'int'}),
                       'coverage': ('enum', 'partial', 'complete', 'unavailable'),
                       'knownOmittedCategories': ('array', 'text'),
                       'recurringDeductionLabels': ('array',
                                                    {'label': 'text',
                                                     'kind': ('enum', 'recurring', 'once')}),
                       'unclassifiedDeductionLabels': ('array', 'text'),
                       'balancesAreSeparate': 'boolean',
                       'taxEffectsOutsideNativeForecast': ('array', 'text')},
 'ownership': {'targets': ('array',
                           {'address': {'street': 'text', 'number': 'uint'},
                            'operations': {'schedule': {'schemaVersion': ('enum', 1),
                                                        'decision': ('enum',
                                                                     'allowed',
                                                                     'conditional',
                                                                     'refused',
                                                                     'unknown'),
                                                        'owner': 'text',
                                                        'task': 'text',
                                                        'reasons': ('array', 'text'),
                                                        'effects': ('array', 'text')},
                                           'hire': {'schemaVersion': ('enum', 1),
                                                    'decision': ('enum',
                                                                 'allowed',
                                                                 'conditional',
                                                                 'refused',
                                                                 'unknown'),
                                                    'owner': 'text',
                                                    'task': 'text',
                                                    'reasons': ('array', 'text'),
                                                    'effects': ('array', 'text')},
                                           'wholesale': {'schemaVersion': ('enum', 1),
                                                         'decision': ('enum',
                                                                      'allowed',
                                                                      'conditional',
                                                                      'refused',
                                                                      'unknown'),
                                                         'owner': 'text',
                                                         'task': 'text',
                                                         'reasons': ('array', 'text'),
                                                         'effects': ('array', 'text')},
                                           'rent': {'schemaVersion': ('enum', 1),
                                                    'decision': ('enum',
                                                                 'allowed',
                                                                 'conditional',
                                                                 'refused',
                                                                 'unknown'),
                                                    'owner': 'text',
                                                    'task': 'text',
                                                    'reasons': ('array', 'text'),
                                                    'effects': ('array', 'text')}}}),
               'authorization': ('enum', 'live-query-required'),
               'managersEnabled': 'boolean',
               'estateEnabled': 'boolean'}}

def _shape(value, shape):
    if isinstance(shape, dict):
        if not isinstance(value, dict):
            raise ValueError("Expected companion object")
        for key, child in shape.items():
            _shape(value[key], child)
    elif isinstance(shape, tuple):
        kind, *args = shape
        if kind == "nullable":
            if value is not None:
                _shape(value, args[0])
        elif kind == "enum":
            if not any(type(value) is type(item) and value == item for item in args):
                raise ValueError("Unsupported companion model or enum")
        elif kind == "array":
            if not isinstance(value, list) or len(value) > 10000:
                raise ValueError("Expected bounded companion array")
            for item in value:
                _shape(item, args[0])
    elif shape in ("int", "uint"):
        integer(value, -MAX_INT if shape == "int" else 0)
    elif shape == "boolean":
        boolean(value)
    elif shape == "text":
        text(value)
    elif shape == "decimal":
        if not isinstance(value, str) or len(value) > 64 or not _DECIMAL.fullmatch(value):
            raise ValueError("Invalid companion decimal")
        try:
            number = Decimal(value)
            binary = float(value)
        except (ValueError, OverflowError, InvalidOperation) as error:
            raise ValueError("Invalid companion decimal") from error
        if not number.is_finite() or not math.isfinite(binary) or number < 0 or number > MAX_INT or (number and not binary):
            raise ValueError("Unbounded companion decimal")
    elif shape == "null" and value is not None:
        raise ValueError("Expected companion null")


def _address(row):
    address = row["address"]
    integer(address["number"], 0, 1000000)
    return text(address["street"]), address["number"]


def _unique(data, field, *keys):
    if field in data:
        rows(data[field], lambda row: tuple(row[key] for key in keys))


def _identities(name, data):
    for field in ("sites", "targets"):
        if field in data:
            rows(data[field], _address)
    _unique(data, "items", "itemId")
    _unique(data, "districts", "districtId")
    _unique(data, "types", "typeId")
    _unique(data, "typeKinds", "typeId")
    _unique(data, "licences", "kind")
    if name == "utilities":
        rows(data["accounts"], lambda row: (*_address(row), row["service"]))
        rows(data["graceAddresses"], lambda row: (text(row["street"]), integer(row["number"], 0, 1000000)))
        _unique(data["internet"], "providers", "provider")
        for provider in data["internet"]["providers"]:
            _unique(provider, "plans", "plan")
        integer(data["terms"]["monthDays"], 1, 1000000)
        integer(data["terms"]["yearDays"], 1, 1000000)
    elif name == "company":
        _unique(data, "statementInclusion", "costKind")
        for site in data["sites"]:
            _unique(site, "raises", "employeeId")
            _unique(site, "cover", "kind")
            _unique(site, "licences", "kind")
            for policy in site["cover"]:
                _unique(policy, "quotes", "insurer")
    elif name == "education":
        _unique(data, "courses", "courseId")
        for course in data["courses"]:
            integer(course["courseId"], 0, 1000000)
            _unique(course, "quotes", "mode", "loan")
            for quote in course["quotes"]:
                integer(quote["mode"], 0, 2)
                _unique(quote, "installments", "index")
    elif name == "footfall":
        model = data["priceTolerance"]
        if model is not None:
            _unique(model, "items", "itemId")
            _unique(model, "districts", "districtId")
            _unique(model, "monopolies", "itemId", "districtId")
        for site in data["sites"]:
            if site["status"] == "ready" and any(site[key] is None for key in (
                    "ownPromotion", "writtenPromotion", "registrationPromotionAtCapture", "issuePercent",
                    "ambientPercent", "interiorPercent", "baseMultiplier")):
                raise ValueError("Ready footfall has missing captured fields")
    elif name == "bankTerms":
        _unique(data, "banks", "bankId")
        rows(data["banks"], _address)
    elif name == "interiors":
        for item in data["items"]:
            if item["category"] not in (*range(7), 255):
                raise ValueError("Unknown decor category")
    elif name == "outsideStatements":
        for row in data["rows"]:
            if (row["scope"] == "place") != (row["address"] is not None) or row["fromDay"] > row["toDay"]:
                raise ValueError("Invalid outside statement scope or window")


def validate(name, data):
    """Validate every known field and identity, preserving additive owner data."""
    _bounded(data)
    _shape(data, SHAPES[name])
    _identities(name, data)
    return data


VALIDATORS = {name: (lambda data, module=name: validate(module, data)) for name in SHAPES}
