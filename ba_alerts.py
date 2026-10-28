"""The findings: what the board tells the player to act on.

_alerts() reads the extraction's businesses, supply, trends, hype waves and
hour grids, and _finding() makes each finding: a level, a site, a group,
which is the finding kind, a sentence and a worth. _condense() then merges a
pile of one kind at one site into one counted line from SUMMARIES, and counts
a finding whose worth is under the materiality gate at the foot of the panel
instead of reading it out. ba_dashboard calls _alerts() once per build and
re-exports every name here.

The checklist for a new kind is "A finding kind" under Registries in
docs/architecture.md. What each kind means to the player is "What counts as a
finding" in docs/dashboard-reference.md.
"""

from __future__ import annotations

import collections
import hashlib

from ba_msg import WEEKDAYS, Msg, _half_away, msg, plain, tok

# --------------------------------------------------------------------- alerts
# What the number in a finding's "worth" is counted in, for the page to print
# under the amount. Only groups whose worth carries money get a unit; the rest
# are left empty because their worth is always None.
# Registry: "A finding kind" (docs/architecture.md, Registries). Every kind
# needs: its group, emitted by note() or _finding() in a helper _alerts() runs,
# such as _idle_notes() (or an AMENITY_DEMANDS row); its FINDING_KINDS record
# in template/board.js with id, label, note, on, link, route and evidence (or
# NO_EVIDENCE in tests/alert_kinds.test.cjs); ALERT_UNITS if its worth is money,
# else NOT_MONEY there; its line under "What counts as a finding" in
# docs/dashboard-reference.md. The checklist has the only-if fields.
ALERT_UNITS = {
    "notrading": msg("f.unit.rent", "/day rent"),
    "vacant": msg("f.unit.rent", "/day rent"),
    "loss": msg("f.unit.loss", "/day loss"),
    "hype": msg("f.unit.revenue", "/day revenue"),
    "trend": msg("f.unit.revenue", "/day revenue"),
    "atcap": msg("f.unit.trade", "/day trade"),
    "idlestaff": msg("f.unit.wages", "/day wages"),
    "dead": msg("f.unit.tied", "/day tied up"),
    "target": msg("f.unit.excess", "/day excess"),
    "rentprice": msg("f.unit.rent", "/day rent"),
}


def _amt(n, unit: str, *, of=None, sign: str = "", places: int = 0) -> dict:
    """The figure a finding with no money worth shows on the right, as data,
    so the page never reads it back out of the sentence: `n` (and `of`, for
    "84/168") in `unit`, one of the unit ids the page's amtUnit() words.
    `sign` is "$", "%" or "x". A number the sentence rounds is rounded the
    same way here, so the two always agree; `places` is how many decimals
    the sentence writes ("1.0 days"), sent as `dp` for the page to keep."""
    out = {"n": n, "unit": unit}
    if of is not None:
        out["of"] = of
    if sign:
        out["sign"] = sign
    if places:
        out["n"] = _shown(n, places)
        out["dp"] = places
    return out


def _shown(v, places: int = 0):
    """v as a finding's sentence writes it with `places` decimals
    (_half_away()), as a number: an int when it is whole."""
    r = _half_away(v, places)
    return int(r) if r == r.to_integral_value() else float(r)


def _msg_list(items: list):
    """Several names or phrases as one list, "a, b, c", that stays a message:
    a nested "{a}, {b}" per comma, the last pair under a key of its own
    (f.list.last), so a translation can join that one with its "and". One item
    is itself, none is ""."""
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return msg("f.list.last", "{a}, {b}", a=items[0], b=items[1])
    return msg("f.list", "{a}, {b}", a=items[0], b=_msg_list(items[1:]))


def _worked_over(d: dict):
    """Why an hours or days demand fails when the roster itself meets it: the
    week worked so far has passed its top. The whole row, or how many of it;
    None when it has not."""
    w = d.get("workedOver")
    if not w:
        return None
    if w["count"] == d["count"]:
        if w["unit"] == "days":
            return msg("f.jobdemand.over.days", "worked over {max} days this week", max=w["max"])
        return msg("f.jobdemand.over.hours", "worked over {max} hours this week", max=w["max"])
    if w["unit"] == "days":
        return msg("f.jobdemand.over.days.some", {"one": "{n} worked over {max} days this week",
                                                    "other": "{n} worked over {max} days this week"},
                   n=w["count"], max=w["max"])
    return msg("f.jobdemand.over.hours.some", {"one": "{n} worked over {max} hours this week",
                                                "other": "{n} worked over {max} hours this week"},
               n=w["count"], max=w["max"])


def _demand_priority(priority: int):
    """A job demand's priority as a finding says it, lowercased: the game's
    0 Nice to have, 1 Important, 2 Critical."""
    if priority == 2:
        return msg("f.jobdemand.critical", "critical")
    if priority == 1:
        return msg("f.jobdemand.important", "important")
    return msg("f.jobdemand.nice", "nice to have")


def _alert_id(*parts: str) -> str:
    """A stable id for a finding: the same finding keeps it across renders,
    and it does not depend on where the finding sits in the list."""
    return hashlib.sha1(":".join(parts).encode("utf-8")).hexdigest()[:10]


def _finding(
    level: str,
    site: str,
    group: str,
    text: str,
    *,
    key=None,
    rank: float = 0.0,
    subject: str = "",
    worth=None,
    always: bool = False,
    ev: dict | None = None,
    named: str | None = None,
    amt: dict | None = None,
) -> dict:
    """One row of the list.

    `key` is the business's site key (its address) when the finding is about
    one business; a synthetic site such as "3 shops" has none. The id hashes
    the key where there is one, so a renamed business keeps its silences and
    two shops that share a name never share a finding. The page navigates by
    the key too, so it never opens a namesake.

    `ev` is what the site panel needs to point at the row this finding is
    about, once `rank` and `subject` have been dropped by _condense(): the
    item's `slug`, or a machine's list position as `slot`. It is left off
    entirely where the panel has a fixed mark to pulse instead, because it
    travels in every payload.

    `subject` is English, since the id hashes it; `named` is how a summary
    line of several rows names it (_condense()), with its game names as tokens.

    `amt` is the figure a row with no money worth shows (_amt()), left off
    where the sentence has none.
    """
    return {
        "level": level,
        "site": site,
        "group": group,
        "text": text,
        "rank": rank,
        "subject": subject,
        "named": subject if named is None else named,
        "worth": worth,
        "unit": ALERT_UNITS.get(group, ""),
        "id": _alert_id(group, key or site, subject),
        "siteKey": key,
        "always": always,
        **({"ev": ev} if ev else {}),
        **({"amt": amt} if amt else {}),
    }


# Registry: "A finding kind" (docs/architecture.md, Registries). Every kind
# needs: its group, emitted by note() or _finding() in a helper _alerts() runs,
# such as _idle_notes() (or an AMENITY_DEMANDS row); its FINDING_KINDS record
# in template/board.js with id, label, note, on, link, route and evidence (or
# NO_EVIDENCE in tests/alert_kinds.test.cjs); ALERT_UNITS if its worth is money,
# else NOT_MONEY there; its line under "What counts as a finding" in
# docs/dashboard-reference.md. The checklist has the only-if fields.
def _alerts(
    businesses: list,
    supply: dict,
    chains: list,
    trends: list,
    hype: list,
    hours: list,
    grids: list,
    day: int,
    gate: float,
    mode: str | tuple = "cap",
    agencies: list = (),
    estate: dict | None = None,
) -> dict | list:
    """Only things worth acting on, with a number and a deadline where one exists.

    Two filters run over everything below. Findings that repeat across many
    products at one site collapse into a single counted line, and findings that
    carry a dollar figure have to clear the materiality gate — a fraction of a
    day's profit — or they are counted at the foot of the panel instead of read
    out. A site that cannot trade at all is never counted away.

    ``mode`` sizes factory lines on capacity ("cap") or on demand ("dem"). Only
    the supply helpers read it, so a tuple of modes builds every other finding
    once and returns one result per mode, in order (extract() asks for both).
    """
    # Real estate first (_estate_owned()): the company-wide rent line leads the
    # opportunities and, on tax eve, the buildings to buy lead the warnings.
    found = _estate_notes(estate)
    trading, silent = _not_trading_notes(businesses, supply, day)
    found += trading
    found += _site_notes(businesses, silent)
    found += _job_demand_notes(businesses)
    found += _company_demand_notes(businesses)
    found += _promotion_notes(businesses, silent, agencies)
    found += _hype_notes(hype, grids)
    found += _trend_notes(businesses, trends, hype, day)

    # The supply findings that depend on the mode go in between these and the
    # hour grid's below (by_mode()).
    head = found
    middle = _atcap_notes(hours, silent) + _idlestaff_notes(hours, silent)
    factories = supply.get("factories", {})
    if supply.get("streetFoodRestricted"):
        factories = dict(factories, sites=[site for site in factories.get("sites", [])
                                         if not site.get("streetFoodRestricted")])

    def by_mode(mode: str) -> dict:
        # _condense() pops fields off the rows it is given, so each mode gets
        # its own copies of the shared findings.
        rows = [dict(f) for f in head]
        # A shop only runs dry if a day of selling outruns the morning top-up.
        rows.extend(_shelf_notes(businesses, supply, silent, mode))
        # A depot only runs dry if it cannot reach the next delivery by more than a
        # few hours, and an order is only wrong if it cannot cover the week it has to
        # cover.
        rows.extend(_import_notes(businesses, supply, silent, mode))
        rows.extend(dict(f) for f in middle)
        rows.extend(_idle_notes(businesses, supply["idle"], silent, mode))
        rows.extend(_feed_notes(businesses, factories, silent, mode))
        rows.extend(_staff_notes(businesses, factories, silent, mode))
        rows.extend(_unnamed_notes(businesses, factories, silent))
        return _condense(rows, gate)

    if isinstance(mode, str):
        return by_mode(mode)
    return [by_mode(m) for m in mode]


def _notes() -> tuple:
    """A list of findings, and the note() that adds one to it: _finding() with
    note()'s defaults, which also takes `rank` and `subject` by position."""
    found = []

    def note(level, site, group, text, rank=0.0, subject="", worth=None, always=False,
             key=None, ev=None, named=None, amt=None):
        found.append(
            _finding(level, site, group, text, key=key, rank=rank, subject=subject,
                     worth=worth, always=always, ev=ev, named=named, amt=amt)
        )

    return found, note


def _not_trading_notes(businesses: list, supply: dict, day: int) -> tuple:
    """Each site that opened in the last NEW_SITE_DAYS and has not traded yet,
    as one finding, and the set of their keys: the findings after this one
    leave a silent site out. Writes the checks it failed on the business, as
    `notTrading`, for the site panel."""
    found, note = _notes()
    # A delivery plan: a route or an import into the site, or a repeating
    # wholesale contract to it.
    planned = {link["to"] for link in supply["graph"]["links"]}
    planned |= {businesses[s]["key"] for s in supply.get("wholesaleShops", ())
                if 0 <= s < len(businesses)}

    # --- a site that has not started trading is one finding, not four
    silent = set()
    for b in businesses:
        # Only a shop or an office can fail to trade. A warehouse, factory or
        # head office never books a sale, so silence there is its normal state.
        if b["status"] not in ("retail", "office") or b["revenue"] or day - b["opened"] > NEW_SITE_DAYS:
            continue
        office = b["status"] == "office"
        silent.add(b["key"])
        priced = [l for l in b["lines"] if l["price"] > 0]
        # A ticket is issued, never shelved, so only the other lines need stock.
        shelved = [l for l in priced if not l.get("issued")]
        stocked = [l for l in shelved if l["units"] > 0]
        # Which of the six pre-flight checks fail is the finding, so the slugs
        # are kept on the business beside the words: the site panel reads the
        # same list and the two cannot drift apart. An office sells hours, not
        # goods, so it has nothing to stock or deliver. A site shut with the
        # game's temporarily-closed switch books no day however ready it is,
        # so that reason comes first.
        failed, reasons = [], []
        if b.get("closed"):
            failed.append("closed")
            reasons.append(msg("f.notrading.closed", "temporarily closed"))
        if b["staff"] == 0:
            failed.append("staff")
            reasons.append(msg("f.notrading.staff", "no staff"))
        if not priced:
            failed.append("prices")
            reasons.append(msg("f.notrading.prices", "no prices set"))
        elif not office and shelved and not stocked:
            failed.append("stock")
            reasons.append(msg("f.notrading.stock", "no stock"))
        elif not office and len(stocked) * 2 < len(shelved):
            failed.append("shelves")
            reasons.append(msg("f.notrading.shelves", "{n} of {of} shelves bare",
                               n=len(shelved) - len(stocked), of=len(shelved)))
        if not office and (shelved or not priced) and b["key"] not in planned:
            failed.append("plan")
            reasons.append(msg("f.notrading.plan", "no delivery plan"))
        b["notTrading"] = failed
        if not reasons:
            reasons.append(
                msg("f.notrading.ready.office", "staffed and priced, no trading day booked yet")
                if office or not shelved else
                msg("f.notrading.ready", "staffed and stocked, no trading day booked yet")
            )
        note(
            "critical",
            b["name"],
            "notrading",
            msg("f.notrading", "{site} opened day {day}, not trading yet: {reasons}, ${rent:,.0f}/day rent",
                site=b["name"], day=b["opened"], reasons=_msg_list(reasons), rent=b["rent"]),
            worth=b["rent"],
            always=True,
            key=b["key"],
        )
    return found, silent


def _site_notes(businesses: list, silent: set) -> list:
    """The vacant leases as one line, and each trading site's own findings: a
    loss, no staff, low satisfaction, uniforms and missing amenities."""
    found, note = _notes()
    vacant = [b for b in businesses if b["status"] == "vacant"]
    if vacant:
        rent = sum(b["rent"] for b in vacant)
        note(
            "warn",
            msg("f.site.leases", {"one": "{n} lease", "other": "{n} leases"}, n=len(vacant)),
            "vacant",
            msg("f.vacant", {"one": "{n} vacant lease costing ${rent:,.0f}/day in rent",
                             "other": "{n} vacant leases costing ${rent:,.0f}/day in rent"}, n=len(vacant), rent=rent),
            worth=rent,
        )

    for b in businesses:
        if b["status"] == "vacant" or b["key"] in silent:
            continue
        if b["profit"] < 0 and not b["costCentre"]:
            note(
                "critical" if b["profit"] < -1000 else "warn",
                b["name"],
                "loss",
                msg("f.loss", "Lost {w:$} yesterday", w=abs(b["profit"])),
                worth=abs(b["profit"]),
                key=b["key"],
            )
        if b["status"] in ("retail", "office") and b["staff"] == 0:
            note("critical", b["name"], "staff", msg("f.staff.none", "No staff assigned"), always=True, key=b["key"])
        sat = b["satisfaction"]["overall"]
        if sat is not None and b["customers"] and sat < 80:
            note("warn", b["name"], "satisfaction", msg("f.satisfaction", "Customer satisfaction at {n}%", n=sat),
                 key=b["key"], amt=_amt(sat, "satisfied", sign="%"))
        if b.get("missingUniformLocker"):
            # Installing the locker is the first action to take, so it stands in
            # for whichever roles are uncovered behind it.
            note(
                "warn", b["name"], "uniform",
                msg("f.uniform.locker", "No uniform locker installed; add one to manage employee uniforms"),
                always=True, key=b["key"],
            )
        elif b.get("uniformGaps"):
            skills = b.get("uniformGapSkills") or []
            roles = _msg_list([tok(skills[i] if i < len(skills) else None, role)
                               for i, role in enumerate(b["uniformGaps"])])
            note(
                "warn", b["name"], "uniform",
                msg("f.uniform.gaps", "No uniform set for {roles}; customers judge every role "
                    "staffed at a station here", roles=roles),
                always=True, key=b["key"],
            )
        for slug in b["missingAmenities"]:
            group, text = AMENITY_DEMANDS[slug]
            note("warn", b["name"], group, text, always=True, key=b["key"])
    return found


def _job_demand_notes(businesses: list) -> list:
    """The staff demands each site could meet itself and does not, one line
    per site."""
    found, note = _notes()
    # --- what staff ask for and do not get. A site that has not started trading
    # still has staff whose satisfaction is moving, so it is not folded away here.
    for b in businesses:
        if b["status"] == "vacant":
            continue
        demands = b.get("staffDemands", [])
        wants = [d for d in demands if not d["company"]]
        quitting = b.get("quitWarnings", 0)
        # Every demand the site itself can meet, with the game's priority, headed
        # by how many people lack one. Once somebody with an unmet demand has
        # warned they will quit, the line is louder and names everything unmet
        # here, the company-wide demands too, since those may be all they lack.
        if quitting and demands:
            count, shown = b.get("staffLackingAny", 0), demands
        elif wants:
            count, shown = b.get("staffLacking", 0), wants
        else:
            continue
        items = []
        for d in shown:
            why = (msg("f.jobdemand.company", "company-wide") if d["company"]
                   else _demand_priority(d["priority"]))
            over = _worked_over(d)
            if over:
                why = msg("f.jobdemand.why", "{priority}, {over}", priority=why, over=over)
            items.append(msg("f.jobdemand.item", "{demand} for {n} ({why})",
                             demand=tok(d.get("slug"), d["demand"]), n=d["count"], why=why))
        if quitting:
            text = msg("f.jobdemand.quit", {
                "one": "{count} staff with unmet demands: {demands}; {n} of them has warned they will quit",
                "other": "{count} staff with unmet demands: {demands}; {n} of them have warned they will quit",
            }, count=count, demands=_msg_list(items), n=quitting)
        else:
            text = msg("f.jobdemand", {"one": "{n} staff member with unmet demands: {demands}",
                                       "other": "{n} staff with unmet demands: {demands}"},
                       n=count, demands=_msg_list(items))
        note(
            "critical" if quitting else "warn", b["name"], "jobdemand", text,
            always=True, key=b["key"], amt=_amt(count, "staff"),
        )
    return found


def _company_demand_notes(businesses: list) -> list:
    """The staff demands only the company can meet, one line for all sites."""
    found, note = _notes()
    # --- the staff demands no single site can settle: health insurance comes
    # through an HR manager's plan, a happy boss is the owner's own happiness.
    company, lacking = collections.OrderedDict(), 0
    for b in businesses:
        if b["status"] == "vacant":
            continue
        lacking += b.get("staffLackingCompany", 0)
        for d in b.get("staffDemands", []):
            if d["company"]:
                row = company.setdefault(d["slug"], dict(d, count=0))
                row["count"] += d["count"]
    if company:
        rows = sorted(company.values(), key=lambda d: (-d["priority"], -d["count"], d["demand"]))
        insured = any(JOB_DEMANDS[d["slug"]][0] == "insurance" for d in rows)
        demands = _msg_list([msg("f.companydemand.item", "{demand} for {n}",
                                 demand=tok(d.get("slug"), d["demand"]), n=d["count"]) for d in rows])
        note(
            "warn", msg("f.site.company", "Company"), "companydemand",
            msg("f.companydemand.insurance", {
                "one": "{n} staff member with unmet demands: {demands}. Health insurance comes through "
                       "an HR manager's plan",
                "other": "{n} staff with unmet demands: {demands}. Health insurance comes through "
                         "an HR manager's plan"}, n=lacking, demands=demands)
            if insured else
            msg("f.companydemand", {"one": "{n} staff member with unmet demands: {demands}",
                                    "other": "{n} staff with unmet demands: {demands}"},
                n=lacking, demands=demands),
            always=True, amt=_amt(lacking, "staff"),
        )
    return found


def _promotion_notes(businesses: list, silent: set, agencies) -> list:
    """The campaign mixes that would raise a site's promotion or save money,
    and the agency visits a plan waits on."""
    found, note = _notes()
    # --- the promotion cap, which is reached with campaigns or not at all
    # Promotion is the foot traffic the address comes with plus whatever the
    # marketing campaigns add, held at 100. Each shop's and office's plan
    # (_marketing()) is the cheapest mix that brings it to 100, or marketing
    # to 100 where 100 is out of reach. The sites whose plan differs from what
    # they run make up to two lines: those it raises (a warning when one gains
    # PROMOTION_GAP points or more), and those that pay for campaigns that only
    # push past the target. A plan that only adds missing switches changes
    # neither cost nor promotion and is no finding. A site short of 100 whose
    # plan waits on a first visit to an agency gets a line naming it: one with
    # no plan at all (no switch, no agency known), and one already on the best
    # mix its known agencies allow that a visit would raise (a visit that would
    # only save money is the site panel's hint alone). Each line has its own
    # subject, so its id is its own. The sites not trading yet are the
    # not-trading line's.
    raised, saved, unplanned, capped = [], [], [], []
    gain = lambda b: b["marketingPlan"]["promotionPlan"] - b["marketingPlan"]["promotionNow"]  # noqa: E731
    for b in businesses:
        p = b.get("marketingPlan")
        if b["status"] not in ("retail", "office") or b["key"] in silent or not p:
            continue
        if p["on"] is None:
            if p["visit"] and p["promotionNow"] < PROMOTION_CAP:
                unplanned.append(b)
        elif set(p["on"]) != set(p["was"]):
            # A site whose plan costs more is raising its promotion, even where
            # the promotion the save stores already reads higher than the model's.
            (raised if gain(b) > 0 or p["costPlan"] > p["costNow"] else saved).append(b)
        elif p.get("visitRaises") and p["promotionPlan"] < PROMOTION_CAP and p["promotionNow"] < PROMOTION_CAP:
            capped.append(b)
    sites_of = lambda group: msg("f.site.sites", {"one": "{n} site", "other": "{n} sites"}, n=len(group))  # noqa: E731
    if raised:
        raised.sort(key=lambda b: (-gain(b), b["name"]))
        extra = sum(b["marketingPlan"]["costPlan"] - b["marketingPlan"]["costNow"] for b in raised)
        n, site, top = len(raised), raised[0]["name"], raised[0]["marketingPlan"]["promotionPlan"]

        def item(b):
            p = b["marketingPlan"]
            if gain(b) > 0:
                return msg("f.promotion.item.gain", "{site} {a}% → {b}%", site=b["name"],
                           a=p["promotionNow"], b=p["promotionPlan"])
            return msg("f.promotion.item.save", "{site} {a:$} → {b:$}/day", site=b["name"],
                       a=p["costNow"], b=p["costPlan"])
        sites = _msg_list([item(b) for b in raised])
        if n == 1:
            text = (msg("f.promotion.reach.less.one", "{site} can reach {p}% promotion for less", site=site, p=top)
                    if extra < 0 else
                    msg("f.promotion.reach.more.one", "{site} can reach {p}% promotion for {w:$}/day more",
                        site=site, p=top, w=extra)
                    if extra > 0 else
                    msg("f.promotion.reach.one", "{site} can reach {p}% promotion", site=site, p=top))
        elif all(b["marketingPlan"]["promotionPlan"] >= PROMOTION_CAP for b in raised):
            text = (msg("f.promotion.reach.less.many", "{n} sites can reach 100% promotion for less: {sites}",
                        n=n, sites=sites)
                    if extra < 0 else
                    msg("f.promotion.reach.more.many",
                        "{n} sites can reach 100% promotion for {w:$}/day more: {sites}", n=n, w=extra, sites=sites)
                    if extra > 0 else
                    msg("f.promotion.reach.many", "{n} sites can reach 100% promotion: {sites}", n=n, sites=sites))
        else:
            text = (msg("f.promotion.gain.less.many", "{n} sites can gain promotion for less: {sites}",
                        n=n, sites=sites)
                    if extra < 0 else
                    msg("f.promotion.gain.more.many", "{n} sites can gain promotion for {w:$}/day more: {sites}",
                        n=n, w=extra, sites=sites)
                    if extra > 0 else
                    msg("f.promotion.gain.many", "{n} sites can gain promotion: {sites}", n=n, sites=sites))
        note(
            "warn" if any(gain(b) >= PROMOTION_GAP for b in raised) else "info",
            site if n == 1 else sites_of(raised), "promotion", text, rank=-max(gain(b) for b in raised),
            subject="mix-raise", always=True, key=raised[0]["key"] if n == 1 else None,
            amt=_amt(top, "promotion", sign="%"),
        )
    if saved:
        saved.sort(key=lambda b: (b["marketingPlan"]["costPlan"] - b["marketingPlan"]["costNow"], b["name"]))
        w = sum(b["marketingPlan"]["costNow"] - b["marketingPlan"]["costPlan"] for b in saved)
        if len(saved) == 1:
            text = msg("f.promotion.save.one", "{site} can save {w:$}/day at the same promotion",
                       site=saved[0]["name"], w=w)
        else:
            text = msg("f.promotion.save.many", "{n} sites can save {w:$}/day at the same promotion: {sites}",
                       n=len(saved), w=w, sites=_msg_list([
                           msg("f.promotion.item.save", "{site} {a:$} → {b:$}/day", site=b["name"],
                               a=b["marketingPlan"]["costNow"], b=b["marketingPlan"]["costPlan"])
                           for b in saved]))
        note(
            "info", saved[0]["name"] if len(saved) == 1 else sites_of(saved), "promotion", text,
            subject="mix-save", always=True, key=saved[0]["key"] if len(saved) == 1 else None,
            amt=_amt(_shown(w), "/day", sign="$"),
        )
    by_key = {a["key"]: a["name"] for a in agencies}
    agencies_of = lambda group: _msg_list([by_key.get(k) or k for k in  # noqa: E731
                                           sorted({k for b in group for k in b["marketingPlan"]["visit"]})])
    if unplanned:
        one = len(unplanned) == 1
        note(
            "info", unplanned[0]["name"] if one else sites_of(unplanned), "promotion",
            msg("f.promotion.visit", "Visit {agencies} once: no campaign can be set at {sites} before that",
                agencies=agencies_of(unplanned), sites=_msg_list([b["name"] for b in unplanned])),
            subject="visit-first", always=True, key=unplanned[0]["key"] if one else None,
        )
    if capped:
        one = len(capped) == 1
        note(
            "info", capped[0]["name"] if one else sites_of(capped), "promotion",
            msg("f.promotion.visit.more", "Visit {agencies} once to raise promotion at {sites}",
                agencies=agencies_of(capped), sites=_msg_list([b["name"] for b in capped])),
            subject="visit-more", always=True, key=capped[0]["key"] if one else None,
        )
    return found


def _hype_notes(hype: list, grids: list) -> list:
    """One line per shop a hype wave carries: the revenue that rides on it."""
    found, note = _notes()
    # --- what a hype wave is carrying, and what the day it ends costs
    grid_of = {g["key"]: g for g in grids}

    def full_hours(key: str) -> int:
        """Hours of a normal week this shop spends within 10% of its ceiling."""
        grid = grid_of.get(key)
        if not grid:
            return 0
        return sum(
            1
            for wd in range(7)
            if not grid["thin"][wd]
            for hour in range(24)
            if grid["customers"][wd][hour] is not None
            and grid["effective"][wd][hour]
            and grid["customers"][wd][hour] >= grid["effective"][wd][hour] * HYPE_TIGHT
        )

    # A shop's takings under hype are one number however many waves carry them,
    # so the waves are gathered by the shop they land hardest on and each shop
    # gets one line. The waves come soonest-ending first, which the line keeps.
    by_top = {}
    for wave in hype:
        top = max(wave["sites"], key=lambda s: s["revenue"])
        by_top.setdefault(top["key"], (top, []))[1].append(wave)

    for top, waves in by_top.values():
        waves.sort(key=lambda w: w["daysLeft"])
        soonest = waves[0]["daysLeft"]
        if len(waves) == 1:
            left, n = waves[0]["daysLeft"], waves[0]["count"]
            if left <= 0:
                lines = msg("f.hype.lines.today", {"one": "{n} line ends today", "other": "{n} lines ends today"}, n=n)
            elif left == 1:
                lines = msg("f.hype.lines.tomorrow", {"one": "{n} line ends tomorrow", "other": "{n} lines ends tomorrow"}, n=n)
            else:
                lines = msg("f.hype.lines.left", {"one": "{n} line has {days} days left", "other": "{n} lines has {days} days left"},
                            n=n, days=left)
        else:
            parts = []
            for i, wave in enumerate(waves):
                left, n = wave["daysLeft"], wave["count"]
                if left <= 0:
                    parts.append(msg("f.hype.part.today", {"one": "{n} ends today",
                                                           "other": "{n} end today"}, n=n))
                elif left == 1:
                    parts.append(msg("f.hype.part.tomorrow", {"one": "{n} ends tomorrow",
                                                              "other": "{n} end tomorrow"}, n=n))
                elif i == 0:
                    parts.append(msg("f.hype.part.first", {"one": "{n} ends in {days} days",
                                                           "other": "{n} end in {days} days"}, n=n, days=left))
                else:
                    parts.append(msg("f.hype.part.later", {"one": "{n} in {days} days",
                                                           "other": "{n} in {days} days"}, n=n, days=left))
            lines = msg("f.hype.lines.waves", "{n} lines ({waves})",
                        n=sum(w["count"] for w in waves), waves=_msg_list(parts))
        one = len(waves) == 1
        hood = tok(waves[0]["hood"], hood_label(waves[0]["hood"]))
        # Pricing is somebody else's job in this company. When a wave lands on a
        # shop that is already full, the door turns part of it away — until the
        # wave's end date.
        full = full_hours(top["key"])
        # The baseline is the first wave's: the shop's own days before a later
        # wave already carry the earlier one.
        base = min(waves, key=lambda w: w["startDay"])["baseline"]
        if base:
            drop = max(top["revenue"] - base["revenue"], 0)
            said = dict(hood=hood, lines=lines, site=top["name"], revenue=top["revenue"],
                        base=base["revenue"], basis=base["basis"], drop=drop)
            if full and one:
                text = msg("f.hype.wave.full", {
                    "one": "{hood} hype on {lines}; {site} does ${revenue:,.0f}/day under it against ${base:,.0f} for "
                           "{basis}; about ${drop:,.0f}/day of revenue rides on the wave. It already runs within 10% "
                           "of capacity for {n} hour of a normal week, so the door is turning part of the wave "
                           "away.",
                    "other": "{hood} hype on {lines}; {site} does ${revenue:,.0f}/day under it against ${base:,.0f} for "
                             "{basis}; about ${drop:,.0f}/day of revenue rides on the wave. It already runs within "
                             "10% of capacity for {n} hours of a normal week, so the door is turning part of the "
                             "wave away.",
                }, n=full, **said)
            elif full:
                text = msg("f.hype.waves.full", {
                    "one": "{hood} hype on {lines}; {site} does ${revenue:,.0f}/day under it against ${base:,.0f} for "
                           "{basis}; about ${drop:,.0f}/day of revenue rides on the waves. It already runs within "
                           "10% of capacity for {n} hour of a normal week, so the door is turning part of the "
                           "waves away.",
                    "other": "{hood} hype on {lines}; {site} does ${revenue:,.0f}/day under it against ${base:,.0f} for "
                             "{basis}; about ${drop:,.0f}/day of revenue rides on the waves. It already runs within "
                             "10% of capacity for {n} hours of a normal week, so the door is turning part of the "
                             "waves away.",
                }, n=full, **said)
            elif one:
                text = msg("f.hype.wave", "{hood} hype on {lines}; {site} does ${revenue:,.0f}/day under it against "
                           "${base:,.0f} for {basis}; about ${drop:,.0f}/day of revenue rides on the wave.", **said)
            else:
                text = msg("f.hype.waves", "{hood} hype on {lines}; {site} does ${revenue:,.0f}/day under it against "
                           "${base:,.0f} for {basis}; about ${drop:,.0f}/day of revenue rides on the waves.", **said)
            note(
                "critical" if soonest <= 2 else "warn",
                top["name"],
                "hype",
                text,
                worth=drop,
                key=top["key"],
            )
        else:
            said = dict(hood=hood, lines=lines, site=top["name"], revenue=top["revenue"])
            note(
                "warn",
                top["name"],
                "hype",
                msg("f.hype.nobase", "{hood} hype on {lines}; {site} does ${revenue:,.0f}/day under it. There is no "
                    "shop of the same kind trading without a wave and no trading days before this one started, "
                    "so there is no baseline to say what the drop will be", **said)
                if one else
                msg("f.hype.nobase.waves", "{hood} hype on {lines}; {site} does ${revenue:,.0f}/day under it. There "
                    "is no shop of the same kind trading without a wave and no trading days before the first of "
                    "them started, so there is no baseline to say what the drop will be", **said),
                always=True,
                key=top["key"],
                amt=_amt(_shown(top["revenue"]), "/day under hype", sign="$"),
            )
    return found


def _trend_notes(businesses: list, trends: list, hype: list, day: int) -> list:
    """The shops and offices whose revenue moved TREND_MOVE or more week on week."""
    found, note = _notes()
    # --- a site whose week moved, against the week before it
    riding = {w["top"] for w in hype}
    for row in trends:
        if not row["ready"] or row["change"] is None:
            continue
        if abs(row["change"]) < TREND_MOVE:
            continue
        b = businesses[row["s"]]
        # A factory's takings are batch exports on the purchase calendar, not
        # trading; and a shop up under its own hype wave is the line above this
        # one said twice. An office's fees are trading like a shop's takings.
        if b["status"] not in ("retail", "office"):
            continue
        if row["change"] > 0 and b["key"] in riding:
            continue
        said = dict(pct=abs(row["change"]) * 100, now=row["last7"], start=day - 7, end=day - 1,
                    before=row["prev7"])
        note(
            "warn" if row["change"] < 0 else "info",
            b["name"],
            "trend",
            msg("f.trend.up", "Revenue up {pct:.0f}% week on week: ${now:,.0f} over days {start}-{end} against "
                "${before:,.0f} the week before", **said)
            if row["change"] > 0 else
            msg("f.trend.down", "Revenue down {pct:.0f}% week on week: ${now:,.0f} over days {start}-{end} against "
                "${before:,.0f} the week before", **said),
            worth=abs(row["last7"] - row["prev7"]) / 7,
            key=b["key"],
        )
    return found


def _atcap_notes(hours: list, silent: set) -> list:
    """The hours a site's stations or staff hold it at their limit, one line
    for the sites that share the limit and its fix."""
    found, note = _notes()
    # --- what the hour-by-hour grid says that a daily total cannot
    # Five shops hitting the same 30/h ceiling in the same hours is one finding
    # about five shops, not five findings. Offices group only with offices, and
    # a role's stations only with the same stations: two findings that name two
    # different answers are two lines, whatever else they share. A site held by
    # its building's own capacity is no line at all: there is nothing to do
    # about it, so it stays on the site page's hour grid and chip only.
    same = collections.OrderedDict()
    for finding in hours:
        if (
            finding["kind"] == "cap"
            and finding["key"] not in silent
            and finding["heldBy"][0][0] != "door"
        ):
            same.setdefault(
                (
                    finding.get("office", False),
                    finding["limit"],
                    finding["cap"],
                    finding.get("capTop", finding["cap"]),
                    finding["when"],
                    finding["hours"],
                    finding.get("noun"),
                    finding.get("fix"),
                ),
                [],
            ).append(finding)
    for (office, limit, cap, top, when, per_week, _noun, _fix), group in same.items():
        worth = sum(f["throughput"] for f in group)
        where = (
            group[0]["site"]
            if len(group) == 1
            else msg("f.site.offices", {"one": "{n} office", "other": "{n} offices"}, n=len(group))
            if office
            else msg("f.site.shops", {"one": "{n} shop", "other": "{n} shops"}, n=len(group))
        )
        said = dict(
            where=where, when=when, n=per_week, worth=worth, fix=group[0]["fix"],
            rate=msg("f.atcap.rate", "{n}/h", n=cap) if cap == top
            else msg("f.atcap.range", "{low}-{high}/h", low=cap, high=top),
            noun=group[0].get("noun") or _sp_counters(office),
            # Only the first character: a tie joins two limits, and
            # str.capitalize() would lowercase "DJ booths" in the second.
            # _cap_first() does that and keeps the limit a message.
            limit=_cap_first(limit),
        )
        several = group[0].get("limits", 1) > 1
        if len(group) == 1:
            text = (
                msg("f.atcap.limits", {
                    "one": "{where} fills the {noun} {when}, {n} hour a week at {rate} and "
                           "${worth:,.0f}/day of sales in those hours. {limit} are the limit; the fix is {fix}",
                    "other": "{where} fills the {noun} {when}, {n} hours a week at {rate} and "
                             "${worth:,.0f}/day of sales in those hours. {limit} are the limit; the fix is {fix}"}, **said)
                if several else
                msg("f.atcap", {
                    "one": "{where} fills the {noun} {when}, {n} hour a week at {rate} and "
                           "${worth:,.0f}/day of sales in those hours. {limit} is the limit; the fix is {fix}",
                    "other": "{where} fills the {noun} {when}, {n} hours a week at {rate} and "
                             "${worth:,.0f}/day of sales in those hours. {limit} is the limit; the fix is {fix}"}, **said)
            )
        else:
            sites = _msg_list([f["site"] for f in group])
            text = (
                msg("f.atcap.sites.limits", {
                    "one": "{where} fill the {noun} {when}, {n} hour a week at {rate} and "
                           "${worth:,.0f}/day of sales in those hours. {limit} are the limit; the fix is {fix}: {sites}",
                    "other": "{where} fill the {noun} {when}, {n} hours a week at {rate} and "
                             "${worth:,.0f}/day of sales in those hours. {limit} are the limit; the fix is {fix}: {sites}"}, sites=sites, **said)
                if several else
                msg("f.atcap.sites", {
                    "one": "{where} fill the {noun} {when}, {n} hour a week at {rate} and "
                           "${worth:,.0f}/day of sales in those hours. {limit} is the limit; the fix is {fix}: {sites}",
                    "other": "{where} fill the {noun} {when}, {n} hours a week at {rate} and "
                             "${worth:,.0f}/day of sales in those hours. {limit} is the limit; the fix is {fix}: {sites}"}, sites=sites, **said)
            )
        # One site can be at more than one ceiling, and the limit is what keeps
        # the ids apart: a role short of people says "Gym Trainer staffing" and
        # the same role short of posts says "fitness planning boards", so
        # silencing one line never silences the other. The limit alone is
        # hashed, and it is the string main hashed too, so a shop's and an
        # office's silences survive this change.
        note(
            "warn", where, "atcap", text, subject=plain(limit), named=limit, worth=worth,
            key=group[0]["key"] if len(group) == 1 else None,
        )
    return found


def _idlestaff_notes(hours: list, silent: set) -> list:
    """The staffed hours a site's customers do not need, one line per site."""
    found, note = _notes()
    # --- overstaffing: one line per site, the whole week of it. The hour grid
    # keeps every idle run of the site's roles under "week"; a finding written
    # before that existed carries its one run and is read as a week of one.
    for finding in hours:
        if finding["key"] in silent or finding["kind"] != "idle":
            continue
        site = finding["site"]
        default = _sp_counters(finding.get("office", False))
        week = finding.get("week") or {
            "spare": finding["spare"],
            "worth": finding["worth"],
            "seen": finding["seen"],
            "parts": [{
                "noun": finding.get("noun"),
                "staff": finding["staff"],
                "when": _hour_phrase({WEEKDAYS.index(finding["day"]): set(
                    range(finding["from"], finding["to"]))}),
            }],
        }
        runs = _idle_parts(week["parts"], default)
        note(
            "info",
            site,
            "idlestaff",
            # The waste leads, so the row's headline is the whole week's figure
            # and the shape of the hours unfolds as its detail.
            msg("f.idlestaff", {
                "one": "{site} has {n} staffed hour a week more than its customers need: {runs}, at {seen} customers an hour",
                "other": "{site} has {n} staffed hours a week more than its customers need: {runs}, at {seen} customers an hour",
            }, site=site, n=week["spare"], runs=runs, seen=week["seen"]),
            worth=week["worth"],
            key=finding["key"],
        )
    return found


def _fact_labels(businesses: list, supply: dict) -> dict:
    """(site index, slug) -> the name a finding gives the goods: the site's own
    line, else what an import row or a factory line calls it."""
    labels, by_slug = {}, {}
    for i, b in enumerate(businesses):
        for line in b.get("lines", []):
            labels.setdefault((i, line["slug"]), line["item"])
            by_slug.setdefault(line["slug"], line["item"])
    for row in supply.get("imports", []):
        labels.setdefault((row["s"], row["slug"]), row["item"])
    for site in supply.get("factories", {}).get("sites", []):
        for row in site["needs"]:
            labels.setdefault((site["s"], row["slug"]), row["item"])
            if row.get("importSite") is not None:
                labels.setdefault((row["importSite"], row["slug"]), row["item"])
    # A site the plans ask for goods it has never held: another site's name for them.
    for s, items in supply.get("facts", {}).items():
        for slug in items:
            if slug in by_slug:
                labels.setdefault((int(s), slug), by_slug[slug])
    return labels


def _shelf_notes(businesses: list, supply: dict, silent: set, mode: str = "cap") -> list:
    """A shelf on no plan with little left, or a top-up its busiest day outruns.

    Read off the shelf's fact. A tight top-up (covers the day, not the margin)
    is for the Checks and Orders pages, never a finding here; a shelf the Not
    routed finding names (`via`) is said there, once.
    """
    facts = supply.get("facts", {})
    rows = {(r["s"], r["slug"]): r for r in supply.get("shops", [])}
    labels = _fact_labels(businesses, supply)
    notes = []
    for s_key in _in_order(facts):
        s = int(s_key)
        b = businesses[s]
        # A shop shut with the game's temporarily closed switch sells nothing:
        # its shelves are no finding (the not-trading finding names it).
        if b["key"] in silent or b.get("closed"):
            continue
        # Nothing upstream supplies it (_supply_facts' shelf()): one finding
        # per shop, however many of its goods it is (a shop pricing a dozen
        # things nothing brings is one thing to sort out).
        unsourced = []
        for slug in _in_order(facts[s_key]):
            fact = _supply_fact(facts, s, slug, mode)
            if (fact["role"] == "shelf" and fact["st"] == "noplan"
                    and fact["why"] in ("source", "priced") and fact["lvl"] != "info"):
                unsourced.append((slug, fact))
        if unsourced:
            notes.append(_unsourced_note(businesses, b, s, unsourced, labels))
        for slug in _in_order(facts[s_key]):
            fact = _supply_fact(facts, s, slug, mode)
            if fact["role"] != "shelf":
                continue
            if fact["st"] == "noplan" and fact["why"] in ("source", "priced"):
                continue
            line = next((l for l in b["lines"] if l["slug"] == slug), None)
            if not line:
                continue
            item = tok(slug, line["item"])
            if (fact["st"] == "noplan" and fact["lvl"] in ("warn", "critical")
                    and fact.get("via") is None):
                rate = round(line.get("tradeRate", line["rate"]))
                notes.append(_finding(
                    fact["lvl"], b["name"], "unplanned",
                    msg("f.unplanned", "{item} is on no distribution plan: {units:,} left at {rate:,}/day",
                        item=item, units=line["units"], rate=rate),
                    key=b["key"], rank=-line["units"], subject=line["item"], named=item, ev={"slug": slug},
                    amt=_amt(rate, "/day")))
            elif fact["st"] == "short" and fact["cad"] == "weekly":
                # Fed by a weekly wholesale delivery, not a top-up.
                rate = round(line.get("tradeRate", line["rate"]))
                row = rows.get((s, slug)) or {}
                day = fact.get("day") or row.get("wholesaleDay")
                day = (msg("f.wholesale.day", "{d:day}", d=WEEKDAYS.index(day)) if day in WEEKDAYS
                       else day or msg("f.wholesale.next", "the next"))
                also_short = _below(fact["have"], fact["use"])
                said = dict(item=item, day=day, have=fact["have"], use=fact["use"])
                if fact["why"] == "shortfall" and also_short:
                    # Both at once: the stock does not reach the drop, and the
                    # delivery would not carry the week if it did.
                    text = (msg("f.wholesale.both.raise", "{item} runs out before {day}'s wholesale delivery, and "
                                "the delivery brings {have:,} a week against the {use:,} it sells; raise the "
                                "contract to {set:,}", set=fact["setTo"], **said)
                            if fact.get("setTo") else
                            msg("f.wholesale.both", "{item} runs out before {day}'s wholesale delivery, and the "
                                "delivery brings {have:,} a week against the {use:,} it sells", **said))
                elif fact["why"] == "shortfall":
                    text = msg("f.wholesale.shortfall", "{item} runs out before {day}'s wholesale delivery: "
                               "{units:,} left at {rate:,}/day", item=item, day=day, units=line["units"], rate=rate)
                else:
                    text = msg("f.wholesale.order", "{item}'s wholesale delivery brings {have:,} a week against "
                               "the {use:,} it sells", **said)
                # Running out before the delivery ranks ahead of an order
                # short of the week; the ratio breaks ties among each.
                ratio = round(fact["have"] / fact["use"], 2) if fact["use"] else 0
                notes.append(_finding(
                    fact["lvl"], b["name"], "wholesale", text, key=b["key"],
                    rank=ratio - 10 if fact["why"] == "shortfall" else ratio,
                    subject=line["item"], named=item, ev={"slug": slug},
                    amt=_amt(line["units"], "left") if fact["why"] == "shortfall" and not also_short
                    else _amt(fact["use"], "/week used")))
            elif fact["st"] == "short" and fact["why"] == "target":
                peak = (rows.get((s, slug)) or {}).get("peakDay")
                notes.append(_finding(
                    "critical", b["name"], "outruns",
                    msg("f.outruns.day", "{item} sells {use:,} on a {d:day} against a {have:,} top-up; empties "
                        "before the next drop", item=item, use=fact["use"], have=fact["have"],
                        d=WEEKDAYS.index(peak))
                    if peak in WEEKDAYS else
                    msg("f.outruns", "{item} sells {use:,} on its busiest day against a {have:,} top-up; empties "
                        "before the next drop", item=item, use=fact["use"], have=fact["have"]),
                    key=b["key"],
                    rank=-round(fact["use"] / fact["have"] * 100) if fact["have"] else 0,
                    subject=line["item"], named=item, ev={"slug": slug}))
    return notes


def _lasts_msg(days):
    """How long a holding lasts, as a finding says it: "about 18 days", and
    past LASTS_CAP days "over 60 days", as the cover figures cap it."""
    days = days or 0
    if days > LASTS_CAP:
        return msg("f.lasts.over", "over {n:,} days", n=LASTS_CAP)
    return msg("f.lasts.about", {"one": "about {n:,} day", "other": "about {n:,} days"}, n=max(1, round(days)))


def _unsourced_note(businesses: list, b: dict, s: int, found: list, labels: dict) -> dict:
    """One shop's goods nothing upstream supplies, as one finding: a top-up
    from a site that has none coming in, or a price with nothing bringing it.
    One item is said on its own; several are listed, the ones with a top-up
    first, and the finding lands on the first."""
    found = sorted(found, key=lambda sf: (sf[1]["why"] != "source", -(sf[1].get("have") or 0), str(sf[0])))
    level = "critical" if any(f["lvl"] == "critical" for _slug, f in found) else "warn"
    slug, fact = found[0]
    label = labels.get((s, slug), slug)
    named = tok(slug, label)
    source = fact.get("from")
    if len(found) > 1:
        items = [tok(sl, labels.get((s, sl), sl)) for sl, _f in found]
        text = msg("f.unsourced.list", "Nothing upstream supplies {n} goods {site} is topped up with or prices: "
                   "{items}; add them to an import, or to a route from a factory that makes them",
                   n=len(found), site=b["name"], items=_msg_list(items))
    elif fact["why"] == "source" and source is not None and 0 <= source < len(businesses):
        text = msg("f.unsourced", "{item} is topped up to {have:,} from {source}, but nothing brings "
                   "it to {source}: no stock, import, factory line or route; add it to an import "
                   "there, or to a route from a factory that makes it",
                   item=named, have=fact["have"], source=businesses[source]["name"])
    else:
        text = msg("f.unsourced.priced", "{item} is priced here but nothing brings it: no top-up, "
                   "wholesale delivery or import; add it to a route from a depot or factory",
                   item=named)
    return _finding(level, b["name"], "unsourced", text, key=b["key"],
                    rank=-len(found), subject=label, named=named, ev={"slug": slug})


def _import_notes(businesses: list, supply: dict, silent: set, mode: str = "cap") -> list:
    """A line an import brings, when its week or its stock falls short.

    One finding per (site, item), read off the fact: a depot's, or a factory's
    own import. An import the factory lines draw on is said in their words
    (kind feed), one only other sites draw on in the order's (order, paused);
    stock that will not reach the drop is a shortfall either way. Tight is
    never a finding here.
    """
    facts = supply.get("facts", {})
    # The rows walked in the sizing asked for: Demand's own where it was sent.
    rows = {(r["s"], r["slug"]): r
            for r in (supply.get("importsDem", supply.get("imports", [])) if mode == "dem"
                      else supply.get("imports", []))}
    depots = supply.get("factories", {}).get("depots", {})
    labels = _fact_labels(businesses, supply)
    notes = []
    for s_key in _in_order(facts):
        s = int(s_key)
        b = businesses[s]
        if b["key"] in silent:
            continue
        for slug in _in_order(facts[s_key]):
            whole = _supply_fact(facts, s, slug, mode)
            # A factory's own contract beside a daily top-up is its `import`.
            fact = whole.get("import") or whole
            # A depot only a route from your own site feeds: its daily top-up
            # against its busiest day, as a shelf's (tight is no finding).
            if fact["role"] == "depot" and fact["cad"] == "daily":
                if fact["st"] == "short" and fact["why"] == "target":
                    item = labels.get((s, slug), slug)
                    named = tok(slug, item)
                    plans = [fact.get("from")] + [r[0] for r in fact.get("raise") or ()]
                    notes.append(_finding(
                        "critical", b["name"], "topup",
                        msg("f.topup.several", "{item} is topped up to {have:,} a day against the {use:,} its busiest "
                            "day sends on; raise the top-ups on the plans of {sites} to {set:,}",
                            item=named, have=fact["have"], use=fact["use"], set=fact["setTo"],
                            sites=_msg_list([businesses[x]["name"] for x in plans if x is not None]))
                        if fact.get("raise") else
                        msg("f.topup", "{item} is topped up to {have:,} a day against the {use:,} its busiest day "
                            "sends on; raise the top-up to {set:,}",
                            item=named, have=fact["have"], use=fact["use"], set=fact["setTo"]),
                        key=b["key"], rank=round(fact["have"] / fact["use"], 2) if fact["use"] else 0,
                        subject=item, named=named, ev={"slug": slug}))
                continue
            if fact["cad"] != "weekly" or fact["role"] not in ("depot", "input"):
                continue
            st, why = fact["st"], fact["why"]
            # A factory's own paused contract beside a top-up is said with the
            # input (_feed_notes), once; one the top-up covers is no finding.
            if st == "paused" and whole is not fact:
                continue
            if not (st == "paused" or (st == "short" and why in ("order", "shortfall"))
                    or (st == "noplan" and fact["lvl"] != "info")):
                continue
            item = labels.get((s, slug), slug)
            named = tok(slug, item)
            row = rows.get((s, slug))
            entry = depots.get(s, {}).get(slug) or {}
            parts = fact.get("parts") or {}
            site, key = b["name"], b["key"]
            ev = {"slug": slug}
            if st == "short" and why == "shortfall" and row:
                notes.append(_shortfall_note(row, item, site, key, businesses))
                continue
            if st == "short" and fact["role"] == "depot" and fact.get("wholesale"):
                # A depot a wholesale store delivers to: its contract, said on
                # the depot's own page (Weekly imports does not list it).
                said = dict(item=named, have=fact["have"], use=fact["use"], route=parts.get("route"),
                            set=fact.get("setTo"))
                if parts.get("route") and fact.get("setTo"):
                    text = msg("f.depot.wholesale.route.raise", "{item}'s wholesale delivery brings {have:,} a week "
                               "against {use:,} used beyond the {route:,} a week a route brings; raise the contract "
                               "to {set:,}", **said)
                elif parts.get("route"):
                    text = msg("f.depot.wholesale.route", "{item}'s wholesale delivery brings {have:,} a week "
                               "against {use:,} used beyond the {route:,} a week a route brings", **said)
                elif fact.get("setTo"):
                    text = msg("f.depot.wholesale.raise", "{item}'s wholesale delivery brings {have:,} a week "
                               "against {use:,} used; raise the contract to {set:,}", **said)
                else:
                    text = msg("f.depot.wholesale", "{item}'s wholesale delivery brings {have:,} a week against "
                               "{use:,} used", **said)
                notes.append(_finding(
                    fact["lvl"], site, "wholesale", text,
                    key=key, rank=round(fact["have"] / fact["use"], 2) if fact["use"] else 0,
                    subject=item, named=named, ev=ev, amt=_amt(fact["use"], "/week used")))
                continue
            smart = _smart_words(entry.get("target") or 0, entry.get("plainAfter", 0),
                                 entry.get("plainBefore", 0)) if entry.get("smart") else ""
            if parts.get("lines") or fact["role"] == "input":
                amt = None
                if st == "paused":
                    text = msg("f.import.paused.resume", "{item} import is paused; resume the contract supplying "
                               "{site}", item=named, site=site)
                elif st == "noplan":
                    stock = next((l["units"] for l in b["lines"] if l["slug"] == slug), 0)
                    said = dict(item=named, site=site, stock=stock, use=fact["use"], route=parts.get("route"),
                                weeks=stock / fact["use"] if fact["use"] else 0)
                    amt = _amt(said["weeks"], "weeks", places=1)
                    # The factories alone, or other sites drawing on it too;
                    # and a route bringing part of the week, or not.
                    if not parts.get("sites") and parts.get("route"):
                        text = msg("f.import.noplan.route", "{item} has no standing import; {site} holds {stock:,}, "
                                   "{weeks:.1f} weeks of the {use:,} a week the factories eat beyond the {route:,} a "
                                   "week a route brings", **said)
                    elif not parts.get("sites"):
                        text = msg("f.import.noplan", "{item} has no standing import; {site} holds {stock:,}, "
                                   "{weeks:.1f} weeks of the {use:,} a week the factories eat", **said)
                    elif parts.get("route"):
                        text = msg("f.import.noplan.sites.route", "{item} has no standing import; {site} holds "
                                   "{stock:,}, {weeks:.1f} weeks of the {use:,} a week the factories and other sites "
                                   "draw beyond the {route:,} a week a route brings", **said)
                    else:
                        text = msg("f.import.noplan.sites", "{item} has no standing import; {site} holds {stock:,}, "
                                   "{weeks:.1f} weeks of the {use:,} a week the factories and other sites draw",
                                   **said)
                elif entry.get("smart"):
                    said = dict(item=named, use=fact["use"], smart=smart, at=entry.get("levelName"),
                                set=fact.get("setTo"))
                    if entry.get("levelName") and fact.get("setTo"):
                        text = msg("f.import.smart.at.raise", "{item}: this import needs to cover {use:,} a week and "
                                   "{smart}; raise the Smart Delivery stock at {at} to {set:,}", **said)
                    elif entry.get("levelName"):
                        text = msg("f.import.smart.at", "{item}: this import needs to cover {use:,} a week and "
                                   "{smart}; raise the Smart Delivery stock at {at}", **said)
                    elif fact.get("setTo"):
                        text = msg("f.import.smart.raise", "{item}: this import needs to cover {use:,} a week and "
                                   "{smart}; raise the Smart Delivery stock to {set:,}", **said)
                    else:
                        text = msg("f.import.smart", "{item}: this import needs to cover {use:,} a week and "
                                   "{smart}; raise the Smart Delivery stock", **said)
                elif fact.get("setTo"):
                    text = msg("f.import.order.raise", "{item}: this import needs to cover {use:,} a week and the "
                               "import order is {order:,}; raise it to {set:,}",
                               item=named, use=fact["use"], order=entry.get("weekly", 0), set=fact["setTo"])
                else:
                    text = msg("f.import.order", "{item}: this import needs to cover {use:,} a week and the import "
                               "order is {order:,}", item=named, use=fact["use"], order=entry.get("weekly", 0))
                notes.append(_finding(fact["lvl"], site, "feed", text, key=key,
                                      rank=-round(fact["use"] / 7), subject=item, named=named, ev=ev, amt=amt))
                continue
            if st == "noplan":
                # A depot only shops draw on, with no standing import: nothing
                # brings it, or the routes into it cannot bring what it sends
                # on (_supply_facts' route_fed()). Nothing upstream supplies
                # it, as a shelf's unsourced finding says of a shelf.
                passes = fact.get("passes")
                said = dict(item=named, site=site, use=fact["use"], route=parts.get("route", 0),
                            total=fact["use"] + parts.get("route", 0), set=fact.get("setTo") or 0,
                            lasts=_lasts_msg(fact.get("lasts")),
                            sender=businesses[passes]["name"] if passes is not None else "")
                # Nothing brings it, or only what a sender holds: nothing
                # upstream supplies it (unsourced). Routes that bring part of
                # it leave an import to add (order).
                group = "unsourced"
                if passes is not None:
                    text = msg("f.depot.noplan.passes", "{item}: no standing supply brings it to {site}; the route "
                               "from {sender} only passes on what it holds, {lasts} of the {use:,} a week {site} "
                               "sends on; import {set:,} a week", **said)
                elif parts.get("route"):
                    group = "order"
                    text = msg("f.depot.noplan.route", "{item}: the routes into {site} bring {route:,} a week of "
                               "the {total:,} a week it sends on, and no standing import brings the rest; import "
                               "{set:,} a week", **said)
                else:
                    text = msg("f.depot.noplan", "{item}: nothing brings it to {site}, which sends on {use:,} a "
                               "week; import {set:,} a week", **said)
                said_as = dict(key=key, rank=-round(fact["use"] / 7), subject=item, named=named, ev=ev,
                               amt=_amt(said["lasts"].p["n"], "days") if passes is not None else None)
                notes.append(_finding(fact["lvl"], site, "order", text, **said_as) if group == "order"
                             else _finding(fact["lvl"], site, "unsourced", text, **said_as))
                continue
            cover = row["cover"] if row else 0
            if st == "paused":
                # round() is what {cover:.0f} printed, and a whole number
                # picks the plural a translation needs.
                text = (msg("f.paused", {"one": "{item} import is paused: {n} day left at {rate:,}/day",
                                         "other": "{item} import is paused: {n} days left at {rate:,}/day"},
                            item=named, n=round(cover), rate=row.get("importPerDay", row["perDay"]))
                        if row else msg("f.paused.bare", "{item} import is paused", item=named))
                notes.append(_finding(fact["lvl"], site, "paused", text,
                                      key=key, rank=cover, subject=item, named=named, ev=ev,
                                      amt=_amt(row.get("importPerDay", row["perDay"]), "/day") if row else None))
                continue
            text = _order_text(businesses, fact, entry, row, named)
            notes.append(_finding(fact["lvl"], site, "order", text,
                                  key=key, rank=cover, subject=item, named=named, ev=ev,
                                  amt=_amt(text.p["short"], "units short")))
    return notes


def _order_text(businesses: list, fact: dict, entry: dict, row: dict | None, named) -> "Msg":
    """An import order short of its week, as its finding says it: how soon
    it bites (the stock runs dry before the drop, the route that only passes
    on what its sender holds, or what is held here), or the order alone."""
    smart = _smart_words(entry.get("target") or 0, entry.get("plainAfter", 0),
                         entry.get("plainBefore", 0)) if entry.get("smart") else ""
    brought = entry.get("weekly", 0)
    said = dict(item=named, smart=smart, brought=brought, use=fact["use"], short=fact["use"] - brought)
    if row and row["coverFit"] == "short":
        said.update(when=_runs_dry_when(row), by=row["shortBy"],
                    arrives=row.get("coverageUntil", row["arrives"]))
        text = (msg("f.order.smart.dry", "{item}: {smart} against a {use:,} week of use, {short:,} short; "
                    "already runs dry {when}, {by:.1f} days before {arrives:day}'s import", **said)
                if entry.get("smart") else
                msg("f.order.dry", "{item} orders {brought:,} a week against a {use:,} week of use, "
                    "{short:,} short; already runs dry {when}, {by:.1f} days before {arrives:day}'s import",
                    **said))
    elif fact.get("passes") is not None:
        # The route into the depot only passes on what its sender
        # holds: how long that lasts is how soon the order bites.
        said.update(sender=businesses[fact["passes"]]["name"], lasts=_lasts_msg(fact.get("lasts")))
        text = (msg("f.order.smart.passes", "{item}: {smart} against a {use:,} week of use, {short:,} "
                    "short; the route from {sender} only passes on what it holds, {lasts} of it",
                    **said)
                if entry.get("smart") else
                msg("f.order.passes", "{item} orders {brought:,} a week against a {use:,} week of use, "
                    "{short:,} short; the route from {sender} only passes on what it holds, {lasts} "
                    "of it", **said))
    elif fact["lvl"] == "warn" and fact.get("lasts") is not None:
        # Short of its week, but what is held here lasts beyond it.
        said.update(lasts=_lasts_msg(fact["lasts"]))
        text = (msg("f.order.smart.lasts", "{item}: {smart} against a {use:,} week of use, {short:,} "
                    "short; what is held here lasts {lasts}", **said)
                if entry.get("smart") else
                msg("f.order.lasts", "{item} orders {brought:,} a week against a {use:,} week of use, "
                    "{short:,} short; what is held here lasts {lasts}", **said))
    elif entry.get("smart"):
        text = msg("f.order.smart", "{item}: {smart} against a {use:,} week of use, {short:,} short", **said)
    else:
        text = msg("f.order", "{item} orders {brought:,} a week against a {use:,} week of use, {short:,} "
                   "short", **said)
    return text


def _order_says(businesses: list, supply: dict) -> None:
    """The order finding's sentence on each short import line whose finding
    says how long its stock lasts or which route only passes on what it
    holds (fact `says`, and under `dem` where Demand sizing says it
    differently): the Supply table's status tip gives it for every line,
    where the findings list gives one line of a site. In place."""
    facts = supply.get("facts", {})
    depots = supply.get("factories", {}).get("depots", {})
    labels = _fact_labels(businesses, supply)
    rows = {mode: {(r["s"], r["slug"]): r for r in (supply.get("importsDem", supply.get("imports", []))
                                                    if mode == "dem" else supply.get("imports", []))}
            for mode in SIZING_MODES}
    for s_key in _in_order(facts):
        s = int(s_key)
        for slug in _in_order(facts[s_key]):
            entry = depots.get(s, {}).get(slug) or {}
            said = {}
            for mode in SIZING_MODES:
                fact = _supply_fact(facts, s, slug, mode)
                row = rows[mode].get((s, slug))
                if (fact.get("role") != "depot" or fact.get("cad") != "weekly" or fact.get("st") != "short"
                        or fact.get("why") != "order" or not entry
                        or (row and row["coverFit"] == "short")
                        or not (fact.get("passes") is not None
                                or (fact.get("lvl") == "warn" and fact.get("lasts") is not None))):
                    said[mode] = None
                    continue
                said[mode] = _order_text(businesses, fact, entry, row, tok(slug, labels.get((s, slug), slug)))
            base = facts[s_key][slug]
            if said["cap"] is not None:
                base["says"] = said["cap"]
            if said["dem"] != said["cap"]:
                base.setdefault("dem", {})["says"] = said["dem"]


def _runs_dry_when(row: dict):
    """When an import row's stock runs dry, as the findings say it: on its
    weekday, or in so many days."""
    if row["runsOut"]:
        return msg("f.dry.on", "on {d:day}", d=WEEKDAYS.index(row["runsOut"]))
    # cover is a float, printed "1.0": English keeps "days" for it.
    return msg("f.dry.in", {"one": "in {n} days", "other": "in {n} days"}, n=row["cover"])


def _shortfall_note(row: dict, item: str, site: str, key: str, businesses: list | None = None) -> dict:
    """A depot's stock that will not reach its next drop, or, where a route
    brings the week, a busy day the shelf cannot carry to the next round.
    Where the morning rounds to a depot beside it are what runs it dry
    before that depot's own import lands (`topsUp`), the finding names that
    depot and the target the rounds fill it to."""
    named = tok(row["slug"], item)
    # The draw the import answers for; a route's share is named, not hidden.
    said = dict(item=named, when=_runs_dry_when(row), routed=row.get("routed"),
                rate=row.get("importPerDay", row["perDay"]))
    if row.get("covered"):
        text = (msg("f.shortfall.route.paused", "{item} runs dry {when}, before the route's next round; a route "
                    "brings the week's draw ({routed:,}/day) but a busy day outruns the shelf; the import is paused",
                    **said)
                if row["paused"] else
                msg("f.shortfall.route", "{item} runs dry {when}, before the route's next round; a route brings the "
                    "week's draw ({routed:,}/day) but a busy day outruns the shelf", **said))
    elif row.get("topsUp") and businesses and 0 <= row["topsUp"][0] < len(businesses):
        said.update(by=row["shortBy"], arrives=row.get("coverageUntil", row["arrives"]),
                    site=businesses[row["topsUp"][0]]["name"], target=row["topsUp"][1])
        text = msg("f.shortfall.topup", "{item} runs dry {when}, {by:.1f} days before {arrives:day}'s import: the "
                   "morning rounds top {site} up to {target:,} before its own import lands", **said)
    else:
        said.update(by=row["shortBy"], arrives=row.get("coverageUntil", row["arrives"]))
        text = (msg("f.shortfall.routed", "{item} runs dry {when}, {by:.1f} days before {arrives:day}'s import "
                    "({rate:,}/day beyond the {routed:,}/day a route brings)", **said)
                if row.get("routed") else
                msg("f.shortfall", "{item} runs dry {when}, {by:.1f} days before {arrives:day}'s import ({rate:,}/day, "
                    "{peak:,} at peak)", peak=row["peakPerDay"], **said))
    # How many days early it runs dry, or, where a route brings the week, the
    # route's draw.
    amt = (_amt(said["routed"], "/day") if row.get("covered")
           else _amt(said["by"], "days early", places=1))
    return _finding("critical", site, "shortfall", text,
                    key=key, rank=row["cover"], subject=item, named=named, ev={"slug": row["slug"]}, amt=amt)


def _unnamed_notes(businesses: list, factories: dict, silent: set) -> list:
    """A machine whose recipe the board cannot read, and the needs it hides.

    Two different things wear the same badge on the lines table. A machine with
    no recipe selected at all is standing still and costing rent; one that is
    running a recipe the board cannot identify may be working, but
    every input need at that site is short by whatever it eats — which is worth
    saying out loud, because nothing else on the board looks wrong.
    """
    notes = []
    for site in factories.get("sites", []):
        business = businesses[site["s"]]
        if business["key"] in silent:
            continue
        for kind, group, level in (("idle", "unset", "critical"), ("blind", "unnamed", "warn")):
            rows = [u for u in site["unnamed"] if u["idle"] == (kind == "idle")]
            machines = sum(u["machines"] for u in rows)
            if not machines:
                continue
            where = ", ".join(
                sorted({f"{u['workstation']} #{s}" for u in rows for s in u["slots"]})
            )
            # The same places in the same order, their workstation a token.
            spots = {f"{u['workstation']} #{s}": msg("f.unnamed.spot", "{station} #{slot}",
                                                       station=tok(u.get("workstationKey"), u["workstation"]),
                                                       slot=s)
                     for u in rows for s in u["slots"]}
            shown = _msg_list([spots[w] for w in sorted(spots)]) if spots else ""
            if kind == "idle":
                text = msg("f.unset", {
                    "one": "{n} machine at {spots} has no recipe set: staffed and rented, making nothing",
                    "other": "{n} machines at {spots} have no recipe set: staffed and rented, making nothing",
                }, n=machines, spots=shown)
            else:
                text = msg("f.unnamed", {
                    "one": "{n} machine at {spots} runs a recipe without usable details. Its inputs are missing "
                           "from the totals; name unknown recipes or load matching game text to include them",
                    "other": "{n} machines at {spots} run a recipe without usable details. Its inputs are missing "
                             "from the totals; name unknown recipes or load matching game text to include them",
                }, n=machines, spots=shown)
            notes.append(
                _finding(
                    level, business["name"], group, text,
                    key=business["key"], rank=-machines, subject=where, named=shown,
                    amt=_amt(machines, "machine" if machines == 1 else "machines"),
                )
            )
    return notes


def _staff_notes(businesses: list, factories: dict, silent: set, mode: str = "cap") -> list:
    """A factory machine nobody is posted to for part of the week stands still.

    Sized 24/7 a machine needs all STAFF_HOURS of the week; sized for demand a
    named line's machine needs only its `needHours.dem` a day, so it is a gap
    only below that week. The finding's id does not change with the mode.
    """
    notes = []
    for site in factories.get("sites", []):
        business = businesses[site["s"]]
        if business["key"] in silent:
            continue
        for line in site["lines"] + site["unnamed"]:
            if mode == "dem" and line.get("demandApproximate"):
                continue
            name = line.get("item") or line["workstation"]
            named = (tok(line.get("slug"), line["item"]) if line.get("item")
                     else tok(line.get("workstationKey"), line["workstation"]))
            week = STAFF_HOURS
            if mode == "dem" and line.get("needHours"):
                week = line["needHours"]["dem"] * 7
            for machine in line.get("gaps", []):
                if machine["hours"] >= week:
                    continue
                share = machine["hours"] / week
                lost = round((week - machine["hours"]) / 7 * line.get("rate", 0))
                subject = f"{name} at position {machine['slot']}"
                said = dict(item=named, slot=machine["slot"], hours=machine["hours"], week=week,
                            off=machine["off"])
                if week < STAFF_HOURS:
                    text = (
                        msg("sp.py.staff.needed.lost", "{item} machine at list position {slot} is staffed "
                            "{hours} of {week} hours needed; nobody on it {off}; {lost:,} a day not made",
                            lost=lost, **said)
                        if lost else
                        msg("sp.py.staff.needed", "{item} machine at list position {slot} is staffed "
                            "{hours} of {week} hours needed; nobody on it {off}", **said)
                    )
                else:
                    text = (
                        msg("sp.py.staff.lost", "{item} machine at list position {slot} is staffed "
                            "{hours} of {week} hours; nobody on it {off}; {lost:,} a day not made",
                            lost=lost, **said)
                        if lost else
                        msg("sp.py.staff", "{item} machine at list position {slot} is staffed "
                            "{hours} of {week} hours; nobody on it {off}", **said)
                    )
                notes.append(
                    _finding(
                        "critical" if share < STAFF_CRITICAL else "warn",
                        business["name"], "staff", text,
                        key=business["key"], rank=machine["hours"], subject=subject,
                        named=msg("sp.py.staff.named", "{item} at position {slot}",
                                  item=named, slot=machine["slot"]),
                        ev={"slot": machine["slot"], "slug": line.get("slug")},
                        amt=_amt(machine["hours"], "hours staffed", of=week),
                    )
                )
    return notes


def _feed_notes(businesses: list, factories: dict, silent: set, mode: str = "cap") -> list:
    """A factory input its top-up does not cover, with the number to change.

    Read off the input's verdict (its fact, mirrored on the row, with what
    Demand sizing changes under `dem`). An input an import brings straight to
    the factory is judged on its week by _import_notes(), and a depot's import
    there too, once however many factories draw on it.
    """
    notes = []
    for site in factories.get("sites", []):
        business = businesses[site["s"]]
        if business["key"] in silent:
            continue
        for base in site["needs"]:
            if base.get("directImport"):
                continue
            row = {**base, **base["dem"]} if mode == "dem" and base.get("dem") else base
            status, why = row["status"], row.get("why")
            per_day = row.get("use", base["perDay"])
            depot = (businesses[row["from"]]["name"] if row["from"] is not None
                     else msg("f.feed.depot", "the depot"))
            slugs = row.get("lineSlugs") or []
            lines = [tok(slugs[i] if i < len(slugs) else None, line) for i, line in enumerate(row["lines"][:3])]
            item = tok(row.get("slug"), row["item"])
            if status == "noplan" and row.get("via") is not None:
                continue  # said once, by the depot's Not routed finding
            # The paused own import is offered as the other way out, after
            # whatever the sentence says first.
            own = bool(row.get("ownPaused"))
            said = dict(item=item, per=per_day, depot=depot, site=business["name"])
            amt = _amt(per_day, "/day needed")
            if status == "noplan":
                amt = _amt(per_day, "/day")
                said.update(lines=_msg_list(lines) if lines else "")
                text = (msg("f.feed.noplan.resume", "{item} feeds {lines} at {per:,}/day but no depot tops it up; "
                            "or resume the paused {item} import to {site}", **said)
                        if own else
                        msg("f.feed.noplan", "{item} feeds {lines} at {per:,}/day but no depot tops it up", **said))
            elif status == "short" and why == "target":
                raise_to = row.get("setTo", base.get("raiseTarget"))
                # round() is what {hours:.0f} printed, and a whole number
                # picks the plural a translation needs.
                said.update(target=row["target"], n=round(row["target"] / per_day * 24 if per_day else 0),
                            set=raise_to)
                if row.get("stalled"):
                    said.update(stock=row["depotStock"])
                amt = _amt(said["n"], "hours covered")
                text = _feed_target_text(bool(raise_to), bool(row.get("stalled")), own, said)
            elif status == "short" and why == "dry":
                said.update(arrives=row["arrives"], stock=row["depotStock"])
                text = (msg("f.feed.dry.resume", "{item} arrives at {arrives:,}/day against {per:,} needed and "
                            "{depot} holds {stock:,}; the import is not keeping up; or resume the paused {item} "
                            "import to {site}", **said)
                        if own else
                        msg("f.feed.dry", "{item} arrives at {arrives:,}/day against {per:,} needed and {depot} "
                            "holds {stock:,}; the import is not keeping up", **said))
            elif status == "stalled" and why == "notDrawn":
                said.update(arrives=row["arrives"], stock=row["depotStock"])
                text = (msg("f.feed.notdrawn.resume", "{item} arrives at {arrives:,}/day against {per:,} needed "
                            "while {depot} holds {stock:,}; it isn't reaching the factory; or resume the paused {item} "
                            "import to {site}", **said)
                        if own else
                        msg("f.feed.notdrawn", "{item} arrives at {arrives:,}/day against {per:,} needed while "
                            "{depot} holds {stock:,}; it isn't reaching the factory", **said))
            else:
                continue
            notes.append(
                _finding(
                    row["level"], business["name"], "feed", text,
                    key=business["key"], rank=-base["perDay"], subject=row["item"], named=item,
                    ev={"slug": row["slug"]}, amt=amt,
                )
            )
    return notes


def _feed_target_text(raise_it: bool, stalled: bool, own: bool, said: dict):
    """_feed_notes()'s sentence for a top-up short of the line: the number to
    raise it to, the week nothing arrived and the paused own import, each
    where it applies. `said` holds item, target, n (the hours covered), per,
    set, depot, stock and site."""
    if raise_it and stalled and own:
        return msg("f.feed.target.raise.stalled.resume", {
            "one": "{item} top-up of {target:,} covers {n} hour of a {per:,}/day line; raise it to {set:,}; and none "
                   "arrived last week though {depot} holds {stock:,}; or resume the paused {item} import to {site}",
            "other": "{item} top-up of {target:,} covers {n} hours of a {per:,}/day line; raise it to {set:,}; and "
                     "none arrived last week though {depot} holds {stock:,}; or resume the paused {item} import to "
                     "{site}"}, **said)
    if raise_it and stalled:
        return msg("f.feed.target.raise.stalled", {
            "one": "{item} top-up of {target:,} covers {n} hour of a {per:,}/day line; raise it to {set:,}; and none "
                   "arrived last week though {depot} holds {stock:,}",
            "other": "{item} top-up of {target:,} covers {n} hours of a {per:,}/day line; raise it to {set:,}; and "
                     "none arrived last week though {depot} holds {stock:,}"}, **said)
    if raise_it and own:
        return msg("f.feed.target.raise.resume", {
            "one": "{item} top-up of {target:,} covers {n} hour of a {per:,}/day line; raise it to {set:,}; or "
                   "resume the paused {item} import to {site}",
            "other": "{item} top-up of {target:,} covers {n} hours of a {per:,}/day line; raise it to {set:,}; or "
                     "resume the paused {item} import to {site}"}, **said)
    if raise_it:
        return msg("f.feed.target.raise", {
            "one": "{item} top-up of {target:,} covers {n} hour of a {per:,}/day line; raise it to {set:,}",
            "other": "{item} top-up of {target:,} covers {n} hours of a {per:,}/day line; raise it to {set:,}"},
            **said)
    if stalled and own:
        return msg("f.feed.target.stalled.resume", {
            "one": "{item} top-up of {target:,} covers {n} hour of a {per:,}/day line; and none arrived last week "
                   "though {depot} holds {stock:,}; or resume the paused {item} import to {site}",
            "other": "{item} top-up of {target:,} covers {n} hours of a {per:,}/day line; and none arrived last week "
                     "though {depot} holds {stock:,}; or resume the paused {item} import to {site}"}, **said)
    if stalled:
        return msg("f.feed.target.stalled", {
            "one": "{item} top-up of {target:,} covers {n} hour of a {per:,}/day line; and none arrived last week "
                   "though {depot} holds {stock:,}",
            "other": "{item} top-up of {target:,} covers {n} hours of a {per:,}/day line; and none arrived last week "
                     "though {depot} holds {stock:,}"}, **said)
    if own:
        return msg("f.feed.target.resume", {
            "one": "{item} top-up of {target:,} covers {n} hour of a {per:,}/day line; or resume the paused {item} "
                   "import to {site}",
            "other": "{item} top-up of {target:,} covers {n} hours of a {per:,}/day line; or resume the paused {item} "
                     "import to {site}"}, **said)
    return msg("f.feed.target", {
        "one": "{item} top-up of {target:,} covers {n} hour of a {per:,}/day line",
        "other": "{item} top-up of {target:,} covers {n} hours of a {per:,}/day line"}, **said)


def _notrouted_text(one: bool, needs: bool, held: bool, said: dict):
    """_idle_notes()'s Not routed sentence: one site or several (`who`), that
    sell it or, with no shop among them, need it, and how long what they hold
    lasts where that is known. `said` holds site, stock, item, who, per and
    days."""
    if one and needs and held:
        return msg("f.notrouted.one.needs.held", "{site} holds {stock:,} {item} no plan sends on; {who} needs "
                   "{per:,}/day and holds {days}", **said)
    if one and needs:
        return msg("f.notrouted.one.needs", "{site} holds {stock:,} {item} no plan sends on; {who} needs {per:,}/day",
                   **said)
    if one and held:
        return msg("f.notrouted.one.sells.held", "{site} holds {stock:,} {item} no plan sends on; {who} sells "
                   "{per:,}/day and holds {days}", **said)
    if one:
        return msg("f.notrouted.one.sells", "{site} holds {stock:,} {item} no plan sends on; {who} sells {per:,}/day",
                   **said)
    if needs and held:
        return msg("f.notrouted.need.held", "{site} holds {stock:,} {item} no plan sends on; {who} need {per:,}/day "
                   "and hold {days}", **said)
    if needs:
        return msg("f.notrouted.need", "{site} holds {stock:,} {item} no plan sends on; {who} need {per:,}/day",
                   **said)
    if held:
        return msg("f.notrouted.sell.held", "{site} holds {stock:,} {item} no plan sends on; {who} sell {per:,}/day "
                   "and hold {days}", **said)
    return msg("f.notrouted.sell", "{site} holds {stock:,} {item} no plan sends on; {who} sell {per:,}/day", **said)


def _idle_notes(businesses: list, idle: list, silent: set, mode: str = "cap") -> list:
    """Stock standing still, said once per cause rather than once per shelf.

    Six shops holding a thousand cupcakes each is not six findings; it is one
    top-up target set too high (targetHigh), grouped by the target. Stock with
    nothing moving out stays one line per holding (notMoving), and so does
    stock a Smart Delivery level or a weekly order keeps too high (importHigh)
    or stock that is simply weeks of what leaves (overstock); all three are
    Idle stock. Stock no plan sends on while the company's own sites sell or
    need it is Not routed (notrouted), one finding that names those sites,
    whose own no-plan findings then give way to it. `idle` rows carry the
    sizing modes they hold in (`modes`) and what Demand sizing changes (`dem`).
    """
    rows = []
    for row in idle:
        if mode not in row.get("modes", ("cap",)):
            continue
        rows.append({**row, **row["dem"]} if mode == "dem" and row.get("dem") else row)
    live = [r for r in rows if businesses[r["s"]]["key"] not in silent]
    notes = []

    def worth_of(row):
        # Raw materials carry no retail price, so there is no honest dollar
        # figure to gate them by: the units are the finding.
        weeks = row["weeks"] if row["weeks"] else row["stock"] / max(row["perWeek"], 1)
        return row["value"] / max(1.0, weeks * 7) if row["price"] else None

    for row in live:
        why = row.get("why") or ("notMoving" if row["dead"] else None)
        if why in (None, "targetHigh"):
            continue
        name, key = businesses[row["s"]]["name"], businesses[row["s"]]["key"]
        ev = {"slug": row["slug"]}
        item = tok(row["slug"], row["item"])
        if why == "notRouted":
            unfed = row.get("unfed") or []
            sites = [businesses[s] for s, _per_day, _days in unfed]
            types = {b["type"] for b in sites}
            if len(sites) == 1:
                who = sites[0]["name"]
            elif len(types) == 1:
                # Several of one type: the count and the type's name, which a
                # translation writes its own way ("Geschenkladen × 3").
                who = msg("f.notrouted.type", {"one": "{n} {type}", "other": "{n} {type}"}, n=len(sites),
                          type=tok(sites[0].get("typeSlug"), _plural(types.pop()).lower()))
            else:
                who = msg("f.notrouted.sites", {"one": "{n} sites", "other": "{n} sites"}, n=len(sites))
            days = [u[2] for u in unfed if u[2] is not None]
            said = dict(site=name, stock=row["stock"], item=item, who=who,
                        per=sum(u[1] for u in unfed),
                        days=msg("f.notrouted.days", {"one": "~{n:,} day", "other": "~{n:,} days"},
                                 n=round(sum(days) / len(days))) if days else "")
            text = _notrouted_text(len(sites) == 1, all(b["status"] != "retail" for b in sites), bool(days), said)
            notes.append(_finding(
                "warn", name, "notrouted", text,
                key=key, rank=-row["stock"], subject=row["item"], named=item, ev=ev,
                amt=_amt(said["per"], "/day")))
        elif why == "notMoving":
            # Brought here by a top-up target, with no shelf, onward route or
            # line here to use it: most likely a target set on the wrong route.
            # The stock may be meant for sites no plan reaches yet, so the
            # finding offers both ways out.
            text = (
                msg("f.dead.route", "{stock:,} {item} held with nothing moving out; {src} tops it up to {target:,} "
                    "here and no plan sends it on: add a plan to the shops that should get it, or stop the top-up",
                    stock=row["stock"], item=item, target=row["target"], src=businesses[row["routedFrom"]]["name"])
                if row.get("routedFrom") is not None else
                msg("f.dead", "{stock:,} {item} held with nothing moving out", stock=row["stock"], item=item)
            )
            notes.append(_finding(
                "info", name, "dead", text,
                key=key, rank=-row["stock"], subject=row["item"], named=item, worth=worth_of(row), ev=ev))
        elif why == "importHigh":
            # Idle stock is IDLE_WEEKS or more of what draws on it, so neither
            # count of weeks is ever one.
            said = dict(stock=row["stock"], item=item, weeks=row["weeks"], level=row.get("importLevel") or 0,
                        of=(row.get("importLevel") or 0) / max(row["perWeek"], 1))
            text = (
                msg("f.dead.import.smart", "{stock:,} {item} is {weeks:.0f} weeks of what it feeds; Smart Delivery "
                    "keeps {level:,} in stock, {of:.0f} weeks of it, so lower the import", **said)
                if row.get("smart") else
                msg("f.dead.import", "{stock:,} {item} is {weeks:.0f} weeks of what it feeds; the import brings "
                    "{level:,} a week, {of:.0f} weeks of it, so lower the import", **said)
            )
            notes.append(_finding(
                "info", name, "dead", text,
                key=key, rank=-row["stock"], subject=row["item"], named=item, worth=worth_of(row), ev=ev,
                amt=_amt(_shown(row["weeks"]), "weeks")))
        else:
            notes.append(_finding(
                "info", name, "dead",
                msg("f.dead.weeks", "{stock:,} {item} is {weeks:.0f} weeks of what leaves",
                    stock=row["stock"], item=item, weeks=row["weeks"]),
                key=key, rank=-row["stock"], subject=row["item"], named=item, worth=worth_of(row), ev=ev,
                amt=_amt(_shown(row["weeks"]), "weeks")))

    # A top-up target set too high groups by the target behind it: the same
    # number in the same plan, repeated across shops, is one setting to change.
    by_target = collections.OrderedDict()
    for row in live:
        why = row.get("why") or ("notMoving" if row["dead"] else None)
        if why in (None, "targetHigh"):
            by_target.setdefault(row["target"] or 0, []).append(row)
    for target, rows in by_target.items():
        items = sorted({r["item"] for r in rows})
        slug_of = {r["item"]: r["slug"] for r in rows}
        shown = _msg_list([tok(slug_of[i], i) for i in items])
        sites = len({r["s"] for r in rows})
        daily = sum(r["perWeek"] for r in rows) / 7 / len(rows)
        stock = sum(r["stock"] for r in rows)
        # Value the excess at what it sells for, spread over how long it takes to
        # sell — a rate, so it can be read against a day's profit.
        worth = sum(
            r["value"] / max(1.0, r["weeks"] * 7) for r in rows if r["price"]
        ) or None
        if target and daily:
            amt = _amt(_shown(target / daily), "daily sales", sign="x")
            text = msg("f.target", {
                "one": "{items} top-up target of {target:,} is {x:.0f}x daily sales in {n} shop; lower the target",
                "other": "{items} top-up target of {target:,} is {x:.0f}x daily sales in {n} shops; lower the target",
            }, items=shown, target=target, x=target / daily, n=sites)
        else:
            # Idle stock is IDLE_WEEKS or more of what draws on it: never one week.
            text = msg("f.target.units", {
                "one": "{units:,} units of {items} across {n} site is {weeks:.0f} weeks of supply",
                "other": "{units:,} units of {items} across {n} sites is {weeks:.0f} weeks of supply",
            }, units=stock, items=shown, n=sites, weeks=stock / max(sum(r["perWeek"] for r in rows), 1))
            amt = _amt(stock, "units")
        one = businesses[rows[0]["s"]] if sites == 1 else None
        site = one["name"] if one else msg("f.target.site", {"one": "{n} shop", "other": "{n} shops"}, n=sites)
        notes.append(
            _finding(
                "info", site, "target", text,
                key=one["key"] if one else None, rank=-stock, subject=items[0],
                named=tok(slug_of[items[0]], items[0]), worth=worth, amt=amt,
                # One target set too high can span several shops; the panel can
                # only point at a row when a single site owns the finding, and
                # the row it points at is the one the sentence names. Across
                # several shops Supply still lands on a row: the named item's
                # biggest holding (`s`, the shop's index).
                ev={"slug": next(r["slug"] for r in rows if r["item"] == items[0])}
                if one else {"slug": slug_of[items[0]], "s": max(
                    (r for r in rows if r["item"] == items[0]), key=lambda r: (r["stock"], -r["s"]))["s"]},
            )
        )
    return notes


# How a pile of same-shaped findings at one site reads as a single line: n
# findings, and the one named first. A line stands for CONDENSE_AT or more, so
# the "one" forms are there for a translation's plural rules, not the English.
# Registry: "A finding kind" (only if: see the checklist).
SUMMARIES = {
    "shortfall": lambda n, subject: msg("f.sum.shortfall", {
        "one": "{n} item runs dry before its next delivery; soonest {subject}",
        "other": "{n} items run dry before their next delivery; soonest {subject}"}, n=n, subject=subject),
    "order": lambda n, subject: msg("f.sum.order", {
        "one": "{n} weekly order cannot cover its own week; worst {subject}",
        "other": "{n} weekly orders cannot cover their own week; worst {subject}"}, n=n, subject=subject),
    "paused": lambda n, subject: msg("f.sum.paused", {
        "one": "{n} import is paused; soonest to run out is {subject}",
        "other": "{n} imports are paused; soonest to run out is {subject}"}, n=n, subject=subject),
    "outruns": lambda n, subject: msg("f.sum.outruns", {
        "one": "{n} product outsells its daily top-up; worst {subject}",
        "other": "{n} products outsell their daily top-up; worst {subject}"}, n=n, subject=subject),
    "topup": lambda n, subject: msg("f.sum.topup", {
        "one": "{n} product outruns the depot's daily top-up; worst {subject}",
        "other": "{n} products outrun the depot's daily top-up; worst {subject}"}, n=n, subject=subject),
    "wholesale": lambda n, subject: msg("f.sum.wholesale", {
        "one": "{n} product's wholesale deliveries fall short or arrive too late; worst {subject}",
        "other": "{n} products' wholesale deliveries fall short or arrive too late; worst {subject}"},
        n=n, subject=subject),
    "unsourced": lambda n, subject: msg("f.sum.unsourced", {
        "one": "{n} product nothing upstream supplies; largest {subject}",
        "other": "{n} products nothing upstream supplies; largest {subject}"}, n=n, subject=subject),
    "unplanned": lambda n, subject: msg("f.sum.unplanned", {
        "one": "{n} stocked product is on no distribution plan; largest {subject}",
        "other": "{n} stocked products are on no distribution plan; largest {subject}"}, n=n, subject=subject),
    "dead": lambda n, subject: msg("f.sum.dead", {
        "one": "{n} product sits idle; largest {subject}",
        "other": "{n} products sit idle; largest {subject}"}, n=n, subject=subject),
    "notrouted": lambda n, subject: msg("f.sum.notrouted", {
        "one": "{n} product is held where no plan sends it on; largest {subject}",
        "other": "{n} products are held where no plan sends them on; largest {subject}"}, n=n, subject=subject),
    "feed": lambda n, subject: msg("f.sum.feed", {
        "one": "{n} factory input is not fed as the machines need; largest {subject}",
        "other": "{n} factory inputs are not fed as the machines need; largest {subject}"}, n=n, subject=subject),
    "staff": lambda n, subject: msg("f.sum.staff", {
        "one": "{n} factory machine is not staffed round the clock; worst {subject}",
        "other": "{n} factory machines are not staffed round the clock; worst {subject}"}, n=n, subject=subject),
    "unnamed": lambda n, subject: msg("f.sum.unnamed", {
        "one": "{n} factory machine runs a recipe the board cannot name; {subject} the largest",
        "other": "{n} factory machines run recipes the board cannot name; {subject} the largest"},
        n=n, subject=subject),
    "unset": lambda n, subject: msg("f.sum.unset", {
        "one": "{n} factory machine has no recipe set; {subject} the largest",
        "other": "{n} factory machines have no recipe set; {subject} the largest"}, n=n, subject=subject),
    "target": lambda n, subject: msg("f.sum.target", {
        "one": "{n} top-up target is set far above what sells; {subject} the deepest",
        "other": "{n} top-up targets are set far above what sells; {subject} the deepest"}, n=n, subject=subject),
}
CONDENSE_AT = 3  # three or more of a kind at one site becomes one line
# Registry: "A finding kind" (only if: see the checklist).
WORST_FIRST = {"wholesale"}  # condensed by severity first, then rank


def _condense(found: list, gate: float) -> dict:
    # One site is one key; a synthetic site ("3 shops") has none and is its name.
    buckets = collections.OrderedDict()
    for item in found:
        buckets.setdefault((item["siteKey"] or item["site"], item["group"]), []).append(item)

    out = []
    for (where, group), rows in buckets.items():
        if len(rows) < CONDENSE_AT or group not in SUMMARIES:
            out.extend(rows)
            continue
        # A kind whose rows mix severities reads out its worst severity first,
        # the rank breaking ties within it.
        if group in WORST_FIRST:
            rows.sort(key=lambda r: ({"critical": 0, "warn": 1, "info": 2}.get(r["level"], 3), r["rank"]))
        else:
            rows.sort(key=lambda r: r["rank"])
        worst = rows[0]
        worths = [r["worth"] for r in rows if r["worth"] is not None]
        out.append(
            {
                "level": worst["level"],
                "site": worst["site"],
                "siteKey": worst["siteKey"],
                "group": group,
                "text": SUMMARIES[group](len(rows), worst.get("named", worst["subject"])),
                "detail": worst["text"],
                "worth": sum(worths) if worths else None,
                "unit": ALERT_UNITS.get(group, ""),
                # How many findings the line stands for, where it has no money.
                "amt": _amt(len(rows), "orders" if group == "order" else "findings"),
                # The subject is dropped here, so the merged row is keyed on
                # where it is alone.
                "id": _alert_id("summary", group, where),
                "always": any(r["always"] for r in rows),
                # A merged line reads out the worst of its rows, so it points
                # at that row's evidence.
                **({"ev": worst["ev"]} if worst.get("ev") else {}),
            }
        )

    order = {"critical": 0, "warn": 1, "info": 2}
    lines, minor = [], []
    for row in out:
        for key in ("rank", "subject", "named"):
            row.pop(key, None)
        small = (
            not row["always"]
            and row["worth"] is not None
            and abs(row["worth"]) < gate
        )
        row.pop("always")
        if row["worth"] is not None:
            row["worth"] = money(row["worth"])
        (minor if small else lines).append(row)

    lines.sort(key=lambda a: order[a["level"]])
    minor.sort(key=lambda a: -(a["worth"] or 0))
    return {
        "lines": lines,
        "minor": {
            "count": len(minor),
            "gate": round(gate, 2),
            "worth": money(sum(m["worth"] or 0 for m in minor)),
            "rows": minor,
        },
    }


# The board's own helpers and thresholds, read by name from ba_dashboard. It
# imports this module at its end, so they are imported here at the end too:
# either module can then be imported first. Nothing above uses one until a
# finding is built.
from ba_dashboard import (  # noqa: E402
    AMENITY_DEMANDS, HYPE_TIGHT, JOB_DEMANDS, LASTS_CAP, NEW_SITE_DAYS, PROMOTION_CAP, PROMOTION_GAP,
    SIZING_MODES, STAFF_CRITICAL, STAFF_HOURS, TREND_MOVE, _below, _cap_first, _estate_notes, _hour_phrase,
    _idle_parts, _in_order, _plural, _smart_words, _sp_counters, _supply_fact, hood_label, money,
)
