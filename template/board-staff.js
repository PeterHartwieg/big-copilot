/* --- Company > Staff: hiring for every site (docs/dashboard-reference.md) --
   What every planned site still needs, per role, filled first by the people
   the plans already count on (the unassigned bench), then by moving spare
   people between sites, then from the headhunters' candidates; one review and
   one confirm hires, moves and writes the week through the game link
   (gwConfirm, kind "hire"). Everything from here to hrModel() is pure: it
   takes the payload (hiring, candidates, the sites' plans), the filters and
   the player's ticks, and gives back who goes where. Quick hire (hqModel())
   hires the best matches for one role at any site on the same call. Payroll
   is a tab of its own (drawPayroll()). The design and its wording
   are mockup/staff-hire-v2 (NOTES.md). */
const HR_P = {
  move: '<path d="M4 8h13M13 4l4 4-4 4"></path><path d="M20 16H7M11 12l-4 4 4 4"></path>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4 2v-8.5z"></path>',
  search: PATHS.search,
  hq: '<path d="M4 21V9l8-5 8 5v12"></path><path d="M9 21v-6h6v6M9 11h.01M15 11h.01"></path>',
  plus2: '<path d="M12 6v12M6 12h12"></path>',
  x2: '<path d="M7 7l10 10M17 7 7 17"></path>',
  check2: PATHS.tick,
  chev: PATHS.chevRight,
  coin: '<circle cx="12" cy="12" r="8.5"></circle><path d="M14.5 9.5c-.4-.9-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2.1-.6-2.5-1.5M12 6.5V8M12 16v1.5"></path>',
  phone: PATHS.phone,
};
const hrSvg = (name, cls) => `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" aria-hidden="true">${HR_P[name] || GW_P[name] || ""}</svg>`;
const hrName = slug => spEsc(gameName(slug) || String(slug || "").replace(/^ba:[a-z]+_/, ""));
const hrRole = skill => gameName(skill) ? spEsc(gameName(skill)) : gwSkillName(skill);
const hrNum = n => num(Number(n || 0));
const hrWage = n => n == null || !Number.isFinite(Number(n)) ? tt("co.mod.wageNotQuoted", "Unavailable") : `$${num(Number(n), {maximumFractionDigits: 2})}`;
const HR_DAYS = HOUR_ROWS;  // Monday first, as the game's week reads

/* The filters: the company's, and a role's own where Change picks set one.
   Kept per character in this browser; storage may refuse, and the page then
   keeps them for as long as it is open. Part-time is left out by default, and
   the company's Part-time counts for the roles hired into a shop only
   (hrFilterFor); a set kept before that default (no `v`) gets it once. */
const HR_STORE = "ba_dash_hire:";
const HR_PT = "ba:jobdemand_parttime";
let hrFilterMem = null;
const hrCleanFilter = f => ({
  ex: Array.isArray(f && f.ex) ? [...new Set(f.ex.filter(x => typeof x === "string"))] : [],
  min: Number.isFinite(f && f.min) ? f.min : 0,
  max: Number.isFinite(f && f.max) ? f.max : null,
});
function hrFilters(){
  const who = spCharacter() || "";
  if(hrFilterMem && hrFilterMem.who === who) return hrFilterMem;
  let kept = null;
  if(who) kept = rememberedJson(HR_STORE + who);
  const roles = {};
  Object.entries((kept && typeof kept.roles === "object" && kept.roles) || {}).forEach(([k, f]) => { roles[k] = hrCleanFilter(f); });
  const company = hrCleanFilter(kept && kept.company);
  if(!(kept && kept.v >= 2) && !company.ex.includes(HR_PT)) company.ex.push(HR_PT);
  hrFilterMem = {who, company, roles};
  return hrFilterMem;
}
function hrFiltersSave(){
  const f = hrFilters();
  if(!f.who) return;
  rememberJson(HR_STORE + f.who, {v: 2, company: f.company, roles: f.roles});
}
/* The filter a role is picked by: its own, applied as it is, else the
   company's without Part-time, with `pt` saying whether the company's
   Part-time bars its askers from the role's shop weeks (never its other
   sites': the default is per destination). */
function hrFilterFor(skill){
  const f = hrFilters();
  if(f.roles[skill]) return {f: f.roles[skill], pt: false};
  return {f: Object.assign({}, f.company, {ex: f.company.ex.filter(d => d !== HR_PT)}), pt: f.company.ex.includes(HR_PT)};
}
const hrAsksPt = c => (c.demands || []).includes(HR_PT);

/* The player's own ticks on this page: a candidate left out (skip) or added
   over the plan (force), a reassign group unticked; the role open in Change
   picks, and the Quick hire form. Kept while the page is open, for one
   company. */
const hrQuickNew = () => ({skill: "", site: "", n: 1, min: 0, ex: null});
/* Candidates the game hired from this board: {board, ids}, for as long as
   the board is the one they were hired on. */
function hrHiredAdd(ids){
  if(!hrUi.hired || hrUi.hired.board !== D) hrUi.hired = {board: D, ids: new Set()};
  ids.filter(Boolean).forEach(id => hrUi.hired.ids.add(id));
}
const hrUi = {who: null, skip: new Set(), force: new Set(), moveOff: new Set(),
              sheet: null, all: false, out: false, quick: hrQuickNew()};
function hrTicks(){
  const who = `${spCharacter() || ""}|${(D.meta || {}).save || ""}`;
  if(hrUi.who !== who){
    hrUi.who = who;
    [hrUi.skip, hrUi.force, hrUi.moveOff].forEach(s => s.clear());
    hrUi.sheet = null; hrUi.all = false; hrUi.out = false; hrUi.quick = hrQuickNew();
  }
  return hrUi;
}

/* Only a candidate's primary profession qualifies them for hiring work. */
const hrLevel = (c, skill) => {
  if(c.skill !== skill) return null;
  const s = (c.skills || []).find(x => x && x.skill === skill);
  return s ? Number(s.level) || 0 : c.skill === skill ? Number(c.level) || 0 : null;
};
const hrPasses = (c, skill, f) => {
  const lv = hrLevel(c, skill);
  return !c.wageUnavailable && Number.isFinite(c.wage) && lv !== null && lv >= f.min && (f.max === null || Number(c.wage) <= f.max)
    && !(c.demands || []).some(d => f.ex.includes(d));
};
/* Most skilled in the role first, a tie to the lower wage, then the id. */
const hrRank = skill => (a, b) => (hrLevel(b, skill) - hrLevel(a, skill)) || (Number(a.wage) - Number(b.wage))
  || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

/* The schedule demands, judged against the hire week a person would get:
   the game's own rules (JOB_DEMANDS in Python). A demand this table does not
   know is not judged. */
const HR_WINDOWS = {"ba:jobdemand_nomornings": [[6, 10]], "ba:jobdemand_noafternoons": [[14, 16]],
  "ba:jobdemand_noevenings": [[18, 22]], "ba:jobdemand_nonights": [[22, 24], [0, 4]]};
function hrBreaks(slug, w, row){
  const slots = w.slots || [];
  const hours = Number.isFinite(Number(w.hours)) && w.hours !== undefined ? Number(w.hours) : gwHours(slots);
  const days = Number.isFinite(Number(w.days)) && w.days !== undefined ? Number(w.days) : new Set(slots.map(s => s.d)).size;
  /* The hours demands are the game's own (JOB_DEMANDS,
     HoursWorkingPerWeek.Fulfilled), both ends included: a part-timer takes a
     week of 10 to 30 hours (a "part" week, or a "full" one of exactly 30), a
     full-timer 30 to 50. The plan's `band` names the contract a week suits;
     the demand is judged on its hours. */
  switch(slug){
    case "ba:jobdemand_fulltime": return hours < 30 || hours > 50;
    case "ba:jobdemand_parttime": return hours < 10 || hours > 30;
    case "ba:jobdemand_fourdaysweek": return days !== 4;
    case "ba:jobdemand_fivedaysweek": return days !== 5;
    case "ba:jobdemand_freeweekends": return slots.some(s => s.d === 6 || s.d === 0);
    case "ba:jobdemand_nocleaning": return slots.some(s => {
      const sh = row && (row.shifts || [])[s.shift];
      return sh ? sh.k === "clean" : w.skill === "ba:skill_cleaning";
    });
  }
  const win = HR_WINDOWS[slug];
  return !!win && slots.some(s => win.some(([lo, hi]) => lo < s.t && s.f < hi));
}
const hrKind = slug => ((D.hiring || {}).demandKinds || {})[slug] || null;

/* A planned site's plan as the Staff page reads it: a shop the plan its
   Staffing block is on (spPlanOf()); a factory the sizing on Supply; an
   office its own. `row` is the plan row the hire weeks point into. */
function hrVariant(site){
  const plans = site.plans || {};
  if(site.kind === "shop"){
    /* Full cover (24/7) only where the player picked it on the shop's
       Staffing block: its week is cut against 0 to 24 and its write opens
       the shop around the clock (hrRequest()). Staff writes never open a
       shop otherwise. A payload with no `full` plan falls back to the
       open-hours plan, as before 29 September 2026. */
    const on = spPlanOf(spRosterRow(site.key));
    if(on === "full" && plans.full) return "full";
    if(plans.open && (on === "open" || on === "full" || !plans.demand)) return "open";
    return plans.demand ? "demand" : null;
  }
  if(site.kind === "factory") return plans[sizing] ? sizing : Object.keys(plans)[0] || null;
  if(site.kind === "office" && plans.open && spOfficePlanOf(site.key) === "open") return "open";
  return plans.office ? "office" : Object.keys(plans)[0] || null;
}
function hrPlanRow(site, variant){
  if(site.kind === "shop"){
    const base = spRosterRow(site.key);
    if(!base || base.failed) return null;
    if(variant === "open" && base.openCover) return spOpenRow(base);
    return variant === "full" && base.fullCover ? spFullRow(base) : base;
  }
  if(site.kind === "factory") return (((D.factoryStaffing || {})[variant]) || []).find(r => r.key === site.key && !r.failed) || null;
  const offices = D.officeStaffing;
  const list = Array.isArray(offices) ? offices : ((offices || {})[variant] || []);
  const row = list.find(r => r.key === site.key && !r.failed);
  return (variant === "open" ? row?.openCover : row) || null;
}
/* Who a person is: the hiring payload's own table ({name, skills, wage,
   site, hours, demands}), else the plan's (a name). Their role is their
   best skill, and a move keeps to it. */
const hrPerson = (id, row) => {
  const had = ((D.hiring || {}).people || {})[id];
  const p = Object.assign({id}, had || ((row || {}).people || []).find(x => x.id === id) || {});
  if(!p.skill){
    const top = (p.skills || []).filter(x => x && x.skill).sort((a, b) => (Number(b.level) || 0) - (Number(a.level) || 0))[0];
    if(top){ p.skill = top.skill; p.level = Number(top.level) || 0; }
  }
  return p;
};

/* The contract a candidate asks for: "part", "full" or none. */
const hrWants = c => hrAsksPt(c) ? "part" : (c.demands || []).includes("ba:jobdemand_fulltime") ? "full" : null;
/* The week to give candidate `c` from weeks that fit them (`pool`, site list
   order). The fewest people for the hours: the first site in list order with
   a week of the contract they ask for (a part-timer a "part" week, a
   full-timer a "full" one), else the first with a week some contract suits,
   else the first with any; there, a week of
   their own contract, else any; among those the best tier first (a week
   too short for any contract last, which only one ticked in by hand gets,
   and for someone who asks for neither a 30 h week, which either contract
   may take, after the others), and only within that tier a desk that meets
   their desk demands. */
function hrPickWeek(c, pool){
  const want = hrWants(c);
  const own = want ? pool.filter(x => x.w.band === want) : [];
  /* With none of their own contract, a site with a week a contract suits
     before one whose only week is too short for any. */
  const real = pool.filter(x => x.w.band !== "short");
  const S = (own.length ? own : real.length ? real : pool)[0].S;
  const rank = x => (x.w.band === "short" ? 2 : 0) + (!want && Number(x.w.hours) === 30 ? 1 : 0);
  const here = pool.filter(x => x.S === S).map((x, i) => [x, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(e => e[0]);
  const pref = want ? here.filter(x => x.w.band === want) : [];
  const set = pref.length ? pref : here;
  const top = set.filter(x => rank(x) === rank(set[0]));
  return top.find(x => !hrDeskMiss(c.demands, S, x.w).length) || set[0];
}
/* The schedule demands a person's week `x` ({w, S}) breaks, and whether it
   breaks none: the hard filter automatic picks and moves go through. */
const hrFails = (p, x) => (p.demands || []).filter(d => hrKind(d) === "schedule" && hrBreaks(d, x.w, x.S && x.S.row));
const hrFits = (p, x) => !hrFails(p, x).length;
/* The page's whole answer, deterministic for one payload, one set of
   filters and one set of ticks:
     sites  one per hiring site: {site, b, variant, plan, row, weeks, planned}
            with weeks [{w, j, S, who}] in the payload's order; who is
            {type: "move", m} or {type: "hire", c, misfit: [slugs]}
     moves  the bench the plans count on (fixed), then spares and the
            unassigned moved to a week in their own role (group, off)
     roles  one per skill with hire weeks: pool, picked, short, pass, out,
            shop / allShop (some / every week at a shop), f, the filter it
            is picked by, pt (the company's Part-time bars its shop weeks)
            and passes(c)
     quick  Quick hire's plan (hrQuickPlan()), made before the roles: its
            picks win, and its weeks are not the roles'
     overs  candidates ticked over the plan: {c, S, skill}
     used   candidate id -> the site they are picked for */
function hrModel(){
  const H = D.hiring || {sites: []};
  const ui = hrTicks();
  const byKey = new Map((D.businesses || []).map(b => [b.key, b]));
  const sites = (H.sites || []).map((site, i) => {
    const variant = site.planned ? hrVariant(site) : null;
    const plan = variant ? (site.plans || {})[variant] || {} : {};
    const S = {site, i, key: site.key, b: byKey.get(site.key) || null, variant, plan,
               row: variant ? hrPlanRow(site, variant) : null, planned: !!site.planned, weeks: []};
    /* Only weeks in a role the site takes: the game refuses a hire for any
       other (`no_skill`), and the plan leaves such stations out anyway. */
    const takes = new Set(site.accepts || []);
    S.weeks = (plan.hireWeeks || []).map((w, j) => ({w, j, S, who: null})).filter(x => takes.has(x.w.skill));
    return S;
  });
  const moves = [];
  /* Someone in training: the game's move turns them away, so nobody in
     training is moved or assigned from here. */
  const training = id => !!(((H.people || {})[id] || {}).training);
  /* 1. The unassigned people a plan already counts on: assigned there. */
  sites.forEach(S => (S.plan.bench || []).forEach(id => {
    if(training(id)) return;
    const p = hrPerson(id, S.row);
    moves.push({id, p, from: null, to: S, week: null, skill: p.skill || null, fixed: true, group: `bench|${S.key}`});
  }));
  /* 2. Spare people, and the unassigned nobody plans on, into another site's
     week in their primary profession; the sites' spares in list order,
     then the rest. Secondary spare-role metadata cannot qualify them for
     another profession. Their schedule demands
     are a hard filter (Peter, 28 September 2026): only a week that meets
     them all, at the first site in list order that has one, and there the
     one at a desk that meets their desk demands first. Nobody is moved into
     a week they would not keep; they stay spare. */
  const counted = new Set(sites.flatMap(S => S.plan.bench || []));
  const spares = [];
  sites.forEach(S => (S.plan.spare || []).forEach(id => spares.push({id, from: S})));
  (H.bench || []).filter(id => !counted.has(id)).forEach(id => spares.push({id, from: null}));
  const moved = new Set();
  spares.forEach(({id, from}) => {
    if(moved.has(id) || training(id)) return;
    const p = hrPerson(id, from && from.row);
    const best = p.skill ? [p.skill] : [];
    const roles = (from ? ((from.plan.spareSkills || {})[id] || best) : best)
      .filter(skill => skill === p.skill);
    const level = k => { const x = (p.skills || []).find(y => y && y.skill === k); return x ? Number(x.level) || 0 : k === p.skill ? Number(p.level) || 0 : -1; };
    const ordered = roles.slice().sort((a, b) => level(b) - level(a));
    for(const skill of ordered){
      const fit = sites.filter(x => x !== from && (x.site.accepts || []).includes(skill))
        .flatMap(x => x.weeks.filter(y => !y.taken && y.w.skill === skill && hrFits(p, y)));
      if(!fit.length) continue;
      const S = fit[0].S, open = fit.filter(y => y.S === S);
      const wk = open.find(y => !hrDeskMiss(p.demands, S, y.w).length) || open[0];
      wk.taken = true;
      moved.add(id);
      const lv = level(skill);
      const m = {id, p: Object.assign({}, p, {skill, level: lv >= 0 ? lv : undefined}), from, to: S, week: wk, skill,
                 group: `${from ? from.key : "bench"}|${S.key}|${skill}`};
      m.off = ui.moveOff.has(m.group);
      if(!m.off) wk.who = {type: "move", m};
      moves.push(m);
      break;
    }
  });
  sites.forEach(S => S.weeks.forEach(x => { delete x.taken; }));
  /* 3. The candidates, less anyone the game has just hired from this board
     (they are staff now, until the board reads the game again); Quick hire
     first, then each role most skilled first, nobody picked twice. */
  const hired = hrUi.hired && hrUi.hired.board === D ? hrUi.hired.ids : null;
  const cands = (D.candidates || []).filter(c => !(hired && hired.has(c.id)));
  const byId = new Map(cands.map(c => [c.id, c]));
  const used = new Map();  // candidate id -> the site they are picked for
  const quick = hrQuickPlan(sites, cands, used);
  const mine = S => S.weeks.filter(x => !(x.who && x.who.type === "quick"));
  const skills = new Map();
  sites.forEach(S => mine(S).forEach(x => skills.set(x.w.skill, (skills.get(x.w.skill) || 0) + 1)));
  const order = [...skills.keys()].sort((a, b) => skills.get(b) - skills.get(a) || gnCompare(gameName(a) || a, gameName(b) || b));
  const overs = [];
  const roles = order.map(skill => {
    const {f, pt} = hrFilterFor(skill);
    const pool = cands.filter(c => hrLevel(c, skill) !== null).sort(hrRank(skill));
    const weeks = sites.flatMap(S => mine(S).filter(x => x.w.skill === skill));
    const atShop = x => x.S.site.kind === "shop";
    const shop = weeks.some(atShop), allShop = weeks.every(atShop);
    const open = weeks.filter(x => !x.who);
    /* The shop default that leaves Part-time askers out predates part-time
       weeks: it bars them from full-time shop weeks only, and a role with an
       open part-time week lets them in (PR #187's `band`). */
    const partOpen = open.some(x => x.w.band === "part");
    /* A Part-time asker passes a role with a week they may take. */
    const passes = c => hrPasses(c, skill, f) && !(pt && allShop && !partOpen && hrAsksPt(c));
    /* Weeks too short for any contract are no places: counted nowhere. */
    const places = weeks.filter(x => x.w.band !== "short");
    const role = {skill, f, pt, shop, allShop, passes, own: !!hrFilters().roles[skill], pool, weeks, need: open.length,
                  moved: places.filter(x => x.who).length, picked: [], pass: 0, out: 0, at: new Map()};
    pool.forEach(c => {
      const forced = ui.force.has(c.id);
      const pass = passes(c);
      if(pass) role.pass++; else role.out++;
      if(!pass && !forced) return;
      if(used.has(c.id)){ role.at.set(c.id, {elsewhere: used.get(c.id)}); return; }
      if(ui.skip.has(c.id)) return;
      const barred = x => pt && !forced && hrAsksPt(c) && atShop(x) && x.w.band !== "part";
      /* A week too short for any contract (`band` "short") is no hire's
         unless the player ticks one in by hand. */
      const free = open.filter(x => !x.who && !barred(x) && (forced || x.w.band !== "short"));
      /* Their schedule demands are a hard filter (Peter, 28 September 2026):
         the first site in list order with a week they meet, at every site's
         open weeks of the role; there the one at a desk that meets their
         desk and chair demands first, the weeks of a role being otherwise
         interchangeable. Nobody no week fits is picked: the next best is.
         Only someone the player ticks in by hand (Change picks) takes a week
         that breaks a demand, the first free one, and is hired anyway,
         warned. */
      const fits = free.filter(x => hrFits(c, x));
      if(fits.length || (free.length && forced)){
        const wk = hrPickWeek(c, fits.length ? fits : free);
        wk.who = {type: "hire", c, misfit: fits.length ? [] : hrFails(c, wk)};
        role.picked.push(c);
        role.at.set(c.id, {week: wk});
        used.set(c.id, wk.S);
      } else if(free.length){
        role.at.set(c.id, {nofit: true});
      } else if(forced){
        const S = weeks.length ? weeks[0].S : null;
        if(!S) return;
        overs.push({c, S, skill});
        role.picked.push(c);
        role.at.set(c.id, {over: S});
        used.set(c.id, S);
      }
    });
    /* Places that stay open; a week too short for any contract is no place,
       only hours no hire can take (`tooFew`). */
    role.short = open.filter(x => !x.who && x.w.band !== "short").length;
    role.tooFew = open.filter(x => !x.who && x.w.band === "short").reduce((n, x) => n + Number(x.w.hours || 0), 0);
    return role;
  });
  return {sites, moves, roles, overs, cands, byId, used, quick};
}

/* A desk or chair demand against a week: whether one of the stations the week
   puts them on stands in furniture that meets it (the site's `stations`), the
   game's own test. No week, no station: the game leaves their list empty. */
const hrDeskMet = (slug, S, w) => !!(S && w) && (w.slots || []).some(sl =>
  (((S.site.stations || {})[String(sl.station)]) || []).includes(slug));
const hrDeskAnywhere = (slug, S) => !!S && Object.values(S.site.stations || {}).some(l => (l || []).includes(slug));
/* The desk and chair demands a week of this site leaves unmet. */
const hrDeskMiss = (demands, S, w) => (demands || []).filter(d => hrKind(d) === "station" && !hrDeskMet(d, S, w));
/* A demand of someone going to a site, as the page judges it: "ok", "warn"
   (not met here, met at another planned site, or at another desk here), "no"
   (met nowhere) or null (not judged). Schedule demands are judged against
   their week, desk and chair demands against the stations it is on. */
function hrDemandAt(m, slug, S, wk){
  const kind = hrKind(slug);
  if(kind === "schedule") return wk ? (hrBreaks(slug, wk.w, S && S.row) ? "warn" : "ok") : null;
  if(kind === "station"){
    if(!S) return null;
    if(hrDeskMet(slug, S, wk && wk.w)) return "ok";
    /* No week (a site with no plan, the headquarters): the player seats them. */
    if(!(wk && wk.w)) return hrDeskAnywhere(slug, S) || m.sites.some(x => hrDeskAnywhere(slug, x)) ? "warn" : "no";
    return m.sites.some(x => x.planned && hrDeskAnywhere(slug, x)) ? "warn" : "no";
  }
  if(kind === "company"){
    const c = ((D.hiring || {}).company || {})[slug];
    /* "plan": an HR manager's plan offers it, but a hire joins none until
       the player adds them to it. */
    return c === undefined ? null : c === "plan" ? "warn" : c ? "ok" : "no";
  }
  if(kind === "site"){
    const here = S ? (S.site.facts || {})[slug] : undefined;
    if(here === undefined) return null;
    if(here) return "ok";
    return m.sites.some(x => x.planned && (x.site.facts || {})[slug]) ? "warn" : "no";
  }
  return null;
}
/* The warnings a placed candidate carries: the demands their place does not
   meet. They never stop a pick. */
function hrWarns(m, c, S, wk){
  return (c.demands || []).map(d => [d, hrDemandAt(m, d, S, wk)]).filter(([, t]) => t === "warn" || t === "no");
}

/* Totals the order panel and the review share. */
function hrTotals(m){
  const hires = m.sites.flatMap(S => S.weeks.filter(x => x.who && x.who.type === "hire"));
  const moves = m.moves.filter(x => !x.off);
  const touched = new Set([...hires.map(x => x.S.key), ...moves.map(x => x.to.key), ...m.overs.map(x => x.S.key)]);
  const bill = hires.reduce((n, x) => n + Number(x.who.c.wage || 0) * Number(x.w.hours || 0) / 7, 0);
  return {hire: hires.length + m.overs.length, weeks: hires, move: moves.length, moves, sites: touched.size,
          bill, short: m.roles.reduce((n, r) => n + r.short, 0)};
}

/* --- the write: POST /write/hire (docs/game-link-api.md) ------------------ */
/* The week a touched site gets: its plan's entries with somebody on them,
   and each hire week's entries with the person put on it. A week nobody
   fills stays empty. An unassigned person the plan counts on keeps their
   entries only when this call assigns them here (`arriving`): a "Pick
   more" that sends no move leaves them empty. The
   write replaces all seven days, so the shifts the plan does not own stay
   as the game has them, except for anyone this call moves away: a
   cover-only shop plan's serving entries, and at a factory or an office
   every shift on a station the plan does not staff (the drivers', the
   cleaners'). The plan's entries win where one of those overlaps them: the
   kept shift is cut around them, and the hours cut off are added to
   `lost.hours` for the review.
   `o.additive`: a site outside the action's scope that somebody is moved to
   (Staff this site's own spare reassigned there): no plan entry at all, the
   game's week as it is, every entry kept whole, with the mover's entries
   added on hours free there (hrFitsFree()).
   `o.stranded`: filled with the site's own people who end the week with no
   hours here (see `stay` below), for the review to name. */
/* Whether the week found for a move `x` lies inside its shop's opening hours
   (a factory's or an office's always does): a shop outside the action's
   scope is written additively and never opened around the clock. */
const hrFitsOpen = x => {
  if(!x.week || x.to.site.kind !== "shop") return true;
  const open = (spRosterRow(x.to.key) || {}).open || [];
  return (x.week.w.slots || []).every(sl => (open[sl.d] || []).some(([a, b]) => a <= sl.f && sl.t <= b));
};
/* Whether every hour of that week is free at its station in the site's week
   as the game has it: an additive week never cuts anybody's hours there. */
const hrFitsFree = x => {
  if(!x.week) return true;
  const row = x.to.row || {}, st = i => ((row.stations || [])[i] || {}).id;
  const now = (row.current || {}).list || [];
  return (x.week.w.slots || []).every(sl => {
    const sh = (row.shifts || [])[sl.shift], at = sl.station || (sh && st(sh.s));
    return !now.some(s => s.d === sl.d && st(s.s) === at && s.f < sl.t && sl.f < s.t);
  });
};
/* Where one site's action can send its own spare `x` (a move of the page's
   model, or one it made for a spare the model did not move): the model's own
   week first; then, as hrModel() picks, their primary profession and the
   first site in list order with an
   open week that meets their schedule demands, lies inside its opening hours
   and on hours free there (every site but theirs is outside that action's
   scope), a desk that meets their desk demands first. {x: the move with that
   week}, or {why: "closed" | "busy", S} for the first week it had to pass
   over, or {why: "none"}. `taken`: weeks already given to another spare. */
function hrOutWeek(m, x, taken){
  const p = x.p || {};
  const level = k => { const v = (p.skills || []).find(y => y && y.skill === k); return v ? Number(v.level) || 0 : k === p.skill ? Number(p.level) || 0 : -1; };
  const roles = (((x.from.plan.spareSkills || {})[x.id]) || (x.skill ? [x.skill] : [])).slice()
    .filter(skill => skill === p.skill)
    .sort((a, b) => level(b) - level(a) || String(a).localeCompare(String(b)));
  let why = null;
  const at = y => {
    if(y.w.skill !== p.skill) return null;
    const lv = level(y.w.skill);
    const mv = Object.assign({}, x, {to: y.S, week: y, skill: y.w.skill, group: `${x.from.key}|${y.S.key}|${y.w.skill}`,
      p: Object.assign({}, p, {skill: y.w.skill, level: lv >= 0 ? lv : undefined})});
    if(!hrFitsOpen(mv)){ why = why || {why: "closed", S: y.S}; return null; }
    if(!hrFitsFree(mv)){ why = why || {why: "busy", S: y.S}; return null; }
    return mv;
  };
  if(x.week && !taken.has(x.week)){ const mv = at(x.week); if(mv) return {x: mv}; }
  for(const skill of roles){
    const ok = m.sites.filter(S => S !== x.from && (S.site.accepts || []).includes(skill))
      .flatMap(S => S.weeks.filter(y => y !== x.week && !taken.has(y) && y.w.skill === skill && hrFits(p, y)))
      .map(y => ({y, mv: at(y)})).filter(z => z.mv);
    if(!ok.length) continue;
    const here = ok.filter(z => z.y.S === ok[0].y.S);
    return {x: (here.find(z => !hrDeskMiss(p.demands, z.y.S, z.y.w).length) || here[0]).mv};
  }
  return why || {why: "none"};
}
/* One site's own spares, where its action can send each (hrOutWeek()): id ->
   {x} or {why, S}. Every spare its plan names, not only those the
   company-wide model moved (a week another site's spare took there is free
   when only this site is staffed); nobody in training. A ticked spare's own
   model week, where the action can write it, is theirs before any fallback
   search; an unticked one's is said as theirs too (the advice is what
   ticking would do) but reserved for nobody. */
function hrOutPlan(m, S0){
  const out = new Map();
  if(!S0) return out;
  const model = new Map(m.moves.filter(x => x.from === S0).map(x => [x.id, x]));
  const people = (D.hiring || {}).people || {};
  const spares = [...new Set([...(S0.plan.spare || []), ...model.keys()])]
    .filter(id => !(people[id] || {}).training).map(id => model.get(id) || (() => {
      const q = hrPerson(id, S0.row);
      return {id, p: q, from: S0, to: null, week: null, skill: q.skill || null, off: false, group: null};
    })());
  const taken = new Set();
  spares.forEach(x => {
    if(!x.week || !hrFitsOpen(x) || !hrFitsFree(x)) return;
    out.set(x.id, {x});
    if(!x.off) taken.add(x.week);
  });
  spares.forEach(x => {
    if(out.has(x.id)) return;
    const r = hrOutWeek(m, x, taken);
    out.set(x.id, r);
    if(r.x && !x.off) taken.add(r.x.week);
  });
  return out;
}
function hrWeek(S, fill, away, arriving, lost, o = {}){
  const row = S.row || {};
  const days = new Map();
  const put = (d, f, t, employeeId, itemInstanceId) => {
    if(!(d >= 0 && d < 7) || !spHasId(employeeId) || !spHasId(itemInstanceId)) return;
    if(!days.has(d)) days.set(d, []);
    days.get(d).push({f, t, employeeId, itemInstanceId});
  };
  const bench = new Set(S.plan.bench || []);
  if(!o.additive) (row.shifts || []).forEach(s => {
    if(spNobody(s.p)) return;
    const st = (row.stations || [])[s.s], who = (row.people || [])[s.p];
    if(!st || !who || away.has(who.id)) return;
    if(bench.has(who.id) && !(arriving && arriving.has(who.id))) return;
    put(s.d, s.f, s.t, who.id, st.id);
  });
  fill.forEach(({id, w}) => (w.slots || []).forEach(sl => {
    const sh = (row.shifts || [])[sl.shift];
    const st = sh ? (row.stations || [])[sh.s] : null;
    put(sl.d, sl.f, sl.t, id, sl.station || (st && st.id));
  }));
  const flat = () => [...days].flatMap(([d, list]) => list.map(x => Object.assign({d}, x)));
  const now = (row.current || {}).list || [];
  const idOf = s => ((row.people || [])[s.p] || {}).id;
  /* The shifts the plan does not own that stay as the game has them (a
     cover-only shop's serving entries; a factory's or an office's stations
     the plan does not staff). */
  const kept = new Set();
  if(o.additive) now.forEach(s => kept.add(s));
  else if(S.site.kind === "shop"){
    if(!row.full && spCoverOnly(row)) now.filter(s => !s.k).forEach(s => kept.add(s));
  } else {
    const owned = new Set((row.shifts || []).map(s => s.s));
    now.filter(s => spOfficeReplaces(row) && S.site.kind === "office"
      ? s.k || !gwOfficeComputers(row).has(s.s)
      : !owned.has(s.s) && !((row.stations || [])[s.s] || {}).skill).forEach(s => kept.add(s));
  }
  /* The site's own people with hours here now and no entry in this week, whom
     the call does not move away. The plan staffs its hours with the fewest
     people (Peter, 29 September 2026): nobody's planned hours are cut to keep
     somebody else on, and a spare no open week elsewhere takes ends the week
     with no hours here. Whoever that leaves with none is named in the review
     (`o.stranded`), with why. */
  const inWeek = new Set(flat().map(x => x.employeeId));
  const stay = [...new Set(now.map(idOf))].filter(id => spHasId(id) && !away.has(id) && !inWeek.has(id));
  const planned = flat();
  const keep = s => {
    const st = (row.stations || [])[s.s], who = (row.people || [])[s.p];
    if(!st || !who || away.has(who.id)) return;
    /* The parts of the shift no planned entry for the same person or
       station covers; an additive week keeps it whole (the mover's hours
       are free there, hrFitsFree()). */
    let parts = [[s.f, s.t]];
    if(!o.additive) planned.filter(x => x.d === s.d && (x.employeeId === who.id || x.itemInstanceId === st.id)).forEach(x => {
      parts = parts.flatMap(([f, t]) => x.t <= f || t <= x.f ? [[f, t]] : [[f, Math.min(t, x.f)], [Math.max(f, x.t), t]].filter(([a, b]) => a < b));
    });
    const kept = parts.reduce((n, [f, t]) => n + t - f, 0);
    if(lost && kept < s.t - s.f) lost.hours = (lost.hours || 0) + (s.t - s.f - kept);
    /* An entry the game holds past the grid's 12 hours (an older build could
       leave one) goes back as the same hours in pieces of 12 at most: the
       write replaces the week whole, and the grid refuses a longer entry. */
    parts.forEach(([f, t]) => { for(let a = f; a < t; a += GW_CAP) put(s.d, a, Math.min(t, a + GW_CAP), who.id, st.id); });
  };
  now.filter(s => kept.has(s)).forEach(keep);
  if(o.stranded && !o.additive){
    const has = new Set(flat().map(x => x.employeeId));
    stay.filter(id => !has.has(id)).forEach(id => o.stranded.push(id));
  }
  return [...days].sort((a, b) => a[0] - b[0]).map(([d, shifts]) => ({d, shifts: shifts.sort((a, b) => a.f - b.f || a.t - b.t)}));
}
/* How many people Staff this site would hire or reassign into a site (never
   the site's own people it reassigns out): its
   share of the Staff page's plan. None where the site plans no staffing, or
   the board has no hiring payload. */
let hrSiteMemo = null;  // {board, key, model}: one Staff page model a board and a set of picks
/* The Staff page's model for this board and these picks, made once for
   every site block that asks. */
function hrMemoModel(){
  /* The model is the Staff page's, which the filters, the ticks and a Quick
     hire's hold decide; a site block asks twice as it draws. */
  const ui = hrTicks(), set = x => [...(x || [])].sort().join(",");
  const picks = [JSON.stringify(hrFilters()), set(ui.skip), set(ui.force), set(ui.moveOff), String(ui.quickHold || ""),
    JSON.stringify(ui.quick), ui.hired && ui.hired.board === D ? set(ui.hired.ids) : "",
    /* The plan each site is on (a shop's pick of full cover, the factories'
       sizing on Supply) decides its weeks too. */
    (((D.hiring || {}).sites) || []).map(x => x.planned ? hrVariant(x) || "" : "").join(",")].join("|");
  if(!hrSiteMemo || hrSiteMemo.board !== D || hrSiteMemo.key !== picks) hrSiteMemo = {board: D, key: picks, model: hrModel()};
  return hrSiteMemo.model;
}
/* Why an open week `x` stays open: a reassign that would take it is
   unticked ({off: move}), or everybody of its role who is free -- candidates
   nobody picked, spares at other sites and unassigned staff nobody moves --
   asks for something the week breaks ({demand}, the one most of them ask
   for). Null where somebody free could take it (the filters or the picks
   left it) or nobody of the role is free. */
function hrGapWhy(m, x){
  const off = (m.moves || []).find(v => v.off && v.week === x);
  if(off) return {off};
  const skill = x.w.skill, H = D.hiring || {};
  const r = (m.roles || []).find(y => y.skill === skill);
  const moved = new Set((m.moves || []).filter(v => !v.off).map(v => v.id));
  const free = r ? r.pool.filter(c => r.passes(c) && !m.used.has(c.id)) : [];
  const training = id => !!((H.people || {})[id] || {}).training;
  (m.sites || []).forEach(S => (S.plan.spare || []).forEach(id => {
    if(S === x.S || moved.has(id) || training(id)) return;
    const q = hrPerson(id, S.row), roles = ((S.plan.spareSkills || {})[id]) || [q.skill];
    if(q.skill === skill && roles.includes(skill)) free.push(q);
  }));
  (H.bench || []).forEach(id => {
    if(moved.has(id) || training(id)) return;
    const q = hrPerson(id, null);
    if(q.skill === skill) free.push(q);
  });
  if(!free.length || free.some(c => !hrFails(c, x).length)) return null;
  const count = new Map();
  free.forEach(c => hrFails(c, x).forEach(d => count.set(d, (count.get(d) || 0) + 1)));
  const top = [...count].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0];
  return top ? {demand: top[0]} : null;
}
/* The why, short, for a site's row in the review. */
const hrGapWhyShort = (m, x) => {
  const w = hrGapWhy(m, x);
  return !w ? "" : w.off ? tt("co.hire.p.off", "a reassign that takes it is unticked")
    : tt("co.hire.p.askfor", "the free {role} people ask for {demand}", {role: hrRole(x.w.skill), demand: hrName(w.demand)});
};
/* The why, a sentence, for the review's gap line. */
const hrGapWhySentence = (m, S, x) => {
  const w = hrGapWhy(m, x), site = spEsc(S && S.b ? shortName(S.b) : tt("co.hire.asite.cap", "A site"));
  return !w ? "" : w.off ? tt("co.hire.gap.off", "<b>{site}</b>: a reassign that would take this week is unticked.", {site})
    : tt("co.hire.gap.askfor.site", "<b>{site}</b>: the free {role} people ask for {demand}.", {site, role: hrRole(x.w.skill), demand: hrName(w.demand)});
};
/* How many sites Staff all sites would write or assign at. */
function hrAllSites(){
  if(!D.hiring) return 0;
  const r = hrRequest(hrMemoModel(), {mode: "both", one: true});
  return r.body.sites.length;
}
function hrSitePeople(key){
  const site = ((D.hiring || {}).sites || []).find(s => s.key === key);
  if(!site || !site.planned) return 0;
  hrMemoModel();
  const r = hrRequest(hrSiteMemo.model, {mode: "hire", site: key, one: true});
  /* Hired or reassigned into it; its own spare reassigned out is not one of them. */
  return r.body.hires.length + r.body.moves.filter(x => gwKeyOf(x.to) === key).length;
}
/* The site's own spares Staff this site would reassign out (item 7 of the
   in-game test: a site whose only staffing work is its spares moving). */
function hrSiteOut(key){
  const site = ((D.hiring || {}).sites || []).find(s => s.key === key);
  if(!site || !site.planned) return 0;
  const r = hrRequest(hrMemoModel(), {mode: "hire", site: key, one: true});
  return r.body.moves.filter(x => x.from && gwKeyOf(x.from) === key).length;
}
/* The people elsewhere who fit this site's open weeks: spares at other
   sites and unassigned staff the page moves in (not the plan's own bench,
   which `addPeople` names already), by role. Said before "hire N": they come
   first, and only the rest are hires. */
function hrFromElsewhere(key){
  const by = new Map(), hours = new Map();
  if(!D.hiring) return {n: 0, by, hours};
  hrMemoModel().moves.filter(x => !x.off && !x.fixed && x.to && x.to.key === key).forEach(x => {
    by.set(x.skill, (by.get(x.skill) || 0) + 1);
    hours.set(x.skill, (hours.get(x.skill) || 0) + Number((x.week && x.week.w.hours) || 0));
  });
  return {n: [...by.values()].reduce((a, b) => a + b, 0), by, hours};
}
/* The plan's "add these people" less those who can come from other sites:
   {add (hires reduced by role), from (how many can come)}. The hours stay
   whole: they are empty until somebody actually works them, and a
   schedule-only write leaves a mover's hours empty until Staff this site
   moves them. Only with a mod that hires: without one nothing is moved from
   here, so the full count stands. */
function hrAddLess(key, add){
  const {by} = hrFromElsewhere(key);
  if(!add || !by.size || !hrCanHire()) return {add, from: 0};
  let from = 0;
  const hire = (add.hire || []).map(x => {
    const k = Math.min(x.people || 0, by.get(x.skill) || 0);
    from += k;
    return Object.assign({}, x, {people: (x.people || 0) - k});
  }).filter(x => x.people > 0);
  return {add: Object.assign({}, add, {hire, people: Math.max(0, (add.people || 0) - from)}), from};
}
/* A plan row with its hiring counts less the people who can come from other
   sites (hrAddLess()): `headcount[skill].hire`, `addPeople`, and
   `fromOthers` / `fromHand` for the note. Every hiring read-out reads the
   row this gives, so they agree. */
function spRowLess(row){
  if(!row || !row.key || row.fromOthers !== undefined) return row;
  const {by, hours} = hrFromElsewhere(row.key);
  const raw = [...by.values()].reduce((a, b) => a + b, 0);
  if(!raw) return Object.assign({}, row, {fromOthers: 0, fromHand: 0});
  if(!hrCanHire()) return Object.assign({}, row, {fromOthers: 0, fromHand: raw});
  const headcount = {};
  let from = 0;
  Object.entries(row.headcount || {}).forEach(([skill, h]) => {
    const k = Math.min(h.hire || 0, by.get(skill) || 0);
    from += k;
    /* The new wages lose the hours of the weeks the movers take. */
    const took = k ? Math.round((hours.get(skill) || 0) * k / (by.get(skill) || 1)) : 0;
    headcount[skill] = Object.assign({}, h, {hire: (h.hire || 0) - k},
      h.hireHours !== undefined ? {hireHours: Math.max(0, (Number(h.hireHours) || 0) - took)} : {});
  });
  const less = row.addPeople ? hrAddLess(row.key, row.addPeople) : {add: row.addPeople, from: 0};
  return Object.assign({}, row, {headcount, addPeople: less.add, fromOthers: Math.max(from, less.from), fromHand: 0});
}
/* "N can come from other sites": with a mod that hires, Staff this site
   does it; without, the player reassigns them by hand. Its own class: a
   note, not a step to tick. */
const hrFromCall = (row, lift) => {
  const n = (row && row.fromOthers) || 0, m = (row && row.fromHand) || 0;
  const text = n ? tt("co.hire.elsewhere", {
      one: "<b>{n} person can come from another site</b>: Staff this site reassigns them.",
      other: "<b>{n} people can come from other sites</b>: Staff this site reassigns them."}, {n})
    : m ? tt("co.hire.elsewhere.hand", {
      one: "<b>{n} person at another site fits these hours</b>: reassign them in MyEmployees, then hire only the rest. Staffing › Staff needs names them.",
      other: "<b>{n} people at other sites fit these hours</b>: reassign them in MyEmployees, then hire only the rest. Staffing › Staff needs names them."}, {n: m})
    : "";
  return !text ? "" : lift ? gwLiftCall("info", "hire", text) : `<div class="hr-from">${gwCall("info", "hire", text)}</div>`;
};
/* A mod that takes the hire write: Staff this site stands in for the step
   that sends the player to MyEmployees only then. */
const hrCanHire = () => { const l = gwLink(); return !!l && (l.writes || []).includes("hire"); };
/* Whether the linked mod takes the whole staffing action in one call, undone
   in one step (docs/game-link-api.md: /health `features` lists
   "hire.reschedule" and "hire.undo", mod 0.4.0). An older mod hires and moves
   in one call, and the other weeks follow one by one, with no undo. */
const hrOneCall = () => {
  const f = (gwLink() || {}).features;
  return Array.isArray(f) && f.includes("hire.reschedule") && f.includes("hire.undo");
};
/* The game's week at a site, entry for entry, against the one a write would
   send: whether writing it changes anything. The entries of people the call
   moves away do not count, since the game's move clears them itself; a full
   cover week at a shop not yet open around the clock always does. */
function hrDiffers(row, days, away){
  if(row.full && !row.openNow) return true;
  const line = (d, s) => [d, s.f, s.t, s.employeeId, s.itemInstanceId].join("|");
  const want = days.flatMap(({d, shifts}) => shifts.map(s => line(d, s))).sort();
  const have = ((row.current || {}).list || []).map(s => ({d: s.d, f: s.f, t: s.t,
    employeeId: ((row.people || [])[s.p] || {}).id, itemInstanceId: ((row.stations || [])[s.s] || {}).id}))
    .filter(x => !away.has(x.employeeId))
    /* Cut as hrWeek() sends an entry longer than the grid takes, so the cut alone is no change. */
    .flatMap(x => { const out = []; for(let a = x.f; a < x.t; a += GW_CAP) out.push(line(x.d, Object.assign({}, x, {f: a, t: Math.min(x.t, a + GW_CAP)}))); return out; })
    .sort();
  return want.length !== have.length || want.some((x, i) => x !== have[i]);
}
/* Whether the game's grid takes every entry of a week as it is: whole hours
   within the day, 12 at most (ScheduleWrite's bad_hours). */
const hrSendable = days => days.every(({shifts}) => shifts.every(s => Number.isInteger(s.f) && Number.isInteger(s.t)
  && s.f >= 0 && s.f < s.t && s.t <= 24 && s.t - s.f <= 12));
/* One planned site's week in the action: {days, lost, changes}. An office
   nobody arrives at keeps its own additive write (gwRosterWeek(): every entry
   as it stands, the office default added where computer and person are free),
   less the entries of anyone the call moves away; every other site gets its
   plan's week (hrWeek()), which is what the Staff page has always sent where
   it hires. */
function hrSiteWeek(S, fill, away, arriving, inbound, additive){
  const lost = {hours: 0};
  if(S.site.kind === "office" && !spOfficeReplaces(S.row) && !inbound){
    const base = gwOfficeRow(S.key);
    if(!base) return {days: [], lost, changes: false};
    const gone = s => away.has(((base.people || [])[s.p] || {}).id);
    const row = Object.assign({}, base, {shifts: (base.shifts || []).filter(s => !gone(s)),
      current: Object.assign({}, base.current, {list: ((base.current || {}).list || []).filter(s => !gone(s))})});
    const week = gwRosterWeek(row);
    /* The office default's hours left out for someone, as its own write says. */
    const leftOut = (week.leftOut || []).map(x => ({name: ((row.people || [])[x.p] || {}).name, hours: x.hours}));
    return {days: week.days, lost, changes: week.sent > 0 && !week.unreadable, leftOut};
  }
  const stranded = [];
  const days = hrWeek(S, fill, away, arriving, lost, {additive: !!additive, stranded});
  return {days, lost, stranded, changes: inbound || hrDiffers(S.row || {}, days, away)};
}
/* Whom a `shift` refusal row of a hire answer names: its site's week in
   the call, that day, that entry. */
function hrShiftWho(req, row){
  const site = row.address && ((req.body || {}).sites || []).find(x => x.days && gwKeyOf(x.address) === gwKeyOf(row.address));
  const day = site && site.days.find(x => x.d === row.d);
  return ((day && day.shifts || [])[row.i] || {}).employeeId;
}
/* The action, one call: who is hired and moved where, and every week it
   writes, with what the review needs to name every row of it.
     mode   "both": hire, move, and write the week at every site the call
            reaches and every site in scope whose week changes;
            "hire": hire and move only, every site assign-only (no hours);
            "week": no hire or move, the weeks alone
     site   one site's key: the hires and moves into it, and its own week
     quick  Quick hire's plan (hrQuickPlan()): its picks at its site
     only   {"<site key>|<skill>": n}: that many hires a site and role and
            no move or other week, the partial result's "Pick more"
     one    the mod takes it all in one call (hrOneCall()); else the weeks no
            hire or move reaches are `rest`, one /write/schedule body each,
            written after the hire
   A move's source is written only where its week changes by more than the
   mover's entries, which the game's move clears by itself. */
function hrRequest(m, o = {}){
  const mode = o.mode || "both", only = o.only || null, Q = o.quick || null;
  const one = o.one === undefined ? hrOneCall() : !!o.one;
  const inScope = S => !!S && (Q ? S === Q.S : !o.site || S.key === o.site);
  const t = hrTotals(m);
  const touched = new Map();  // key -> {S, fill: [{id, w}], hires: [{c, w, skill}], moves: [x], inbound, week}
  const touch = S => {
    if(!touched.has(S.key)) touched.set(S.key, {S, fill: [], hires: [], moves: [], inbound: false, week: false});
    return touched.get(S.key);
  };
  const names = new Map();    // id -> {name, skill, c | move}
  const hires = [], moves = [], away = new Set(), arriving = new Set(), zero = [];
  /* One site's action: where each of its own spares can go (hrOutWeek()),
     worked out whatever the mode, for the review to say why. */
  /* One site's action: where each of its own spares goes (hrOutPlan()). */
  const out = o.site && !Q && !only ? hrOutPlan(m, m.sites.find(S => S.key === o.site)) : new Map();
  const left = Object.assign({}, only || {});
  const hire = (c, S, w, skill, misfit, nofit) => {
    hires.push({candidateId: c.id, address: gwAddress(S.key), expect: {wage: c.wage}, seenHoursLeft: c.hoursLeft ?? null});
    names.set(c.id, {name: c.name, skill, c});
    const at = touch(S);
    at.inbound = true;
    at.hires.push({c, w, skill, misfit: misfit || [], nofit: nofit || null});
    if(w) at.fill.push({id: c.id, w});
    /* Joins with no hours at a site whose week the call writes: said, never silent. */
    else if(mode === "both" && S.planned && S.row) zero.push({c, S, nofit: nofit || null});
  };
  if(mode !== "week"){
    if(Q){
      if(Q.S) Q.picks.forEach(p => hire(p.c, Q.S, p.w, Q.q.skill, p.misfit, p.nofit));
    } else {
      /* One site's action also moves its own spare people out to the week the
         page found them elsewhere, as Staff all sites does: the plan leaves
         them no hours here, and nobody stays assigned at 0 hours when a week
         that fits them is open (Peter, 29 September 2026). */
      /* A site outside the scope gets an additive week, never opened around
         the clock: the spare goes to a week inside its opening hours and on
         hours free there (hrOutWeek()), or is left spare, with that said. */
      const sent = o.site
        ? [...[...out.values()].filter(r => r.x && !r.x.off).map(r => r.x), ...t.moves.filter(x => inScope(x.to) && !(x.from && x.from.key === o.site))]
        : t.moves.filter(x => inScope(x.to));
      if(!only) sent.forEach(x => {
        moves.push({employeeId: x.id, from: x.from ? gwAddress(x.from.key) : null, to: gwAddress(x.to.key)});
        names.set(x.id, {name: x.p.name, skill: x.skill, move: x});
        arriving.add(x.id);
        const at = touch(x.to);
        at.inbound = true;
        /* Outside the scope (Staff this site's own spare reassigned out): the
           destination's week as the game has it, with the mover added. */
        if(!inScope(x.to)) at.additive = true;
        at.moves.push(x);
        if(x.week) at.fill.push({id: x.id, w: x.week.w});
        if(x.from) away.add(x.id);
      });
      m.sites.filter(inScope).forEach(S => S.weeks.forEach(x => {
        if(!x.who || x.who.type !== "hire") return;
        const k = `${S.key}|${x.w.skill}`;
        if(only){ if(!(left[k] > 0)) return; left[k]--; }
        hire(x.who.c, S, x.w, x.w.skill, x.who.misfit);
      }));
      if(!only) m.overs.filter(v => inScope(v.S)).forEach(v => hire(v.c, v.S, null, v.skill));
    }
  }
  const sources = new Set(moves.filter(x => x.from).map(x => gwKeyOf(x.from)));
  const sites = [], rest = [], unreadableSites = [];
  m.sites.forEach(S => {
    const at = touched.get(S.key);
    const weekly = mode !== "hire" && S.planned && !!S.row;
    /* A week no hire or move reaches: every planned site in scope, never in
       Quick hire or "Pick more". */
    const may = weekly && !only && !Q && inScope(S);
    if(!at && !may) return;
    const address = gwAddress(S.key);
    if(!weekly){ sites.push({address, expect: null, days: null}); return; }
    const wk = hrSiteWeek(S, at ? at.fill : [], away, arriving, !!(at && at.inbound), !!(at && at.additive && !inScope(S)));
    if(!at && !wk.changes) return;
    const unreadableOffice = S.site.kind === "office" && spOfficeReplaces(S.row)
      && gwRosterWeek(Object.assign({}, S.row, {office: true})).unreadable;
    if(unreadableOffice){
      unreadableSites.push(S);
      if(at) sites.push({address, expect: null, days: null});
      return;
    }
    const expect = S.b && typeof S.b.shiftPrint === "string" ? S.b.shiftPrint : null;
    /* A week this board cannot compare with the game's is not written unless
       somebody arrives there (and then the review asks for a new read); nor
       one that keeps an entry the game's grid refuses (longer than 12 hours,
       as an older build could leave): the call is all or nothing, and a
       site nobody arrives at is not worth refusing the rest for. */
    if(!at && (expect === null || !hrSendable(wk.days))) return;
    const additive = !!(at && at.additive && !inScope(S));
    const entry = {address, expect, openAllHours: !!(S.row && S.row.full) && !additive, days: wk.days};
    const own = touch(S);
    own.lost = wk.lost;
    own.leftOut = wk.leftOut || [];
    own.stranded = wk.stranded || [];
    own.additive = additive;
    own.week = true;
    if(at || one || sources.has(S.key)) sites.push(entry);
    else { own.rest = true; rest.push({S, body: entry}); }
  });
  /* The sites the review names, in list order: the ones the call reaches, and
     in scope the places nobody fills. */
  const gaps = new Map();
  if(!Q) m.sites.filter(inScope).forEach(S => {
    const open = S.weeks.filter(x => !x.who || (x.who.type === "move" && x.who.m.off));
    if(open.length) gaps.set(S.key, open);
  });
  const shown = m.sites.filter(S => touched.has(S.key) || gaps.has(S.key));
  return {body: {sites, hires, moves}, names, touched, rest, unreadableSites, zero, gaps, shown, mode, one, out, inScope, quick: !!Q, only: !!only,
          weeks: sites.filter(s => s.days).length + rest.length};
}
/* --- drawing -------------------------------------------------------------- */
/* The page is numbers and a few words (mockup/staff-hire-v2, NOTES.md): no
   paragraph, no "?" and no pill on it. Open places on the left, one row a
   role; what the button does, the button and Quick hire on the right;
   Current staff at the foot. Change picks opens one role over the page. */
const hrSiteName = S => S ? (S.b ? shortName(S.b) : S.site.name || "?") : "";
/* A role's name for a count of people, English plural rules only while the
   game's names are English: "22 Lawyers", "3 Customer Service". */
function hrRoles(skill, n){
  const name = gameName(skill) || (D.skillNames || {})[skill] || String(skill || "").replace(/^ba:skill_/, "");
  const many = n === 1 || gnLang !== "en" ? name : /man$/i.test(name) ? name.replace(/man$/i, "men")
    : /(er|or|ant|ent|ist|ian|ard|ger)$/i.test(name) ? `${name}s` : name;
  return spEsc(many);
}
/* A count of people in a role, "22 Lawyers", as one message: the English
   plural is a param (`roles`), and a translation writes the game's own name
   (`role_name`) where it cannot decline it, "22 × Anwalt". */
const hrRoleCount = (skill, n) => tt("co.hire.roles", {one: "{n:,} {roles}", other: "{n:,} {roles}"},
  {n, roles: hrRoles(skill, n), role_name: hrRole(skill)});
/* A site's kind as one word, "shop", for Quick hire's site list. */
function hrKindWord(kind){
  switch(kind){
    case "shop": return tt("co.hire.kind.shop", "shop");
    case "office": return tt("co.hire.kind.office", "office");
    case "factory": return tt("co.hire.kind.factory", "factory");
    case "warehouse": return tt("co.hire.kind.warehouse", "warehouse");
    case "hq": return tt("co.hire.kind.hq", "headquarters");
  }
  return null;
}
/* Where a role hires, in a few words: the site, or "4 shops". */
function hrWhere(sites){
  if(sites.length === 1) return `${spEsc(hrSiteName(sites[0]))}${sites[0].site.new ? `<span class="hs-tag">${tt("co.hire.tag.new", "new")}</span>` : ""}`;
  const kinds = new Set(sites.map(S => S.site.kind)), n = sites.length;
  switch(kinds.size === 1 ? [...kinds][0] : null){
    case "shop": return tt("co.hire.where.shop", {one: "{n} shop", other: "{n} shops"}, {n});
    case "office": return tt("co.hire.where.office", {one: "{n} office", other: "{n} offices"}, {n});
    case "factory": return tt("co.hire.where.factory", {one: "{n} factory", other: "{n} factories"}, {n});
    case "warehouse": return tt("co.hire.where.warehouse", {one: "{n} warehouse", other: "{n} warehouses"}, {n});
    case "hq": return tt("co.hire.where.hq", {one: "{n} headquarters", other: "{n} headquarters"}, {n});
  }
  return tt("co.hire.where.sites", {one: "{n} site", other: "{n} sites"}, {n});
}
/* A list ending in "and": "A, B and C". */
function hrAndList(items){
  if(items.length < 2) return items.length ? items[0] : "";
  if(items.length === 2) return tt("co.hire.and", "{a} and {b}", {a: items[0], b: items[1]});
  return tt("co.hire.list", "{a}, {b}", {a: items[0], b: hrAndList(items.slice(1))});
}
const hrChev = () => hrSvg("chev");
/* How long a candidate's application has left. */
function hrExpires(c){
  const h = Number(c.hoursLeft);
  if(c.hoursLeft === null || c.hoursLeft === undefined || !Number.isFinite(h)) return "–";
  return h < 24 ? tt("co.hire.exp.hours", "{h} h", {h: Math.max(0, Math.round(h))})
    : tt("co.hire.exp.days", {one: "{n} day", other: "{n} days"}, {n: Math.floor(h / 24)});
}
function hrLinkState(){
  /* Linked is the normal state, and not linked is said under the hire
     button: only a mod too old to hire speaks here (declutter T4). */
  const l = gwLink();
  if(l && !(l.writes || []).includes("hire")) return `<span class="hs-link old"><i></i>${l.mod
    ? tt("co.hire.link.old.v", "Mod {v} · too old to hire", {v: spEsc(l.mod)}) : tt("co.hire.link.old", "Mod · too old to hire")}</span>`;
  return "";
}

/* The reassign groups, in the model's order: {group, people, x}. */
function hrGroups(m){
  const groups = [];
  m.moves.forEach(x => { const g = groups.find(y => y.group === x.group); if(g) g.people.push(x); else groups.push({group: x.group, people: [x], x}); });
  return groups;
}
/* One reassign group as the line under its role. */
function hrReLine(g){
  const {x, people} = g, n = people.length;
  const to = spEsc(hrSiteName(x.to));
  if(x.fixed) return `<div class="hs-re"><span class="hs-i">${hrSvg("check2")}</span><span>${
    tt("co.hire.re.assign", "<b>Assign {n:,}</b> · unassigned → {to}", {n, to})}</span></div>`;
  const line = x.from ? tt("co.hire.re.from", "<b>Reassign {n:,}</b> · {from} (no hours) → {to}", {n, from: spEsc(hrSiteName(x.from)), to})
    : tt("co.hire.re.bench", "<b>Reassign {n:,}</b> · unassigned → {to}", {n, to});
  return `<div class="hs-re${x.off ? " off" : ""}"><span class="hs-i">${hrSvg("move")}</span><span>${line}</span>
    <label><input type="checkbox" class="hs-cb" data-hr-move="${attr(g.group)}"${x.off ? "" : " checked"} aria-label="${
      attr(tt("co.hire.re.aria", "Reassign {n} {role}", {n, role: gameName(x.skill) || ""}))}">${tt("co.hire.re.box", "Reassign")}</label></div>`;
}
/* A role's row: Open · Own staff · New hires · Stays open · Wages/day. */
function hrRoleRow(m, r, lines){
  const sites = [];
  r.weeks.forEach(x => { if(!sites.includes(x.S)) sites.push(x.S); });
  const hires = r.weeks.filter(x => x.who && x.who.type === "hire");
  const overs = m.overs.filter(o => o.skill === r.skill);
  const people = [...hires.map(x => x.who.c), ...overs.map(o => o.c)];
  const bill = hires.reduce((n, x) => n + Number(x.who.c.wage || 0) * Number(x.w.hours || 0) / 7, 0);
  const avg = f => people.reduce((n, c) => n + f(c), 0) / people.length;
  const none = !r.pool.length;
  const act = none && r.short ? `<td class="act l txt warn">${tt("co.hire.role.nocands", "No candidates")}</td>`
    : `<td class="act"><button type="button" class="hs-btn" data-hr-open="${attr(r.skill)}" aria-label="${
      attr(tt("co.hire.role.change.aria", "Change picks: {role}", {role: gameName(r.skill) || r.skill}))}"><span class="t">${tt("co.hire.role.change", "Change picks")}</span>${hrChev()}</button></td>`;
  const row = `<tr class="${lines ? "has-sub" : ""}" data-hr-role="${attr(r.skill)}">
    <td class="l hs-rn"><b>${hrRole(r.skill)}</b><small>${hrWhere(sites)}</small></td>
    <td class="num opt">${hrNum(r.weeks.filter(x => x.w.band !== "short").length)}</td>
    <td class="${r.moved ? "num" : "dim"} opt">${r.moved ? hrNum(r.moved) : "–"}</td>
    <td class="${people.length ? "num" : r.short ? "warn" : "dim"}" data-l="${attr(tt("co.hire.col.hires", "New hires"))}">${hrNum(people.length)}${people.length ? `<small>${
      tt("co.hire.role.avg", "{lv}% · {w}/h", {lv: Math.round(avg(c => hrLevel(c, r.skill))), w: hrWage(people.some(c=>c.wageUnavailable || !Number.isFinite(c.wage)) ? null : Math.round(avg(c => c.wage)))})}</small>` : ""}</td>
    <td class="${r.short ? "warn" : "dim"}" data-l="${attr(tt("co.hire.col.open", "Stays open"))}">${r.short ? hrNum(r.short) : "–"}${r.tooFew
      ? `<small class="hs-toofew">${tt("co.hire.role.toofew", "{h} h a week too few for a hire", {h: hrNum(r.tooFew)})}</small>` : ""}</td>
    <td class="${bill ? "num" : "dim"} opt">${bill ? `+${fmt(bill)}` : "–"}</td>${act}</tr>`;
  return row + (lines ? `<tr class="hs-subrow"><td class="l" colspan="7">${lines}</td></tr>` : "");
}
/* The filter bar: the demands to leave out, the lowest skill and the highest
   wage. `target` is "" for the company's, or a role's skill in Change picks. */
const HR_SKILLS = [0, 50, 60, 70, 80, 90, 100];
const HR_WAGES = [10, 15, 20, 25, 30, 40, 50, 60, 80, 100];
function hrDemLabel(ex){
  if(!ex.length) return `<b>${tt("co.hire.f.nobody", "nobody")}</b>`;
  return `<b class="set">${ex.length <= 2 ? ex.map(hrName).join(", ") : tt("co.hire.f.demands", {one: "{n} demand", other: "{n} demands"}, {n: ex.length})}</b>`;
}
function hrFbar(target, f, count){
  const skills = [...new Set([...HR_SKILLS, f.min])].sort((a, b) => a - b);
  const wages = f.max === null || HR_WAGES.includes(f.max) ? HR_WAGES : [...HR_WAGES, f.max].sort((a, b) => a - b);
  const open = !!hrPop && hrPop.target === target;
  return `<div class="hs-fbar" data-hr-filters="${attr(target)}">
    <button type="button" class="hs-sel" data-hs-dem-open="${attr(target)}" aria-haspopup="true" aria-expanded="${open}"${
      f.ex.includes(HR_PT) ? ` data-tip="${attr(tt("co.hire.f.pt.tip", "{demand} is left out for shop roles only.", {demand: hrName(HR_PT)}))}"` : ""}>${
      tt("co.hire.f.leaveout", "Leave out who asks for: {who}", {who: hrDemLabel(f.ex)})}${hrChev()}</button>
    <label class="hs-sel">${tt("co.hire.f.min", "Skill at least:")} <select data-hr-min aria-label="${attr(tt("co.hire.f.min.aria", "Skill at least"))}" class="${f.min ? "set" : ""}">${skills.map(v =>
      `<option value="${v}"${v === f.min ? " selected" : ""}>${v ? `${v}%` : tt("co.hire.f.any", "any")}</option>`).join("")}</select>${hrChev()}</label>
    <label class="hs-sel">${tt("co.hire.f.max", "Wage at most:")} <select data-hr-max aria-label="${attr(tt("co.hire.f.max.aria", "Wage at most"))}" class="${f.max === null ? "" : "set"}"><option value=""${f.max === null ? " selected" : ""}>${tt("co.hire.f.any", "any")}</option>${
      wages.map(v => `<option value="${v}"${v === f.max ? " selected" : ""}>${hrWage(v)}</option>`).join("")}</select>${hrChev()}</label>
    ${count ? `<span class="hs-fsum">${count}</span>` : ""}</div>`;
}
/* Open places: the filter bar, one row a role with its reassign lines under
   it, the total, and one line of candidate facts. */
function hrOpenHtml(m){
  const f = hrFilters().company;
  const match = new Set(m.roles.flatMap(r => r.pool.filter(r.passes).map(c => c.id))).size;
  const groups = hrGroups(m);
  const lines = skill => groups.filter(g => g.x.skill === skill).map(hrReLine).join("");
  const skills = new Set(m.roles.map(r => r.skill));
  const stray = groups.filter(g => !skills.has(g.x.skill)).map(hrReLine).join("");
  const soon = m.cands.filter(c => Number(c.hoursLeft) < 24).length;
  // No candidates is the role rows' to say (declutter T5).
  const nc = m.cands.length;
  /* How many candidates, and how many of them expire soon: two messages, each
     pluralised on its own count. */
  const expiring = !soon ? null : gwLink()
    ? tt("co.hire.facts.soon", {one: "<b class='warn'>{n:,}</b> expires within 24 h", other: "<b class='warn'>{n:,}</b> expire within 24 h"}, {n: soon})
    : tt("co.hire.facts.soon.save", {one: "<b class='warn'>{n:,}</b> expires within 24 h (as of the save)",
        other: "<b class='warn'>{n:,}</b> expire within 24 h (as of the save)"}, {n: soon});
  const facts = nc ? `<p class="hs-facts2">${[tt("co.hire.facts", {one: "<b>{n:,}</b> candidate", other: "<b>{n:,}</b> candidates"}, {n: nc}),
    expiring].filter(Boolean).join(" · ")}</p>` : "";
  /* No "Open places" heading: the filters under "Whom to hire" say what the
     table is (Peter's testing, A10). */
  const head = hrNoHoursHtml();
  if(!m.roles.length){
    /* Nothing to hire, but maybe people to give hours: then not "has its people". */
    const idle = hrIdleHtml(m);
    return `${head}${idle ? "" : `<p class="hs-note">${tt("co.hire.allstaffed", "Every planned site has its people.")}</p>`}${stray ? `<div class="hs-scroll">${stray}</div>` : ""}${idle}${hrSpareHtml()}${facts}`;
  }
  return `${head}${hrFbar("", f, match ? tt("co.hire.f.match", {one: "<b>{n:,}</b> match", other: "<b>{n:,}</b> match"}, {n: match}) : "")}
    <div class="hs-scroll"><table class="hs-t hs-roles"><thead><tr><th class="l">${tt("co.hire.col.role", "Role")}</th><th class="opt">${tt("co.hire.col.places", "Open")}</th><th class="opt">${
      tt("co.hire.col.own", "Own staff")}</th><th>${tt("co.hire.col.hires", "New hires")}</th><th>${tt("co.hire.col.open", "Stays open")}</th><th class="opt">${
      tt("co.hire.col.wages", "Wages/day")}</th><th><span class="gw-sr">${tt("co.hire.role.change", "Change picks")}</span></th></tr></thead>
    <tbody>${m.roles.map(r => hrRoleRow(m, r, lines(r.skill))).join("")}${stray ? `<tr class="hs-subrow"><td class="l" colspan="7">${stray}</td></tr>` : ""}</tbody></table></div>
    ${hrFindHtml(m)}${hrIdleHtml(m)}${hrSpareHtml()}${facts}`;
}
/* Shops the game opens no hour: no plan, and nothing is hired for them,
   until the player sets their opening hours. */
function hrNoHoursHtml(){
  /* A shop the player put on full cover (24/7) is planned 0 to 24 all the same. */
  const shut = ((D.hiring || {}).sites || []).filter(s => s.noHours && !((s.plans || {}).full && spPlanOf(spRosterRow(s.key)) === "full"));
  const byKey = new Map((D.businesses || []).map(b => [b.key, b]));
  const names = shut.map(s => spEsc(byKey.get(s.key) ? shortName(byKey.get(s.key)) : s.name || tt("co.hire.ashop", "A shop"))).join(", ");
  return shut.length ? `<p class="hs-note hs-nohours">${tt("co.hire.nohours.shut", {
    one: "{names} opens no hour in the game: set its opening hours first.",
    other: "{names} open no hour in the game: set their opening hours first."}, {n: shut.length, names})}</p>` : "";
}
/* Staff with no hours: planned sites whose week in the game leaves the plan's
   hours with nobody on, where the site's own people would work them (the
   plan's `unstaffed`); nothing is hired for those, so the order would say
   nothing. The link opens the site's Staffing, whose write puts the week in. */
/* The plan the site's Staffing block shows and writes (spPlanOf()): its gap of people with no hours, or undefined. */
function hrUnstaffedOf(S){
  const u = S.site.unstaffed || {};
  return S.site.kind === "office" ? u[spOfficePlanOf(S.key)] : u[spPlanOf(spRosterRow(S.key)) || "demand"];
}
function hrIdleHtml(m){
  const of = hrUnstaffedOf;
  const rows = m.sites.filter(S => (S.site.kind === "shop" || S.site.kind === "office") && of(S)).map(S => {
    const u = of(S), name = spEsc(S.b ? shortName(S.b) : S.site.name || tt("co.hire.asite.cap", "A site"));
    const who = (u.roles || []).filter(r => r.idle).map(r => tt("co.hire.idle.role",
      {one: "your {n:,} {role} staff has no hours", other: "your {n:,} {role} staff have no hours"}, {n: r.idle, role: hrRole(r.skill)}));
    const href = siteHref(S.key);
    return `<li><b>${name}</b><span>${[tt("co.hire.idle.hours", "{h:,} h with nobody on", {h: Number(u.hours || 0)}), ...who].join(" · ")}</span>${
      href ? `<a class="to" href="${attr(href)}" data-hr-roster="${attr(S.key)}">${hrSvg("chev")}${tt("co.hire.idle.write", "Write their week")}</a>` : ""}</li>`;
  }).join("");
  return rows ? `<div class="hs-find hs-idle"><h4>${tt("co.hire.idle.title", "Staff with no hours")}</h4><ul>${rows}</ul></div>` : "";
}
/* The people the game's week gives no hours and the plan on screen none
   either (spSpareIds()): no demand of theirs is a warning, and fewer on the
   payroll is a good thing in this game, so they are one neutral note. Those
   the plan does use are Staff with no hours (hrIdleHtml()), to be given
   their week, not let go. */
function hrSpareHtml(){
  const sites = (D.businesses || []).map(b => [b, spSpareIds(b).length]).filter(([, n]) => n);
  const n = sites.reduce((t, [, k]) => t + k, 0);
  return n ? `<p class="hs-note hs-spare">${tt("co.hire.spare", {
    one: "{n:,} person isn't needed where they are: move them to a site that needs them, or let them go · {sites}",
    other: "{n:,} people aren't needed where they are: move them to a site that needs them, or let them go · {sites}"},
    {n, sites: sites.map(([b, k]) => `${spEsc(shortName(b))} ${hrNum(k)}`).join(", ")})}</p>` : "";
}
/* Where to find them: for each role places stay open in, how many and where
   the people come from, for an early company whose headhunters recruit few
   roles or none. A headhunter already recruiting the role is said; otherwise
   a Headhunter at the headquarters, or the game's Recruitment Agency. */
function hrFindHtml(m){
  const short = m.roles.filter(r => r.short > 0);
  if(!short.length) return "";
  const recruiting = (D.hiring || {}).recruiting || {};
  const agency = gameName("ba:businesstype_recruitmentagency") || "Recruitment Agency";
  /* The table says how many stay open and whether there are candidates;
     this says where to find more, and what the filters leave out. */
  const rows = short.map(r => {
    const out = r.pool.length - r.pass;
    const have = !r.pool.length ? ""
      : !r.pass ? tt("co.hire.find.allout", {one: "{n} candidate, all left out by your filters", other: "{n} candidates, all left out by your filters"}, {n: r.pool.length})
      : out ? tt("co.hire.find.out", {one: "{n:,} more left out by your filters", other: "{n:,} more left out by your filters"}, {n: out}) : "";
    const n = recruiting[r.skill] || 0, hh = hrRole("ba:skill_headhunter");
    const where = n ? tt("co.hire.find.recruiting", {
        one: "your {headhunter} is recruiting {role}: wait for more candidates, or a {agency}",
        other: "{n:,} of your {headhunters} are recruiting {role}: wait for more candidates, or a {agency}"},
        {n, headhunter: hh, headhunters: hrRoles("ba:skill_headhunter", n), headhunter_name: hh, role: hrRole(r.skill), agency: spEsc(agency)})
      : "";
    return `<li><b>${hrRole(r.skill)}</b>${have ? `<span>${have}</span>` : ""}${where ? `<span class="to">${hrSvg("chev")}${where}</span>` : ""}</li>`;
  }).join("");
  const genericRoles = short.filter(r => !recruiting[r.skill]).map(r => hrRole(r.skill));
  const generic = genericRoles.length
    ? `<p class="hs-find-advice">${tt("co.hire.find.advice", {
        one: "{roles}: a {headhunter} at your headquarters recruiting that role, or a {agency}.",
        other: "{roles}: a {headhunter} at your headquarters recruiting each role, or a {agency}."},
        {n: genericRoles.length, roles: hrAndList(genericRoles), headhunter: hrRole("ba:skill_headhunter"), agency: spEsc(agency)})}</p>` : "";
  return `<div class="hs-find"><h4 class="nx-sr">${tt("co.hire.find.title", "Where to find them")}</h4><ul>${rows}</ul>${generic}</div>`;
}
/* "When you hire": what Staff all sites does, in numbers (the reassigns,
   the hires, the weeks it writes, the places that stay open), then the
   button, then what keeps it off. */
function hrOrderHtml(m, t){
  const l = gwLink(), old = !!l && !(l.writes || []).includes("hire");
  const byRole = m.roles.map(r => [r, r.picked.length]).filter(([, n]) => n);
  const short = m.roles.filter(r => r.short);
  /* The weeks it writes: every site a hire or reassign reaches, and every
     planned site whose week is not the plan's yet. */
  const weeks = hrRequest(m, {mode: "both", one: true}).weeks;
  const items = [
    t.move ? `<li><span>${tt("co.hire.tile.move", "Reassign")}</span><b>${hrNum(t.move)}</b></li>` : "",
    `<li><span>${tt("co.hire.tile.hire", "Hire")}</span><b>${hrNum(t.hire)}</b>${byRole.length ? `<small>${byRole.map(([r, n]) => hrRoleCount(r.skill, n)).join(" · ")}</small>` : ""}</li>`,
    weeks ? `<li><span>${tt("co.hire.tile.weeks", "Site schedules")}</span><b>${hrNum(weeks)}</b></li>` : "",
    short.length ? `<li class="short"><span>${tt("co.hire.order.short", "Stays open")}</span><b>${hrNum(t.short)}</b></li>` : "",
  ].join("");
  const n = t.hire + t.move + weeks;
  const label = n ? tt("co.hire.title.all", "Staff all sites") : tt("co.hire.order.nothing", "Nothing to do");
  const off = !l || old || !n;
  const why = !l ? tt("co.hire.order.why.link", "needs the game linked") : old ? tt("co.hire.order.why.old", "needs Big Copilot Link 0.3.0")
    : !n ? tt("co.hire.order.why.none", "nothing to hire, reassign or schedule") : "";
  /* Not linked, no data-gw: nothing on the board is a write while it reads a save. */
  const btn = `<button type="button" class="hs-cta wide" data-hs-review${l ? ` data-gw="hire"` : ""}${off ? ` aria-disabled="true"` : ""} aria-label="${
    attr(why ? tt("nav.dlg.offlabel", "{name}: {why}", {name: label, why}) : label)}">${off && n ? gwSvg("plug") : ""}<span>${label}</span>${off ? "" : gwSvg("right")}</button>`;
  const under = !l ? `<details class="hs-gate"><summary>${tt("co.hire.gate.link", "Link the game to hire")}</summary><ol><li>${tt("co.hire.gate.sub", "Subscribe to Big Copilot Link (Steam Workshop)")}</li><li>${
      tt("co.hire.gate.load", "Load this company in the game")}</li><li>${tt("co.hire.gate.from", "Link from the start screen")}</li></ol></details>`
    : old ? `<div class="hs-gate warn"><b>${tt("co.hire.gate.old", "Update Big Copilot Link to 0.3.0")}</b><span>${l.mod ? `${tt("co.hire.gate.have", "You have {v}.", {v: spEsc(l.mod)})} ` : ""}${
      tt("co.hire.gate.restart", "Restart the game, then link again.")}</span></div>`
    : n ? `<p class="hs-note">${tt("co.hire.order.picked", "Picked for you. You confirm next.")}</p>` : "";
  const Q = m.quick;
  const held = Q && Q.hold && Q.held ? `<p class="hs-note hs-held">${tt("co.hire.order.held", {one: "{n} week held for Quick hire ({role} at {site})", other: "{n} weeks held for Quick hire ({role} at {site})"},
    {n: Q.held, role: hrRole(Q.q.skill), site: spEsc(hrSiteName(Q.S))})}</p>` : "";
  return `<h3 class="nx-sr">${tt("co.hire.order.title", "When you hire")}</h3><ul class="hs-ol">${items}</ul>${held}
    <div class="hs-sum"><span>${tt("co.hire.tile.wages", "Added wages")}</span><b>+${fmt(t.bill)}${tt("co.hire.perday", "/day")}</b></div>${mcOrdinaryWageNote()}${btn}${under}`;
}

/* The page, whole, or only the blocks named in `parts` (ids), which keeps a
   control outside them where it is. Change picks and the demand list, when
   open, are drawn again with it. */
function drawStaff(parts){
  drawStaffPage(parts);
  hrSelRepoint();
}
function drawStaffPage(parts){
  const sec = $("secStaff");
  if(!sec) return;
  /* The Staff page's key is a section (odNeed()): worked out when the page
     is on screen, and said so until it arrives. */
  if(!odNeed("hiring")){
    /* Change picks and the demand list read the key too: they close, and the
       picks themselves (hrUi) stay for when it arrives. */
    if(hrPop) hrPopClose();
    const sheet = $("hsSheet");
    if(sheet && sheet.open) sheet.close();
    sec.innerHTML = `<div class="hs-head"><h2>${tt("co.needs.hire.title", "Whom to hire")}</h2></div>${odWaitHtml("hiring")}`;
    return;
  }
  const m = hrModel(), t = hrTotals(m);
  const blocked = [...(D.staffing || []), ...(D.officeStaffing || []), ...((D.factoryStaffing || {}).cap || [])]
    .filter(r=>r.unavailable === "modCompatibility");
  const notice = blocked.map(r=>`<p class="quiet">${spEsc(r.name || r.key)}: ${spEsc(mcStaffText(r))}</p>`).join("")
    + ((D.candidates || []).some(c=>c.wageUnavailable) ? `<p class="quiet">${tt("co.mod.candidateUnknown", "Candidates with unverified wage quotes are excluded from hiring recommendations.")}</p>` : "");
  const html = {hsOpen: () => hrOpenHtml(m), hsOrder: () => hrOrderHtml(m, t), hsQuick: () => hrQuickHtml(m)};
  /* A redraw (a live refresh among them) puts the keyboard back where it was. */
  const had = document.activeElement, sheet = $("hsSheet");
  const keep = had && ((sec.contains(had) && sec) || (sheet && sheet.contains(had) && sheet)) ? hrKey(had) : null;
  if(parts && sec.querySelector("#hsOpen")) parts.forEach(id => { const el = sec.querySelector(`#${id}`); if(el) el.innerHTML = html[id](); });
  else sec.innerHTML = `<div class="hs-head"><h2>${tt("co.needs.hire.title", "Whom to hire")}</h2><div class="aside">${hrLinkState()}</div></div>
    ${notice}<div class="hs-split"><div class="hs-left" id="hsOpen">${html.hsOpen()}</div>
      <div class="hs-right"><aside class="hs-order" id="hsOrder" aria-label="${attr(tt("co.hire.order.title", "When you hire"))}">${html.hsOrder()}</aside>
        <section class="hs-quick" id="hsQuick" aria-label="${attr(tt("co.hire.quick.title", "Quick hire"))}">${html.hsQuick()}</section></div></div>`;
  hrSheetPaint(m);
  if(hrPop) hrPopDraw(m);
  if(parts) wireTips();
  if(keep && !(document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected)){
    const box = $("hsSheet") || sec, el = box.querySelector(keep) || sec.querySelector(keep);
    if(el) el.focus({preventScroll: true});
  }
  const stuck = document.activeElement;
  if(stuck && stuck.disabled && (stuck.hasAttribute("data-hq-less") || stuck.hasAttribute("data-hq-more"))){
    const b = sec.querySelector("[data-hq-n]");
    if(b) b.focus({preventScroll: true});
  }
}
/* Repaint after a control changed, and put the keyboard back where it was:
   `focus` is a selector, looked for in Change picks first. */
function hrRepaint(focus, parts){
  drawStaff(parts);
  if(!parts) wireTips();
  if(focus){
    const sheet = $("hsSheet");
    const el = (sheet && sheet.querySelector(focus)) || $("secStaff").querySelector(focus);
    /* The stepper's button at 1 or 99 is off: the keyboard goes to the number. */
    const at = el && el.disabled ? $("secStaff").querySelector("[data-hq-n]") : el;
    if(at) at.focus({preventScroll: true});
  }
}
const hrKey = el => {
  for(const a of ["data-hr-open", "data-hr-pick", "data-hr-move", "data-hr-scope", "data-hs-dem-open", "data-hr-min", "data-hr-max",
                  "data-hq-role", "data-hq-site", "data-hq-less", "data-hq-more", "data-hq-n", "data-hq-go"])
    if(el.hasAttribute(a)){
      const v = el.getAttribute(a);
      const box = el.closest("[data-hr-filters]");
      const scope = box && (a === "data-hr-min" || a === "data-hr-max") ? `[data-hr-filters="${CSS.escape(box.dataset.hrFilters)}"] ` : "";
      return v ? `${scope}[${a}="${CSS.escape(v)}"]` : `${scope}[${a}]`;
    }
  return null;
};

/* --- Change picks: one role over the page --------------------------------- */
/* Why a demand is not met where someone goes, in a few words. */
function hrWhy(m, slug, S, wk){
  const kind = hrKind(slug);
  const nowhere = () => tt("co.hire.why.nowhere", "none at any site");
  const notHere = () => tt("co.hire.why.nothere", "none at {site}", {site: spEsc(hrSiteName(S))});
  if(kind === "schedule") return tt("co.hire.why.hours", "the plan's hours break it");
  if(kind === "company") return hrDemandAt(m, slug, S, wk) === "warn" ? tt("co.hire.require.hrplan", "assign a plan offering this") : tt("co.hire.why.notoffered", "not offered");
  if(kind === "station"){
    if(hrDemandAt(m, slug, S, wk) === "no") return nowhere();
    if(hrDeskAnywhere(slug, S)) return wk && wk.w ? tt("co.hire.why.desk", "not at this desk") : tt("co.hire.why.seat", "met at a desk here: seat them there");
    return notHere();
  }
  const tone = hrDemandAt(m, slug, S, wk);
  return tone === "warn" ? notHere() : nowhere();
}
/* One candidate as a row of Change picks. */
function hrCandRow(m, r, c){
  const at = r.at.get(c.id);
  const picked = !!(at && (at.week || at.over));
  const elsewhere = at && at.elsewhere;
  const S = at && at.week ? at.week.S : at && at.over ? at.over : null;
  const wk = at && at.week;
  const warned = new Map(picked ? hrWarns(m, c, S, wk) : []);
  const lv = hrLevel(c, r.skill);
  const unmet = d => tt("co.hire.cand.unmet", "{demand} ({why})", {demand: hrName(d), why: hrWhy(m, d, S, wk)});
  const dem = (c.demands || []).map(d => warned.has(d) ? `<span class="warn">${unmet(d)}</span>` : hrName(d)).join(", ");
  /* On a phone Asks for is hidden: the unmet ones go under the name. */
  const why = [...warned.keys()].map(unmet).join(", ");
  const noShop = !picked && !elsewhere && r.pt && r.shop && !r.allShop && hrAsksPt(c);
  const to = elsewhere ? `<span class="dim">${tt("co.hire.cand.elsewhere", "picked for {site}", {site: spEsc(hrSiteName(elsewhere))})}</span>`
    : noShop ? `<span class="dim">${tt("co.hire.cand.noshop", "not for shop weeks ({demand})", {demand: hrName(HR_PT)})}</span>`
    : at && at.nofit ? `<span class="dim">${tt("co.hire.nofit", "no open week meets their schedule demands")}</span>`
    : S ? (at.over ? tt("co.hire.cand.over", "{site} <span class='warn'>over the plan</span>", {site: spEsc(hrSiteName(S))}) : spEsc(hrSiteName(S))) : `<span class="dim">–</span>`;
  const soon = Number(c.hoursLeft) < 24;
  return `<tr class="${picked ? "on" : ""}" data-hr-cand="${attr(c.id)}">
    <td class="l"><input type="checkbox" class="hs-cb" data-hr-pick="${attr(c.id)}" data-hr-skill="${attr(r.skill)}"${picked ? " checked" : ""}${elsewhere ? " disabled" : ""} aria-label="${attr(c.name ? tt("co.hire.cand.pick", "Pick {name}", {name: c.name}) : tt("co.hire.cand.pick.anon", "Pick this candidate"))}"></td>
    <td class="nm"><b>${spEsc(c.name || "?")}</b>${why ? `<small class="hs-why warn">${why}</small>` : ""}</td>
    <td class="l"><span class="hs-sk" style="--w:${Math.max(0, Math.min(100, lv || 0))}%"><i></i></span>${Math.round(lv || 0)}%</td>
    <td>${hrWage(c.wageUnavailable ? null : c.wage)}</td><td class="to">${to}</td>
    <td class="dem opt">${dem || `<span class="dim">–</span>`}</td>
    <td class="exp${soon ? " warn" : ""}">${hrExpires(c)}</td></tr>`;
}
const hrCandHead = () => `<thead><tr><th class="l" style="width:34px"><span class="gw-sr">${tt("co.hire.col.pick", "Pick")}</span></th><th class="l">${
  tt("co.hire.col.cand", "Candidate")}</th><th class="l">${tt("co.hire.col.skill", "Skill")}</th><th>${tt("co.hire.col.wage", "Wage/h")}</th><th class="l">${
  tt("co.hire.col.to", "Goes to")}</th><th class="l opt">${tt("co.hire.col.asks", "Asks for")}</th><th>${tt("co.hire.col.expires", "Expires in")}</th></tr></thead>`;
function hrSheetHtml(m, r){
  /* The places hires fill, as the role row counts them: no week too short
     for any contract, none a reassign takes. */
  const places = r.weeks.filter(x => x.w.band !== "short" && !(x.who && x.who.type === "move"));
  const need = places.length;
  const sites = [];
  places.forEach(x => { const s = sites.find(y => y.S === x.S); if(s) s.n++; else sites.push({S: x.S, n: 1}); });
  const own = !!hrFilters().roles[r.skill];
  /* The filter as it applies here: the company's Part-time shows only where
     it bars a week of this role (a shop's). */
  const f = own ? r.f : Object.assign({}, r.f, {ex: r.pt && r.shop ? [...r.f.ex, HR_PT] : r.f.ex});
  const placed = c => { const at = r.at.get(c.id); return !!(at && (at.week || at.over)); };
  const picked = r.pool.filter(placed);
  const next = r.pool.filter(c => !placed(c) && r.passes(c));
  const out = r.pool.filter(c => !placed(c) && !r.passes(c));
  const cap = 200, shown = hrUi.all ? next.slice(0, cap) : next.slice(0, 10);
  const over = picked.length - need;
  const count = over > 0 ? tt("co.hire.sheet.count.over", "{n:,} of {k:,} · {x:,} over the plan", {n: picked.length, k: need, x: over})
    : over < 0 ? tt("co.hire.sheet.count.open", "{n:,} of {k:,} · {x:,} open", {n: picked.length, k: need, x: -over})
    : tt("co.hire.sheet.count", "{n:,} of {k:,}", {n: picked.length, k: need});
  const bill = r.weeks.reduce((n, x) => n + (x.who && x.who.type === "hire" ? Number(x.who.c.wage || 0) * Number(x.w.hours || 0) / 7 : 0), 0);
  const lacks = picked.some(c => { const at = r.at.get(c.id); return hrWarns(m, c, at.week ? at.week.S : at.over, at.week).length; });
  const table = rows => `<div class="hs-scroll"><table class="hs-t hs-c">${hrCandHead()}<tbody>${rows.map(c => hrCandRow(m, r, c)).join("")}</tbody></table></div>`;
  return `<div class="hs-sh"><div><h2 id="hsSheetT">${hrRole(r.skill)}</h2><p>${tt("co.hire.sheet.need", {one: "{n} new hire · {sites}", other: "{n} new hires · {sites}"},
        {n: need, sites: sites.map(({S, n}) => tt("co.hire.sheet.site", "{site} ({n:,})", {site: spEsc(hrSiteName(S)), n})).join(", ")})}</p></div>
      <button type="button" class="gw-x" data-hs-close data-od-close aria-label="${attr(tt("nav.dlg.close", "Close"))}">${gwSvg("close")}</button></div>
    <div class="hs-sb">
      ${hrFbar(r.skill, f, tt("co.hire.f.matchout", {one: "<b>{n:,}</b> match · <b>{k:,}</b> left out", other: "<b>{n:,}</b> match · <b>{k:,}</b> left out"}, {n: r.pass, k: r.out}))}
      <div class="hs-scope"><span>${tt("co.hire.scope", "Filters for")}</span><label class="hs-radio"><input type="radio" name="hsScope" data-hr-scope="all"${own ? "" : " checked"}>${
        tt("co.hire.scope.all", "every role")}</label><label class="hs-radio"><input type="radio" name="hsScope" data-hr-scope="own"${own ? " checked" : ""}>${
        tt("co.hire.scope.own", "{role} only", {role: hrRole(r.skill)})}</label></div>
      <div class="hs-grp"><b>${tt("co.hire.sheet.picked", "Picked")}</b><span>${count}</span>${lacks ? `<span class="hs-legend"><i></i>${tt("co.hire.sheet.lacks", "site lacks it")}</span>` : ""}</div>
      ${picked.length ? table(picked) : `<p class="hs-note">${tt("co.hire.sheet.none", "Nobody matches.")}</p>`}
      <div class="hs-grp"><b>${tt("co.hire.sheet.next", "Next best")}</b><span>${tt("co.hire.sheet.more", {one: "{n:,} more", other: "{n:,} more"}, {n: next.length})}</span></div>
      ${shown.length ? table(shown) : `<p class="hs-note">${tt("co.hire.sheet.noneelse", "Nobody else matches.")}</p>`}
      ${hrUi.out && out.length ? `<div class="hs-grp"><b>${tt("co.hire.sheet.out", "Left out")}</b><span>${hrNum(out.length)}</span></div>${table(out.slice(0, cap))}` : ""}
      <div class="hs-more">${next.length > shown.length ? `<a class="link" href="#" data-hs-all>${hrUi.all ? tt("co.hire.sheet.first", "Show the first {n}", {n: cap})
        : tt("co.hire.sheet.all", "Show all")}</a>` : ""}${hrUi.all && next.length > cap ? `<span>${tt("co.hire.sheet.firstof", "The first {n} of {k:,}", {n: cap, k: next.length})}</span>` : ""}${
        out.length ? `<a class="link" href="#" data-hs-out>${hrUi.out ? tt("co.hire.sheet.hideout", "Hide the left out")
          : tt("co.hire.sheet.showout", {one: "Show the {n:,} left out", other: "Show the {n:,} left out"}, {n: out.length})}</a>` : ""}</div>
    </div>
    <div class="hs-sf"><div class="tot"><div><span>${tt("co.hire.sheet.picked", "Picked")}</span><b>${count}</b></div><div><span>${
      tt("co.hire.tile.wages", "Added wages")}</span><b>+${fmt(bill)}${tt("co.hire.perday", "/day")}</b></div></div>
      <div class="end"><a class="link" href="#" data-hs-reset>${tt("co.hire.sheet.reset", "Reset to automatic")}</a><button type="button" class="hs-cta" data-hs-done data-od-close>${
        tt("co.hire.sheet.done", "Done")}</button></div></div>`;
}
/* Change picks is a dialog on <body>: open for hrUi.sheet, drawn again with
   the page, closed when that role is gone. */
function hrSheetPaint(m){
  let dlg = $("hsSheet");
  const r = hrUi.sheet && m.roles.find(x => x.skill === hrUi.sheet);
  if(!r){
    hrUi.sheet = null;
    if(dlg && dlg.open) dlg.close();
    return;
  }
  if(!dlg){
    dlg = document.createElement("dialog");
    dlg.dataset.odNeeds = "hiring";
    dlg.id = "hsSheet"; dlg.className = "hs-sheet";
    dlg.setAttribute("aria-labelledby", "hsSheetT");
    dlg.addEventListener("close", () => {
      const skill = dlg.dataset.hrDrawer;
      dlg.remove();
      hrUi.sheet = null; hrUi.all = false; hrUi.out = false;
      if(hrPop && hrPop.target !== "" && hrPop.target !== "quick") hrPopClose();
      const back = skill && $("secStaff") && $("secStaff").querySelector(`[data-hr-open="${CSS.escape(skill)}"]`);
      if(back) back.focus({preventScroll: true});
    });
    document.body.appendChild(dlg);
  }
  const body = dlg.querySelector(".hs-sb"), top = body ? body.scrollTop : 0;
  dlg.dataset.hrDrawer = r.skill;
  dlg.innerHTML = hrSheetHtml(m, r);
  const again = dlg.querySelector(".hs-sb");
  if(again) again.scrollTop = top;
  if(!dlg.open){ dlg.showModal(); (dlg.querySelector("[data-hs-dem-open]") || dlg).focus({preventScroll: true}); }
}

/* --- the demand list ------------------------------------------------------- */
/* One list for every "Leave out who asks for": the page's (target ""), a
   role's in Change picks (its skill) or Quick hire's ("quick"). It hangs off
   <body>, or the open dialog, placed against its button: a section clips
   what is absolutely placed inside it. */
let hrPop = null;  // {target, all}
function hrPopFilter(m, target){
  if(target === "quick") return {ex: hrQuickModel(m).ex};
  const f = hrFilters();
  return target && f.roles[target] ? f.roles[target] : f.company;
}
function hrPopPool(m, target){
  if(target === "quick"){ const q = hrUi.quick; return q.skill ? m.cands.filter(c => hrLevel(c, q.skill) !== null) : m.cands; }
  if(target){ const r = m.roles.find(x => x.skill === target); return r ? r.pool : []; }
  return m.cands.filter(c => m.roles.some(r => hrLevel(c, r.skill) !== null));
}
function hrPopDraw(m){
  const anchor = document.querySelector(`[data-hs-dem-open="${CSS.escape(hrPop.target)}"]`);
  /* Read off the Staff page's key: never drawn without it (odReady()). */
  if(!anchor || !odReady("hiring")){ hrPopClose(); return; }
  m = m || hrModel();
  const f = hrPopFilter(m, hrPop.target);
  const count = new Map();
  hrPopPool(m, hrPop.target).forEach(c => (c.demands || []).forEach(d => count.set(d, (count.get(d) || 0) + 1)));
  f.ex.forEach(d => { if(!count.has(d)) count.set(d, 0); });
  const all = [...count].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const few = hrPop.all || all.length <= 12 ? all : all.filter(([d], i) => i < 10 || f.ex.includes(d));
  let pop = $("hsDemPop");
  if(!pop){
    pop = document.createElement("div");
    pop.dataset.odNeeds = "hiring";
    pop.id = "hsDemPop"; pop.setAttribute("role", "dialog");
  }
  pop.setAttribute("aria-label", tt("co.hire.dem.aria", "Leave out anyone asking for"));
  const host = anchor.closest("dialog") || document.body;
  if(pop.parentElement !== host) host.appendChild(pop);
  const had = document.activeElement && pop.contains(document.activeElement) ? document.activeElement.getAttribute("data-hr-dem") : null;
  /* The company's Part-time counts at shops only: said so, and a role with no
     shop week cannot change it from its own list. */
  const company = f === hrFilters().company;
  const r = hrPop.target && hrPop.target !== "quick" ? m.roles.find(x => x.skill === hrPop.target) : null;
  const fixed = d => company && d === HR_PT && !!r && !r.shop;
  pop.innerHTML = `<div class="ph">${tt("co.hire.dem.head", "Leave out anyone asking for:")}</div>${few.map(([d, n]) =>
      `<label class="hs-opt"><input type="checkbox" class="hs-cb" data-hr-dem="${attr(d)}"${f.ex.includes(d) ? " checked" : ""}${fixed(d) ? " disabled" : ""}><span>${hrName(d)}${
        company && d === HR_PT ? ` <small>${tt("co.hire.dem.shops", "· shop roles only")}</small>` : ""}</span><small>${hrNum(n)}</small></label>`).join("")
    || `<p class="ph">${tt("co.hire.dem.empty", "Nobody asks for anything.")}</p>`}
    <div class="pf">${few.length < all.length ? `<button type="button" data-hs-dem-all>${tt("co.hire.dem.all", "All {n} demands", {n: all.length})}</button>` : "<span></span>"}<button type="button" data-hs-dem-clear>${
      tt("co.hire.dem.clear", "Clear")}</button></div>`;
  pop.hidden = false;
  document.querySelectorAll("[data-hs-dem-open]").forEach(b => b.setAttribute("aria-expanded", String(b === anchor)));
  hrPopPlace(anchor, pop);
  if(had){ const el = pop.querySelector(`[data-hr-dem="${CSS.escape(had)}"]`); if(el) el.focus({preventScroll: true}); }
}
function hrPopPlace(anchor, pop){
  const a = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth, vh = window.innerHeight || document.documentElement.clientHeight;
  const left = Math.max(12, Math.min(a.left, vw - w - 12));
  const below = a.bottom + 6, above = a.top - 6 - h;
  pop.style.left = `${left}px`;
  pop.style.top = `${below + h > vh - 12 && above >= 12 ? above : below}px`;
}
/* The option list of a Staff select, drawn by the page instead of the
   system's white list (Peter's in-game test, 25 September 2026). The select
   stays the control: the list sets its value and fires its change, so every
   handler and the keyboard's own arrows keep working. Only where the pointer
   is a mouse: a phone's own picker is the better one there. */
let hrSel = null;  // {select, at, key, root}: the select whose list is open, the option lit
const hrSelFine = () => !window.matchMedia || window.matchMedia("(pointer: fine)").matches;
function hrSelOpen(select){
  if(!select || select.disabled || odActionBlocked(select)) return;
  hrPopClose();
  let pop = $("hsSelPop");
  if(!pop){
    pop = document.createElement("div");
    pop.dataset.odNeeds = "hiring";
    pop.id = "hsSelPop"; pop.setAttribute("role", "listbox"); pop.tabIndex = -1;
  }
  const host = select.closest("dialog") || document.body;
  if(pop.parentElement !== host) host.appendChild(pop);
  const opts = [...select.options];
  pop.setAttribute("aria-label", select.getAttribute("aria-label") || "");
  pop.innerHTML = opts.map((o, i) => `<div class="hs-selopt${o.value === "" && !o.selected ? " ph" : ""}" role="option" id="hsSelOpt${i}" data-hs-opt="${i}" aria-selected="${o.selected}"${
    o.disabled ? ` aria-disabled="true"` : ""}><span>${spEsc(o.textContent)}</span>${hrSvg("check2")}</div>`).join("");
  /* Where to find the select again once the page is drawn anew under it. */
  const root = select.closest("#hsSheet") ? "hsSheet" : "secStaff";
  hrSel = {select, at: Math.max(0, select.selectedIndex), key: hrKey(select), root, typed: "", typedAt: 0};
  pop.hidden = false;
  const anchor = select.closest(".hs-sel") || select;
  pop.style.minWidth = `${Math.round(anchor.getBoundingClientRect().width)}px`;
  anchor.setAttribute("aria-expanded", "true");
  select.setAttribute("aria-expanded", "true");
  select.setAttribute("aria-controls", "hsSelPop");
  hrPopPlace(anchor, pop);
  hrSelLight();
  pop.focus({preventScroll: true});
}
function hrSelLight(){
  const pop = $("hsSelPop");
  if(!pop || !hrSel) return;
  pop.querySelectorAll(".hs-selopt").forEach((el, i) => el.classList.toggle("on", i === hrSel.at));
  const on = pop.querySelector(".hs-selopt.on");
  if(on){ on.scrollIntoView({block: "nearest"}); pop.setAttribute("aria-activedescendant", on.id); }
}
/* A live refresh draws the page anew under an open list: the list follows
   its select to the new page, or closes where the select is gone. */
function hrSelRepoint(){
  if(!hrSel || hrSel.select.isConnected) return;
  const root = $(hrSel.root), found = root && hrSel.key ? root.querySelector(hrSel.key) : null;
  if(!found || found.tagName !== "SELECT" || found.disabled){ hrSelClose(); return; }
  const at = hrSel.at;
  hrSelOpen(found);
  if(hrSel){ hrSel.at = Math.min(at, found.options.length - 1); hrSelLight(); }
}
function hrSelClose(back){
  const pop = $("hsSelPop"), sel = hrSel && hrSel.select;
  hrSel = null;
  if(pop){ pop.hidden = true; pop.remove(); }
  const anchor = sel && (sel.closest(".hs-sel") || sel);
  if(anchor && anchor.isConnected) anchor.setAttribute("aria-expanded", "false");
  if(sel && sel.isConnected) sel.setAttribute("aria-expanded", "false");
  if(back && sel && sel.isConnected) sel.focus({preventScroll: true});
}
function hrSelPick(i){
  if(!hrSel) return;
  hrSelRepoint();
  if(!hrSel) return;
  const sel = hrSel.select, o = sel.options[i];
  if(!o || o.disabled){ return; }
  hrSelClose(true);
  if(sel.selectedIndex === i) return;
  sel.selectedIndex = i;
  sel.dispatchEvent(new Event("input", {bubbles: true}));
  sel.dispatchEvent(new Event("change", {bubbles: true}));
}
function hrSelBind(){
  const inStaff = t => t && t.closest && t.closest("#secStaff, #hsSheet, dialog.hr-wide");
  /* A press on the field opens the list rather than the system's. */
  document.addEventListener("mousedown", e => {
    const t = e.target;
    if(e.button !== 0 || !inStaff(t) || !hrSelFine()) return;
    const field = t.closest(".hs-sel");
    const select = field ? field.querySelector("select") : t.closest("select");
    if(!select || !select.closest(".hs-sel")) return;
    e.preventDefault();
    if(hrSel && hrSel.select === select){ hrSelClose(true); return; }
    select.focus({preventScroll: true});
    hrSelOpen(select);
  }, true);
  document.addEventListener("click", e => {
    if(!hrSel) return;
    const opt = e.target.closest && e.target.closest("#hsSelPop [data-hs-opt]");
    if(opt){ hrSelPick(Number(opt.dataset.hsOpt)); return; }
    if(e.target.closest && (e.target.closest("#hsSelPop") || (hrSel.select.closest(".hs-sel") || hrSel.select).contains(e.target))) return;
    hrSelClose();
  });
  document.addEventListener("keydown", e => {
    const t = e.target;
    /* On the select: Enter, Space, Alt+Down or F4 open the list; the arrows
       alone change the value as a select always has. */
    if(!hrSel){
      if(t && t.tagName === "SELECT" && t.closest(".hs-sel") && inStaff(t) && hrSelFine()
         && (e.key === "Enter" || e.key === " " || e.key === "F4" || (e.altKey && e.key === "ArrowDown"))){
        e.preventDefault();
        hrSelOpen(t);
      }
      return;
    }
    const n = hrSel.select.options.length;
    const step = d => { let i = hrSel.at; for(let k = 0; k < n; k++){ i = (i + d + n) % n; if(!hrSel.select.options[i].disabled) break; } hrSel.at = i; hrSelLight(); };
    if(e.key === "ArrowDown"){ e.preventDefault(); step(1); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); step(-1); }
    else if(e.key === "Home"){ e.preventDefault(); hrSel.at = 0; hrSelLight(); }
    else if(e.key === "End"){ e.preventDefault(); hrSel.at = n - 1; hrSelLight(); }
    else if(e.key === "Enter" || e.key === " "){ e.preventDefault(); hrSelPick(hrSel.at); }
    else if(e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); hrSelClose(true); }
    else if(e.key === "Tab"){ hrSelClose(true); }
    else if(e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey){
      /* Type-ahead: the next option whose name starts with what was typed. */
      e.preventDefault();
      const now = Date.now();
      hrSel.typed = (now - hrSel.typedAt < 700 ? hrSel.typed : "") + e.key.toLowerCase();
      hrSel.typedAt = now;
      const opts = [...hrSel.select.options], from = hrSel.typed.length > 1 ? hrSel.at : hrSel.at + 1;
      for(let k = 0; k < n; k++){
        const i = (from + k) % n, o = opts[i];
        if(!o.disabled && o.textContent.trim().toLowerCase().startsWith(hrSel.typed)){ hrSel.at = i; hrSelLight(); break; }
      }
    }
  }, true);
  const replace = () => {
    const pop = $("hsSelPop"), sel = hrSel && hrSel.select;
    if(!pop || !sel) return;
    if(!sel.isConnected){ hrSelClose(); return; }
    hrPopPlace(sel.closest(".hs-sel") || sel, pop);
  };
  window.addEventListener("resize", replace);
  window.addEventListener("scroll", replace, {passive: true, capture: true});
}
function hrPopClose(back){
  const pop = $("hsDemPop");
  const target = hrPop && hrPop.target;
  hrPop = null;
  if(pop){ pop.hidden = true; pop.remove(); }
  document.querySelectorAll("[data-hs-dem-open]").forEach(b => b.setAttribute("aria-expanded", "false"));
  if(back && target !== null && target !== undefined){
    const b = document.querySelector(`[data-hs-dem-open="${CSS.escape(target)}"]`);
    if(b) b.focus({preventScroll: true});
  }
}
/* --- Quick hire: the best matches for one role, at any site --------------- */
/* Role, site (headquarters, warehouse, office, factory or shop), how many,
   the lowest skill and the demands to leave out; the best matches are picked
   as the planned hires are (most skilled first, a tie to the lower wage). Its
   picks win over Open places: hrModel() plans them first (hrQuickPlan()), and
   at a site with a staffing plan each takes one of the plan's weeks in that
   role there, which Open places then leaves to it. Past those, and at a site
   with no plan, they join with no hours. Its confirm is the one action's
   (hrReview(), scope "quick"): hire and schedule writes the site's week with
   the hires on their plan weeks, as Staff this site does; hire only, the one
   choice at a headquarters or a warehouse, assigns them with no hours.
   Part-time is left out by default at a shop. */
function hrQuickPlan(sites, cands, used){
  const q = hrUi.quick, H = D.hiring || {};
  const skills = [...new Set((H.sites || []).flatMap(s => s.accepts || []))]
    .sort((a, b) => gnCompare(gameName(a) || a, gameName(b) || b));
  if(q.skill && !skills.includes(q.skill)) q.skill = "";
  const at = sites.filter(S => !q.skill || (S.site.accepts || []).includes(q.skill));
  if(q.site && !at.some(S => S.key === q.site)) q.site = "";
  const S = q.site ? at.find(x => x.key === q.site) : null;
  const shop = !!S && S.site.kind === "shop";
  /* The page's own filters (declutter T9): part-time left out at a shop only,
     as Open places does, and there only while the role has no open
     part-time week. */
  const partOpen = !!S && !!q.skill && (S.weeks || []).some(x => x.w.skill === q.skill && !x.who && x.w.band === "part");
  const f = hrFilters().company;
  const ex = f.ex.filter(d => d !== HR_PT || (shop && !partOpen));
  q.min = f.min;
  /* Its plan weeks are held, and its picks kept from Open places, only while
     its confirm is open or its write is under way (hrUi.quickHold); a form
     merely filled in holds nothing. */
  const hold = !!hrUi.quickHold;
  const out = {q, skills, sites: at, S, shop, ex, ready: !!(q.skill && S), hold, plan: false, matches: [], picks: [], short: 0, held: 0};
  if(!out.ready) return out;
  out.matches = cands.filter(c => !c.wageUnavailable && Number.isFinite(c.wage) && hrLevel(c, q.skill) !== null && hrLevel(c, q.skill) >= q.min
    && (f.max === null || Number(c.wage) <= f.max)
    && !(c.demands || []).some(d => ex.includes(d))).sort(hrRank(q.skill));
  /* The plan's weeks in this role here that nobody reassigned takes. */
  out.plan = !!(S.planned && S.row);
  const open = out.plan ? S.weeks.filter(x => x.w.skill === q.skill && !x.who && x.w.band !== "short") : [];
  /* Weeks too short for any contract left here, and nothing else. */
  out.tooFew = out.plan && !open.length && S.weeks.some(x => x.w.skill === q.skill && !x.who && x.w.band === "short");
  /* Best match first. While the plan has weeks left here, a match takes one
     that meets their schedule demands, at a desk that meets their desk
     demands first; a match no week left fits is held back (Peter, 28
     September 2026). The places still to fill then go, best match first,
     to everyone not placed, those held back included, with no hours, as at
     a site with no plan. The picks are listed best first. */
  /* As Open places: at a shop, the Part-time default keeps a part-time
     asker to its part-time weeks, and to none once those are taken (no
     place with no hours either). */
  const ptBar = c => shop && f.ex.includes(HR_PT) && hrAsksPt(c);
  /* The plan weeks given out, best match first, `cap` of them at most:
     {placed: id -> week, held: id -> the demands no open week met, open}. */
  const place = cap => {
    const weeks = open.slice(), placed = new Map(), held = new Map();
    for(const c of out.matches){
      if(placed.size >= cap || !weeks.length) break;
      if(ptBar(c) && !weeks.some(x => x.w.band === "part")) continue;
      const fit = weeks.filter(x => hrFits(c, x) && !(ptBar(c) && x.w.band !== "part"));
      if(!fit.length){
        /* Never empty: a part-time asker reaches here only with a part week
           still open, which their demands broke. */
        held.set(c.id, [...new Set(weeks.filter(x => !(ptBar(c) && x.w.band !== "part")).flatMap(x => hrFails(c, x)))]);
        continue;
      }
      const wk = hrPickWeek(c, fit);
      weeks.splice(weeks.indexOf(wk), 1);
      placed.set(c.id, wk);
    }
    return {placed, held, open: weeks};
  };
  /* A part-time asker who gets no part week however many are asked for is
     no match here (the headline count does not move with How many). */
  const all = place(Infinity);
  const leftOut = c => !all.placed.has(c.id) && ptBar(c);
  out.leftOut = out.matches.filter(leftOut).length;
  /* At a site with open plan weeks, a match is someone who can take one;
     the rest would only join with no hours (item 6 of the in-game test). */
  out.fitting = out.plan && open.length
    ? out.matches.filter(c => !leftOut(c) && open.some(x => hrFits(c, x) && !(ptBar(c) && x.w.band !== "part"))).length : null;
  const capped = place(q.n), {placed, held} = capped;
  const partLeft = capped.open.some(x => x.w.band === "part");
  /* With no part week left open, a part-time asker not placed gets no place
     with no hours at such a shop, held back or not. */
  const out1 = c => !placed.has(c.id) && ptBar(c) && !partLeft;
  let left = q.n - placed.size;
  out.picks = out.matches.filter(c => placed.has(c.id) || (!out1(c) && left > 0 && left-- > 0)).map(c => {
    const wk = placed.get(c.id) || null;
    if(wk && hold){ wk.who = {type: "quick", c}; out.held++; }
    if(hold) used.set(c.id, S);
    /* Held back and placed past the weeks anyway: `nofit` names why. */
    return Object.assign({c, w: wk ? wk.w : null, misfit: []}, !wk && held.has(c.id) ? {nofit: held.get(c.id)} : {});
  });
  out.short = Math.max(0, q.n - out.picks.length);
  return out;
}
const hrQuickModel = m => m.quick;
/* The note beside a pick, each their own reason: a match held back from the
   plan's open weeks names the demands none of them met; anyone past those
   weeks at a planned site joins with no hours because none was left. (The
   one action writes their plan week as it is, so no hours already set there
   can cut it: the kept-week clash of the additive write is gone with it.) */
const hrQuickNote = (p, Q) => {
  if(p.nofit) return `<small class="warn">${tt("co.hire.quick.nofit", "no open week fits {demands}", {demands: p.nofit.map(hrName).join(", ")})}</small>`;
  if(!p.w && Q.plan && Q.tooFew) return `<small>${tt("co.hire.p.short", "too few hours for a hire")}</small>`;
  return !p.w && Q.plan ? `<small>${tt("co.hire.quick.noweek", "no open hours left in the plan")}</small>` : "";
};
function hrQuickHtml(m){
  const Q = hrQuickModel(m), q = Q.q;
  const l = gwLink(), off = !l || !(l.writes || []).includes("hire");
  const kind = S => S.b && S.b.type ? S.b.type : hrKindWord(S.site.kind) || S.site.kind;
  /* The matches that can be picked: not a part-time asker the shop's default leaves out. */
  const pickable = Q.matches.length - (Q.leftOut || 0);
  const k = Q.picks.length, n = Q.fitting === null || Q.fitting === undefined ? pickable : Q.fitting;
  const match = !Q.ready ? ""
    : !pickable ? `<p class="hs-match none">${tt("co.hire.quick.none", "Nobody matches.")}</p>`
    /* Picks that would join with no hours are said apart from the matches
       that fit an open week (item 6 of the in-game test). */
    : Q.picks.some(p => !p.w) && Q.fitting !== null && Q.fitting !== undefined ? `<details class="hs-match" data-hq-list${q.open ? " open" : ""}><summary>${tt("co.hire.quick.fit",
        {one: "<b>{n}</b> fits an open week · <span class='warn'>{k} would join with no hours</span>", other: "<b>{n}</b> fit an open week · <span class='warn'>{k} would join with no hours</span>"},
        {n, k: Q.picks.filter(p => !p.w).length})}${hrChev()}</summary><ul>${Q.picks.map(p => { const {c} = p; return `<li><span>${spEsc(c.name || "?")}${hrQuickNote(p, Q)}</span><span class="m">${Math.round(hrLevel(c, q.skill))}%</span><span class="m">${hrWage(c.wageUnavailable ? null : c.wage)}/h</span></li>`; }).join("")}</ul></details>`
    : `<details class="hs-match" data-hq-list${q.open ? " open" : ""}><summary>${
        Q.short ? tt("co.hire.quick.short", {one: "<b>{n}</b> match · <span class='warn'>only {n} candidate matches</span>", other: "<b>{n}</b> match · <span class='warn'>only {n} candidates match</span>"}, {n})
        : k >= n ? tt("co.hire.quick.all", {one: "<b>{n}</b> match · picked", other: "<b>{n}</b> match · all {n} are picked"}, {n})
        : tt("co.hire.quick.best", {one: "<b>{m}</b> match · the best is picked", other: "<b>{m}</b> match · the best {n} are picked"}, {m: n, n: k})}${hrChev()}</summary>
      <ul>${Q.picks.map(p => { const {c} = p; return `<li><span>${spEsc(c.name || "?")}${hrQuickNote(p, Q)}</span><span class="m">${Math.round(hrLevel(c, q.skill))}%</span><span class="m">${hrWage(c.wageUnavailable ? null : c.wage)}/h</span></li>`; }).join("")}</ul></details>`;
  const busy = !!hrUi.quickPending;
  const dis = !Q.ready || !k || off || busy;
  return `<div class="qh"><span class="hs-i">${hrSvg("hire")}</span><h3>${tt("co.hire.quick.title", "Quick hire")}</h3></div>
    <div class="qf">
      <label class="fld wide"><span>${tt("co.hire.quick.role", "Role")}</span><span class="hs-sel"><select data-hq-role aria-label="${attr(tt("co.hire.quick.role", "Role"))}" class="${q.skill ? "" : "empty"}"><option value="">${
        tt("co.hire.quick.pickrole", "Choose a role")}</option>${
        Q.skills.map(s => `<option value="${attr(s)}"${s === q.skill ? " selected" : ""}>${hrRole(s)}</option>`).join("")}</select>${hrChev()}</span></label>
      <label class="fld wide"><span>${tt("co.hire.quick.at", "At")}</span><span class="hs-sel"><select data-hq-site aria-label="${attr(tt("co.hire.quick.at", "At"))}" class="${q.site ? "" : "empty"}"><option value="">${
        tt("co.hire.quick.picksite", "Choose a site")}</option>${
        Q.sites.map(S => `<option value="${attr(S.key)}"${S.key === q.site ? " selected" : ""}>${spEsc(hrSiteName(S))} · ${spEsc(kind(S))}</option>`).join("")}</select>${hrChev()}</span></label>
      <div class="fld"><span>${tt("co.hire.quick.many", "How many")}</span><span class="hs-num"><button type="button" data-hq-less aria-label="${attr(tt("co.hire.quick.fewer", "Fewer"))}"${
        q.n <= 1 ? " disabled" : ""}>−</button><b data-hq-n tabindex="-1" aria-live="polite">${hrNum(q.n)}</b><button type="button" data-hq-more aria-label="${attr(tt("co.hire.quick.more", "More"))}"${
        q.n >= 99 ? " disabled" : ""}>+</button></span></div>
    </div>
    ${match}
    <button type="button" class="hs-cta wide" data-hq-go${dis ? ` aria-disabled="true"` : ""}>${busy ? tt("co.hire.quick.busy", "Hiring…")
      : k ? tt("co.hire.go.hire", "Hire {n}", {n: hrNum(k)}) : tt("co.hire.quick.hire", "Hire")}${dis ? "" : gwSvg("right")}</button>`;
}

/* The confirm: the one action's (hrReview()), narrowed to this role, this
   site and these picks. Its plan weeks are held while it is open. */
let hrQuickSeq = 0;
function hrQuickReview(){
  /* Each confirm owns its hold (a token): a late release from an earlier
     one never clears a newer confirm's. hrUi.quickPending is the token of a
     confirm closed while its write is still under way; Quick hire's button
     says "Hiring…" and is off until that write ends. */
  if(hrUi.quickPending) return;
  const token = ++hrQuickSeq;
  hrUi.quickHold = false;
  let dlg = null;
  const release = () => {
    if(hrUi.quickHold === token) hrUi.quickHold = false;
    if(hrUi.quickPending === token) hrUi.quickPending = false;
    if(!$("secStaff")) return;
    drawStaff(["hsOpen", "hsOrder", "hsQuick"]);
    const at = document.activeElement;
    if(!at || at === document.body || !at.isConnected){
      const b = document.querySelector("#hsQuick [data-hq-go]");
      if(b) b.focus({preventScroll: true});
    }
  };
  const opened = hrReview({scope: "quick"}, {
    /* Waiting for a new board holds no picks from the old one. */
    onPlan: () => { hrUi.quickHold = token; },
    /* Who the game hired is staff now (hrReview()); the form starts again,
       and a confirm closed while it applied ends its hold here. */
    onDone: () => {
      hrUi.quick = hrQuickNew();
      if(dlg && !dlg.open) release();
    },
    /* Failed after the confirm was closed mid-apply: the hold ends too. */
    onFailed: () => { if(dlg && !dlg.open) release(); },
    more: {label: tt("co.hire.quick.again", "Hire more"), go: () => {
      if(gwOpen) gwOpen.close();
      const el = document.querySelector("#hsQuick [data-hq-role]");
      if(el) el.focus({preventScroll: true});
    }},
  });
  if(!opened){ release(); return; }
  dlg = gwOpen;
  if(dlg){
    /* Closed, however: the held weeks go back to Open places, unless the
       write is still under way (onDone or onFailed ends the hold then). */
    dlg.addEventListener("close", () => {
      if(dlg.dataset.phase !== "applying") return release();
      /* The close event comes after close(): an answer may have released
         this confirm already, and then nothing is pending. */
      if(hrUi.quickHold !== token) return;
      hrUi.quickPending = token;
      if($("secStaff")) drawStaff(["hsQuick"]);
    });
  }
  /* Quick hire's own markup does not change with the hold: its Hire button
     stays, for the keyboard to come back to. */
  drawStaff(["hsOpen", "hsOrder"]);
}
/* The filters a control changes: Change picks' role (its own set, when it has
   one), or the company's. */
function hrFilterTarget(el){
  const box = el.closest("[data-hr-filters]");
  const skill = box && box.dataset.hrFilters;
  const f = hrFilters();
  if(skill && f.roles[skill]) return f.roles[skill];
  return f.company;
}
/* Bound once, on the first draw: once() and on() are declared further down. */
let hrBound = false;
function bindStaff(){
  if(hrBound) return;
  hrBound = true;
  hrSelBind();
  const page = "#secStaff", sheet = "#hsSheet";
  on("change", `${page} [data-hr-move]`, el => {
    if(el.checked) hrUi.moveOff.delete(el.dataset.hrMove); else hrUi.moveOff.add(el.dataset.hrMove);
    hrRepaint(hrKey(el));
  });
  on("click", `${page} [data-hr-open]`, el => {
    hrUi.sheet = el.dataset.hrOpen; hrUi.all = false; hrUi.out = false;
    hrPopClose();
    hrSheetPaint(hrModel());
    wireTips();
  });
  /* The filter bar's two dropdowns, on the page and in Change picks. */
  const pick = el => {
    const f = hrFilterTarget(el), v = el.value;
    if(el.hasAttribute("data-hr-min")) f.min = Number(v) || 0;
    else f.max = v === "" ? null : Number(v);
    hrFiltersSave();
    hrRepaint(hrKey(el));
  };
  on("change", `${page} [data-hr-min], ${page} [data-hr-max], ${sheet} [data-hr-min], ${sheet} [data-hr-max]`, pick);
  on("change", `${sheet} [data-hr-scope]`, el => {
    const skill = hrUi.sheet, f = hrFilters();
    if(!skill) return;
    /* A role's own filter starts as the one it is picked by now: Part-time
       only when every week of the role is at a shop. */
    const r = hrModel().roles.find(x => x.skill === skill);
    if(el.dataset.hrScope === "own"){ if(!f.roles[skill] && r) f.roles[skill] = hrCleanFilter(Object.assign({}, r.f, {ex: r.pt && r.allShop ? [...r.f.ex, HR_PT] : r.f.ex})); }
    else delete f.roles[skill];
    hrFiltersSave();
    hrRepaint(hrKey(el));
  });
  on("change", `${sheet} [data-hr-pick]`, el => {
    const id = el.dataset.hrPick;
    /* Ticked: back in if it was left out, else over the plan. */
    if(el.checked){ if(hrUi.skip.has(id)) hrUi.skip.delete(id); else hrUi.force.add(id); }
    else { if(hrUi.force.has(id)) hrUi.force.delete(id); else hrUi.skip.add(id); }
    hrRepaint(hrKey(el));
  });
  on("click", `${sheet} [data-hs-all]`, () => { hrUi.all = !hrUi.all; hrRepaint("[data-hs-all]"); });
  on("click", `${sheet} [data-hs-out]`, () => { hrUi.out = !hrUi.out; hrRepaint("[data-hs-out]"); });
  on("click", `${sheet} [data-hs-reset]`, () => {
    const m = hrModel(), r = m.roles.find(x => x.skill === hrUi.sheet);
    if(r) r.pool.forEach(c => { hrUi.skip.delete(c.id); hrUi.force.delete(c.id); });
    hrRepaint("[data-hs-reset]");
  });
  on("click", `${sheet} [data-hs-done], ${sheet} [data-hs-close]`, () => { const d = $("hsSheet"); if(d) d.close(); });
  /* The demand list. */
  on("click", `${page} [data-hr-roster]`, (el, e) => {
    e.preventDefault();
    /* Staffing › Schedules, on the site: its week, and its write. */
    openRoute("staffing/schedules", {pick: el.dataset.hrRoster, arrival: routeCarry("staffing/schedules"), into: "#sp-roster"});
    const block = $("sp-roster");
    if(block){ block.classList.remove("sp-arrived"); void block.offsetWidth; block.classList.add("sp-arrived"); }
  });
  on("click", "[data-hs-dem-open]", el => {
    const target = el.dataset.hsDemOpen;
    if(hrPop && hrPop.target === target){ hrPopClose(true); return; }
    hrPop = {target, all: false};
    hrPopDraw();
    const first = $("hsDemPop") && $("hsDemPop").querySelector("input, button");
    if(first) first.focus({preventScroll: true});
  });
  on("change", "#hsDemPop [data-hr-dem]", el => {
    if(!hrPop) return;
    const d = el.dataset.hrDem;
    const flip = ex => ex.includes(d) ? ex.filter(x => x !== d) : [...ex, d];
    if(hrPop.target === "quick"){
      const q = hrUi.quick;
      q.ex = flip(hrQuickModel(hrModel()).ex);
      hrRepaint(null, ["hsOpen", "hsOrder", "hsQuick"]);
    } else {
      const f = hrFilterTarget(document.querySelector(`[data-hs-dem-open="${CSS.escape(hrPop.target)}"]`) || el);
      f.ex = flip(f.ex);
      hrFiltersSave();
      hrRepaint(null);
    }
  });
  on("click", "#hsDemPop [data-hs-dem-all]", () => { if(!hrPop) return; hrPop.all = true; hrPopDraw(); });
  on("click", "#hsDemPop [data-hs-dem-clear]", () => {
    if(!hrPop) return;
    if(hrPop.target === "quick"){ hrUi.quick.ex = []; hrRepaint(null, ["hsOpen", "hsOrder", "hsQuick"]); }
    else {
      /* A role with no shop week clears its own list, not the shops' Part-time. */
      const f = hrFilterTarget(document.querySelector(`[data-hs-dem-open="${CSS.escape(hrPop.target)}"]`) || document.body);
      const r = hrPop.target ? hrModel().roles.find(x => x.skill === hrPop.target) : null;
      f.ex = f === hrFilters().company && r && !r.shop ? f.ex.filter(d => d === HR_PT) : [];
      hrFiltersSave();
      hrRepaint(null);
    }
  });
  /* A click anywhere else, or Escape, closes the list; a scroll or a resize
     places it again. */
  document.addEventListener("click", e => {
    if(!hrPop) return;
    const t = e.target;
    if(!t.isConnected) return;
    if(t.closest && (t.closest("#hsDemPop") || t.closest("[data-hs-dem-open]"))) return;
    hrPopClose();
  });
  document.addEventListener("keydown", e => {
    if(e.key !== "Escape" || !hrPop) return;
    e.preventDefault(); e.stopPropagation();
    hrPopClose(true);
  }, true);
  const replace = () => {
    const pop = $("hsDemPop"), a = hrPop && document.querySelector(`[data-hs-dem-open="${CSS.escape(hrPop.target)}"]`);
    if(pop && a) hrPopPlace(a, pop);
  };
  window.addEventListener("resize", replace);
  window.addEventListener("scroll", replace, {passive: true});
  /* Quick hire. */
  /* A quick hire's picks take plan weeks from Open places: all of it again. */
  const quick = (el, set) => { set(hrUi.quick); hrRepaint(hrKey(el), ["hsOpen", "hsOrder", "hsQuick"]); };
  on("change", `${page} [data-hq-role]`, el => quick(el, q => { q.skill = el.value; }));
  on("change", `${page} [data-hq-site]`, el => quick(el, q => { q.site = el.value; q.ex = null; }));
  on("click", `${page} [data-hq-less]`, el => quick(el, q => { q.n = Math.max(1, q.n - 1); }));
  on("click", `${page} [data-hq-more]`, el => quick(el, q => { q.n = Math.min(99, q.n + 1); }));
  on("click", `${page} [data-hq-list] summary`, el => { setTimeout(() => { hrUi.quick.open = !!el.parentElement.open; }); });
  on("click", `${page} [data-hq-go]`, el => { if(el.getAttribute("aria-disabled") !== "true") hrQuickReview(); });
}
function wireStaff(){ bindStaff(); bindHireReview(); hrMoreReady(); }

/* --- the review: gwConfirm, kind "hire" ----------------------------------- */
/* One action (Peter, 28 September 2026): "Staff this site" on a site's
   Staffing, "Staff all sites" on this page and Quick hire all open this
   review, one confirm and, with mod 0.4.0, one undo. What it does is one of
   three, picked at the top of the review, and the confirm's verb says which:
   hire and schedule (the hires and moves, and the new week at every site it
   reaches or whose week changes), hire only (assigned, no hours), schedule
   only (the weeks alone). */
const hrWeekStrip = (slots, gap) => {
  const on = new Set((slots || []).map(s => s.d));
  const tip = HR_DAYS.filter(d => on.has(d)).map(d => {
    const s = slots.filter(x => x.d === d).map(x => `${String(x.f).padStart(2, "0")}–${String(x.t).padStart(2, "0")}`).join(", ");
    return `${ttDay(d).slice(0, 3)} ${s}`;
  }).join(" · ");
  return `<span class="hr-wk${gap ? " gap" : ""}" data-tip="${attr(tip || tt("co.hire.wk.none", "no hours: assigned only"))}">${HR_DAYS.map(d => `<i class="${on.has(d) ? "on" : ""}"></i>`).join("")}</span>`;
};
/* A moved person's days: their hire week, or, for the bench a plan already
   counts on, their entries in that plan. */
const hrBenchSlots = (S, x) => {
  if(x.week) return x.week.w.slots || [];
  const row = S.row || {}, p = (row.people || []).findIndex(y => y.id === x.id);
  return p < 0 ? [] : (row.shifts || []).filter(s => s.p === p);
};
const HR_MODES = ["both", "hire", "week"];
const HR_MODE_ICON = {both: "roster", hire: "hire", week: "clock"};
const hrModeWord = k => k === "both" ? tt("co.hire.mode.both", "Hire and schedule")
  : k === "hire" ? tt("co.hire.mode.hire", "Hire only") : tt("co.hire.mode.week", "Schedule only");
/* The three as pills, the one on pressed; none when only one can do anything. */
const hrModeHtml = (modes, mode) => modes.length < 2 ? ""
  : `<div class="gw-pick hr-mode"><span class="nx-sr" id="hrModeLab">${tt("co.hire.mode.label", "What this does")}</span><span class="gw-presets" role="group" aria-labelledby="hrModeLab">${
    modes.map(k => `<button type="button" class="gw-preset" aria-pressed="${k === mode ? "true" : "false"}" data-hr-mode="${k}"><span class="ic">${
      gwSvg(HR_MODE_ICON[k])}</span>${hrModeWord(k)}</button>`).join("")}</span></div>`;
/* Who goes where, one site a row, opened for its people. `phase`: ready,
   wait (applying) or done; `status`, once done, the outcome of each week an
   older mod writes after the hire, one by one: "wait", "done" or {say}. */
function hrReviewSites(req, phase, gone, status){
  const st = status || {};
  const rows = req.shown.map(S => {
    const at = req.touched.get(S.key) || {hires: [], moves: [], week: false, inbound: false};
    const gaps = req.gaps.get(S.key) || [];
    const weekly = !!at.week;
    const hires = at.hires.filter(h => h.w), extra = at.hires.filter(h => !h.w), moves = at.moves;
    /* Done: only who the game hired counts; an application that expired is
       a place still open. Before that, the planned figures. */
    const took = h => !(phase === "done" && gone.has(h.c.id));
    const hired = hires.filter(took), got = extra.filter(took);
    const missed = phase === "done" ? hires.length - hired.length : 0;
    const cost = weekly ? hired.reduce((n, h) => n + Number(h.c.wage || 0) * Number(h.w.hours || 0) / 7, 0) : 0;
    let k = 0;
    const dot = cls => `<i class="${cls}" style="--k:${++k}"></i>`;
    const dots = phase === "ready" ? hires.map(h => dot(gone.has(h.c.id) ? "gap" : "")).join("") + extra.map(() => dot("")).join("")
        + moves.map(() => dot("mv")).join("") + gaps.map(() => dot("gap")).join("")
      : phase === "done" ? [...hired, ...got, ...moves].map(() => dot("done")).join("") + Array.from({length: missed}, () => dot("gap")).join("")
      : [...hires, ...extra, ...moves].map(() => dot("wait")).join("");
    const people = at.hires.length + moves.length;
    const plan = !weekly ? (people ? tt("co.hire.plan.none", "no hours: assigned only") : tt("co.hire.plan.same", "its week stays as it is"))
      : at.additive ? tt("co.hire.plan.add", "its week as it is, with the reassigned hours added")
      : S.variant === "full" ? tt("co.hire.plan.full", "full cover 24/7: opens every day 0 to 24")
      : S.variant === "open" ? (S.site.kind === "office" || S.row && S.row.complete ? tt("co.hire.plan.open", "every station, the hours it opens")
        : tt("co.hire.plan.unread", "every station where nothing is measured yet"))
      : S.site.kind === "office" && !spOfficeReplaces(S.row) && !at.inbound ? tt("co.hire.plan.office", "the office default, added where free")
      : tt("co.hire.plan.board", "hours from the board's plan");
    /* Each site's own outcome once the action has run. */
    const said = phase !== "done" || (!weekly && !people) ? null : at.rest ? st[S.key] || "wait" : "done";
    const mark = !said ? "" : said === "done" ? `<span class="hr-st ok">${gwSvg("tick")}${weekly ? tt("co.hire.st.week", "week written") : tt("co.hire.st.assigned", "assigned")}</span>`
      : said === "wait" ? `<span class="hr-st wait">${tt("co.hire.st.wait", "writing the week…")}</span>`
      : `<span class="hr-st no">${gwSvg("alert")}${said.say || tt("co.hire.st.failed", "week not written")}</span>`;
    const open = hrUi.reviewOpen === S.key;
    const person = (name, sub, role, lv, wage, slots, hours, cls) => `<div class="hr-dp${cls ? ` ${cls}` : ""}"><span class="who"><b>${name}</b><small${sub.mv ? ` class="mv"` : ""}>${sub.t}</small></span><span class="r">${role}</span>
      <span class="m">${lv}</span><span class="m">${wage}</span>${hrWeekStrip(slots, cls === "gap")}<span class="m">${hours}</span></div>`;
    const struck = (c, g) => g ? `<span class="hr-struck">${spEsc(c.name)}</span>` : spEsc(c.name);
    const expired = tt("co.hire.p.expired", "application expired");
    const drawer = open ? `<div class="hr-dpeople"><div class="hr-dp hd"><span>${tt("co.hire.p.person", "Person")}</span><span>${tt("co.hire.p.role", "Role")}</span><span class="m">${
        tt("co.hire.p.skill", "Skill")}</span><span class="m">${tt("co.hire.p.wage", "$/h")}</span><span class="hr-wkd">${
        HR_DAYS.map(d => `<span>${ttDay(d)[0]}</span>`).join("")}</span><span class="m">${tt("co.hire.p.week", "Week")}</span></div>${
      hires.map(h => { const g = gone.has(h.c.id);
        return person(struck(h.c, g), {t: g ? expired : (h.misfit || []).length ? tt("co.hire.p.newbreak", "new hire · hours break a demand") : tt("co.hire.p.new", "new hire")},
          hrRole(h.skill), `${Math.round(hrLevel(h.c, h.skill))}%`, hrWage(h.c.wageUnavailable ? null : h.c.wage), weekly ? h.w.slots : [], weekly ? `${h.w.hours || 0} h` : "–", g ? "gap" : ""); }).join("")}${
      extra.map(h => { const g = gone.has(h.c.id);
        return person(struck(h.c, g), {t: g ? expired : h.nofit ? tt("co.hire.p.nohours.nofit", "new hire · no hours: no open week fits {demands}", {demands: h.nofit.map(hrName).join(", ")})
          : tt("co.hire.p.nohours", "new hire · no hours")}, hrRole(h.skill),
          `${Math.round(hrLevel(h.c, h.skill))}%`, hrWage(h.c.wageUnavailable ? null : h.c.wage), [], "–", g ? "gap" : ""); }).join("")}${
      moves.map(x => person(spEsc(x.p.name || "?"), {t: x.fixed ? tt("co.hire.p.bench", "unassigned, in the plan")
          : x.from ? tt("co.hire.p.from", "reassigned from {site}", {site: spEsc(x.from.b ? shortName(x.from.b) : tt("co.hire.asite", "a site"))})
          : tt("co.hire.p.fromnone", "reassigned, unassigned before"), mv: true},
        hrRole(x.skill), x.p.level !== undefined ? `${Math.round(x.p.level)}%` : "–", x.p.wage !== undefined ? hrWage(x.p.wageUnavailable ? null : x.p.wage) : "–",
        weekly ? hrBenchSlots(S, x) : [], weekly ? `${gwHours(hrBenchSlots(S, x))} h` : "–")).join("")}${
      gaps.map(x => person(tt("co.hire.p.nobody", "Nobody"), {t: x.w.band === "short" ? tt("co.hire.p.short", "too few hours for a hire")
          : (hrLast && hrGapWhyShort(hrLast.m, x)) || tt("co.hire.p.nomatch", "no {role} matches", {role: hrRole(x.w.skill)})}, hrRole(x.w.skill), "–", "–",
        x.w.slots, `${x.w.hours || 0} h`, "gap")).join("")}</div>` : "";
    const counts = !people && !missed ? (weekly ? tt("co.hire.c.week", "week only") : "–")
      : `${phase === "done" ? tt("co.hire.c.hired", "{n} hired", {n: hired.length + got.length}) : tt("co.hire.c.new", "{n} new", {n: hired.length + got.length})}${
        moves.length ? `<span class="mvc">${tt("co.hire.c.moved", "+{n} reassigned", {n: moves.length})}</span>` : ""}${
        missed ? `<span class="mvc gap">${tt("co.hire.c.open", "{n} still open", {n: missed})}</span>` : ""}`;
    return `<div class="hr-dsite${open ? " open" : ""}"><button type="button" class="hr-dhead" data-hr-site="${attr(S.key)}" aria-expanded="${open}">
      <span><span class="nm">${hoodHtml(S.b)}<span class="s">${spEsc(S.b ? shortName(S.b) : S.site.name || "?")}</span>${S.site.new ? `<span class="hr-new">${tt("co.hire.new", "new")}</span>` : ""}</span><span class="plan">${
        spEsc(S.b && S.b.type ? S.b.type : S.site.kind)} · ${plan}${mark}</span></span>
      <span class="hr-dots">${dots}</span><span class="c">${counts}<span class="cst">+${fmt(cost)}</span></span>${hrSvg("chev")}</button>${drawer}</div>`;
  }).join("");
  return `<div class="hr-dsites">${rows}</div>`;
}
let hrLast = null;  // the action on screen: {m, req, o, modes, mode, one, answer, chain}
/* The most a hire body may weigh: the mod's cap for /write/hire, 2 MiB. */
const HR_MAX_BODY = 2 * 1024 * 1024;
const hrBodyBytes = body => new TextEncoder().encode(JSON.stringify(body)).length;
/* The people a move takes off a site whose week this call does not replace:
   the game clears their shifts there and nobody takes those hours. From the
   answer's moved[].shiftsCleared. */
function hrLeftEmpty(req, answer){
  const rewritten = new Set([...(req.body.sites || []).filter(s => s.days).map(s => gwKeyOf(s.address)),
    ...(req.rest || []).map(r => r.S.key)]);
  return ((answer || {}).moved || []).map(mv => {
    const n = Number(mv && mv.shiftsCleared) || 0;
    const x = ((req.names.get(mv && mv.employeeId) || {}).move) || null;
    return n > 0 && x && x.from && !rewritten.has(x.from.key) ? {x, n} : null;
  }).filter(Boolean);
}
/* The action for one of the three, from the page's model now. */
const hrAction = (o, mode, m) => hrRequest(m, {mode, only: o.only || null, site: o.scope === "site" ? o.site : null,
  quick: o.scope === "quick" ? m.quick : null});
/* Which of the three can do anything here, the first the one it opens on:
   hire and schedule where somebody is hired or moved and some week is
   written; hire only where somebody is (a headquarters' or a warehouse's
   only one, having no plan); schedule only where a week changes, never in
   Quick hire or "Pick more". */
function hrModesOf(o, reqs){
  const people = reqs.hire.body.hires.length + reqs.hire.body.moves.length;
  return [people && reqs.both.weeks ? "both" : null, people ? "hire" : null,
          o.scope !== "quick" && !o.only && reqs.week.weeks ? "week" : null].filter(Boolean);
}
/* A week an older mod writes after the hire: what it answered, in a few words. */
function hrChainSay(res){
  if(res.error === "changed") return tt("co.hire.st.changed", "changed in the game: not written");
  /* No answer: it may or may not have been written. */
  if(res.error === "uncertain") return tt("co.hire.st.uncertain", "no answer came: check this week in the game");
  const row = res.error === "refused" && ((res.body || {}).rows || []).find(r => r && r.error);
  const known = row && (GW_REFUSE.schedule[row.error] || GW_REFUSE.any[row.error]);
  return known ? spEsc(typeof known === "function" ? known(row).rule : known.rule) : tt("co.hire.st.failed", "week not written");
}
/* The site list's phase for the dialog's: while applying, "wait" until the
   hire call is answered, then each site's own outcome as the weeks after it
   come in (the chain's entries). */
const hrSitesPhase = (phase, chain) => phase === "applying" ? (Object.keys(chain || {}).length ? "done" : "wait")
  : phase === "done" ? "done" : "ready";
/* The weeks no hire or move reached, written one by one after the hire as
   /write/schedule, where the mod cannot take them in the same call (before
   0.4.0). Each site says how it went, in the review it came from. */
async function hrChain(last, dlg){
  /* While the dialog shows the action, its site list says each site's own
     outcome (the sites the hire call wrote are done from the start), and
     while it is applying, the verdict says how far the chain is. */
  const paint = () => {
    if(!dlg || !dlg.open || !["applying", "done"].includes(dlg.dataset.phase)) return;
    const say = dlg.dataset.phase === "applying" && dlg.querySelector(".gw-verdict b");
    const k = Object.values(last.chain).filter(x => x !== "wait").length;
    if(say) say.textContent = tt("co.hire.chain.writing", "Writing the other weeks: {k} of {n}…", {k, n: last.req.rest.length});
    const list = dlg.querySelector(".hr-dsites");
    if(!list) return;
    const gone = new Set(((last.answer || {}).skipped || []).filter(s => s && s.reason === "gone").map(s => s.candidateId));
    const tmp = document.createElement("div");
    tmp.innerHTML = hrReviewSites(last.req, hrSitesPhase(dlg.dataset.phase, last.chain), gone, last.chain);
    list.replaceWith(tmp.firstElementChild);
    wireTips();
  };
  for(const {S, body} of last.req.rest){
    paint();
    const res = await SOURCE.write("schedule", body, {dryRun: false, approval: gwApprovalView(dlg, () => {})});
    last.chain[S.key] = res.error ? {say: hrChainSay(res), error: res.error} : "done";
    /* Each week written this way replaces the game's one schedule undo, so the
       board's Undo for an earlier schedule write would undo the wrong site. */
    if(!res.error || res.error === "uncertain"){ delete gwUndoable.schedule; gwToast(); }
    paint();
  }
}
/* The board's schedule Undo goes where the game's does: a hire call or its
   undo that touched its site drops it. */
function hrUndoTouched(keys){
  const sched = gwUndoable.schedule;
  if(sched && (sched.sites || []).some(k => keys.has(k))){ delete gwUndoable.schedule; gwToast(); }
}
/* What an older mod does with the weeks no hire or move reaches, `n` of them. */
const hrChainNote = n => gwCall("info", "roster", `${tt("co.hire.chain.later", {
  one: "This mod writes {n} more week after the hire, on its own, and cannot undo any of it.",
  other: "This mod writes the other {n} weeks after the hire, one at a time, and cannot undo any of it."}, {n})} ${
  tt("co.hire.chain.update", "A newer Big Copilot Link does it all in one step, with Undo.")}`);
/* The action's review and confirm. `o`: {scope: "all" | "site" | "quick",
   site (a key), only (Pick more), mode (the one to open on)}; `hooks`:
   onPlan, onDone, onFailed and more, for Quick hire's hold.
   Returns whether the review opened. */
function hrReview(o = {}, hooks = {}){
  /* Open at once; gwConfirm's waiting state holds every planning read. */
  const scope = odScope();
  o = Object.assign({scope: "all"}, o);
  let pick = o.mode || null;
  let planned = false;
  const build = () => {
    if(hooks.onPlan) hooks.onPlan();
    const m = hrModel();
    const reqs = {};
    HR_MODES.forEach(k => { reqs[k] = hrAction(o, k, m); });
    const modes = hrModesOf(o, reqs);
    const mode = modes.includes(pick) ? pick : modes[0] || "both";
    hrLast = {m, req: reqs[mode], o, modes, mode, one: reqs[mode].one, answer: null, chain: {}};
    planned = true;
    return hrLast;
  };
  const counts = () => {
    const r = hrLast.req, b = r.body;
    return {hire: b.hires.length, move: b.moves.length, weeks: r.weeks, sites: b.sites.length + r.rest.length};
  };
  const goneOf = answer => new Set(((answer || {}).skipped || []).filter(s => s && s.reason === "gone").map(s => s.candidateId));
  const nameOf = id => ((hrLast.req.names.get(id) || {}).name) || tt("co.hire.someone", "someone");
  const siteB = () => o.scope === "site" ? (D.businesses || []).find(b => b.key === o.site) || null
    : o.scope === "quick" && hrLast.m.quick.S ? hrLast.m.quick.S.b : null;
  const people = answer => (answer.hired || []).length + (answer.moved || []).length;
  /* The company's first hire comes with the game's one-time first-employee
     bonus, which no undo takes back: the mod answers it `undoable` false. */
  const firstHire = () => !!hrLast.one && hrLast.mode !== "week" && counts().hire > 0 && !(D.staff && D.staff.total);
  let firstAsked = false;  /* as the last dry run judged it: an apply rebuilds hrLast */
  const weeksOf = answer => (answer.sites || []).filter(s => s && s.before && s.after).length;
  /* An older mod's weeks written after the call (hrChain()): written, refused
     or not written, and those that got no answer. */
  const chainTally = () => {
    const ch = Object.values(hrLast.chain || {});
    return {done: ch.filter(x => x === "done").length, none: ch.filter(x => x && x.error === "uncertain").length,
            failed: ch.filter(x => x && x.error && x.error !== "uncertain").length, all: ch.length};
  };
  let written = [];  // the progress records of the apply (pgHireDone())
  let applied = null;  // the action as applied, for its Undo
  gwConfirm({
    kind: "hire", icon: "hire", needs: ["hiring"], scope,
    title: () => {
      if(!planned && (!odBoardScope || odSameScope(odBoardScope, scope)) && odReady("hiring")) build();
      return o.only ? tt("co.hire.title.more", "Pick more")
      : o.scope === "site" ? tt("co.hire.title.site", "Staff {site}", {site: siteB() ? shortName(siteB()) : tt("co.hire.thissite", "this site")})
      : o.scope === "quick" ? tt("co.hire.title.quick", "Quick hire: {role}", {role: (planned && gameName(hrLast.m.quick.q.skill)) || tt("co.hire.arole", "a role")})
      : tt("co.hire.title.all", "Staff all sites");
    },
    where: () => !planned ? "" : siteB() ? gwWhere(siteB()) : `<span>${tt("co.hire.where.all", {one: "{n} site", other: "{n} sites"}, {n: counts().sites})}</span>`,
    /* Asked first on every dry run and apply: the action is planned afresh
       from the board on screen and the pick, then judged. */
    nothing: () => {
      build();
      const c = counts();
      if(!c.hire && !c.move && !c.weeks) return o.scope === "quick" ? tt("co.hire.none.quick", "Nobody matches: change the role, the site or the filters.")
        : tt("co.hire.none", "Nothing to do: every planned site has its people and its week, or nobody matches your filters.");
      if(hrLast.req.body.sites.some(s => s.days && typeof s.expect !== "string"))
        return tt("co.hire.reread", "Read the game again first: this board does not know a site's schedule well enough to replace it.");
      const bytes = hrBodyBytes(hrLast.req.body);
      if(bytes > HR_MAX_BODY)
        return tt("co.hire.toolarge", "This is more than the game link takes in one go: the weeks of {n} sites come to {mb} MB, and the link takes 2 MB. Staff the sites one at a time from their Staffing, or narrow a role's filters so fewer sites are hired into.",
          {n: c.sites, mb: num(bytes / 1048576, {minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false})});
      return "";
    },
    nothingSay: () => hrLast && hrBodyBytes(hrLast.req.body) > HR_MAX_BODY ? `<b>${tt("co.hire.toomuch", "Too much for one go")}</b>` : "",
    body: () => hrLast.req.body,
    verdict: answer => answer.ok ? (goneOf(answer).size ? `<b>${tt("co.hire.v.some", "The game can take {n} of {of}", {n: counts().hire - goneOf(answer).size, of: counts().hire})}</b>`
        : `<b>${tt("co.hire.v.all", "The game can take all of it")}</b>`)
      : answer.blocked === "myemployees" ? `<b>${tt("co.hire.v.myemployees", "Close MyEmployees in the game")}</b>` : `<b>${tt("sp.gw.refuses", "The game refuses this")}</b>`,
    /* A refused hire or move never happens, so the game reads every shift
       of theirs in the same call as somebody not assigned there: those rows
       are the refusal above, not a second problem. */
    fold: rows => {
      const out = new Set(rows.filter(r => r && r.error && (r.scope === "hire" || r.scope === "move")).map(r => r.id));
      return out.size ? rows.filter(r => !(r && r.scope === "shift" && r.error === "not_assigned" && out.has(hrShiftWho(hrLast.req, r)))) : rows;
    },
    object: row => {
      /* A candidate is nobody's staff yet: the chip says where and as what
         the plan hires them, so it does not read as someone already here. */
      if(row.scope === "hire" || row.scope === "move"){
        const sent = row.scope === "hire" ? hrLast.req.body.hires.find(x => x.candidateId === row.id)
          : hrLast.req.body.moves.find(x => x.employeeId === row.id);
        const to = sent && (row.scope === "hire" ? sent.address : sent.to);
        const S = to && hrLast.m.sites.find(x => x.key === gwKeyOf(to));
        const skill = (hrLast.req.names.get(row.id) || {}).skill;
        return S && S.b && skill ? tt("co.hire.refuse.chip", "{name} as {role} at {site}",
          {name: spEsc(nameOf(row.id)), role: hrRole(skill), site: spEsc(shortName(S.b))}) : spEsc(nameOf(row.id));
      }
      const S = row.address && hrLast.m.sites.find(x => x.key === gwKeyOf(row.address));
      const site = S && S.b ? spEsc(shortName(S.b)) : row.address ? gwSiteName(row) : tt("co.hire.asite.cap", "A site");
      return row.scope === "shift" && row.d !== undefined ? `${site}: ${ttDay(row.d)}` : site;
    },
    draw: (answer, phase) => {
      const {m, req, mode} = hrLast, gone = goneOf(answer), c = counts();
      if(phase === "refused") return "";
      if(phase === "undone") return gwTiles([[tt("co.hire.tile.unhired", "Hires taken back"), null, hrNum((answer.hired || []).length)],
        [tt("co.hire.tile.movedback", "Moved back"), null, hrNum((answer.moved || []).length)],
        [tt("co.hire.tile.restored", "Weeks as they were"), null, hrNum(weeksOf(answer))]]);
      const sites = hrReviewSites(req, hrSitesPhase(phase, hrLast.chain), gone, hrLast.chain);
      if(phase === "applying") return `<div class="hr-prog"><i></i></div>${sites}`;
      /* The wages a day of those hired onto a week: nobody is paid for hours they are not given. */
      const bill = [...req.touched.values()].filter(at => at.week).reduce((n, at) => n + at.hires.filter(h => h.w && !gone.has(h.c.id))
        .reduce((k, h) => k + Number(h.c.wage || 0) * Number(h.w.hours || 0) / 7, 0), 0);
      const allGaps = [...req.gaps].flatMap(([key, list]) => list.map(x => ({S: m.sites.find(y => y.key === key), x})));
      /* A week too short for any contract is hours left open, said apart. */
      const gaps = allGaps.filter(g => g.x.w.band !== "short");
      const shortGaps = [...new Map(allGaps.filter(g => g.x.w.band === "short").map(({S, x}) => [`${S.key}|${x.w.skill}`, {S, skill: x.w.skill,
        h: allGaps.filter(g => g.S === S && g.x.w.skill === x.w.skill && g.x.w.band === "short").reduce((n, g) => n + Number(g.x.w.hours || 0), 0)}])).values()];
      const shortCall = shortGaps.length ? gwCall("", "clock", shortGaps.map(g => tt("co.hire.gap.short", "<b>{site}</b>: {h} h a week of {role} too few for a hire, left open.",
        {site: spEsc(g.S.b ? shortName(g.S.b) : tt("co.hire.asite.cap", "A site")), h: g.h, role: hrRole(g.skill)})).join(" ")) : "";
      const gapText = [...new Map(gaps.map(({S, x}) => [`${S.key}|${x.w.skill}`, {S, skill: x.w.skill,
        n: gaps.filter(g => g.S === S && g.x.w.skill === x.w.skill).length,
        h: gaps.filter(g => g.S === S && g.x.w.skill === x.w.skill).reduce((n, g) => n + Number(g.x.w.hours || 0), 0)}])).values()]
        .map(g => tt("co.hire.gap", {one: "<b>{site} keeps {n} {role} place open</b> ({h} hours a week)", other: "<b>{site} keeps {n} {role} places open</b> ({h} hours a week)"},
          {site: spEsc(g.S.b ? shortName(g.S.b) : tt("co.hire.asite.cap", "A site")), n: g.n, role: hrRole(g.skill), h: g.h})).join("; ");
      /* Why nobody free takes them, a sentence each after the list. */
      const gapWhy = [...new Map(gaps.map(({S, x}) => [`${S.key}|${x.w.skill}`, {S, x}])).values()]
        .map(({S, x}) => hrGapWhySentence(m, S, x)).filter(Boolean).join(" ");
      const goneCall = gone.size ? gwCall("warn", "alert", `${tt("co.hire.gone", {one: "<b>{n} application expired before the game reached it:</b>", other: "<b>{n} applications expired before the game reached them:</b>"}, {n: gone.size})} ${
        [...gone].map(id => `<span class="hr-struck">${spEsc(nameOf(id))}</span>`).join(", ")}. ${tt("co.hire.gone.empty", "Their hours stay empty.")}`) : "";
      const emptied = hrLeftEmpty(req, answer);
      const emptyCall = emptied.length ? gwCall("warn", "alert", tt("co.hire.emptied", "<b>Hours left empty</b> where a reassign takes someone away and the week is not replaced: {who}. Nobody takes those hours.",
        {who: emptied.map(({x, n}) => tt("co.hire.emptied.one", {one: "{name} ({n} stretch of hours at {site})", other: "{name} ({n} stretches of hours at {site})"},
          {name: spEsc(x.p.name || tt("co.hire.someone", "someone")), n, site: spEsc(x.from.b ? shortName(x.from.b) : tt("co.hire.asite", "a site"))})).join(", ")})) : "";
      if(phase === "done"){
        const hired = (answer.hired || []).length, moved = (answer.moved || []).length;
        /* "Pick N more" re-picks week hires only: a gone hire with no hours is not a place. */
        const open = req.body.hires.filter(h => gone.has(h.candidateId)
          && [...req.touched.values()].some(at => at.hires.some(x => x.c.id === h.candidateId && x.w))).length;
        const button = `<button type="button" class="gw-mini-b" data-hr-more disabled title="${
          attr(tt("co.hire.more.wait", "Waiting for the board to read the game"))}">${tt("co.hire.more.button", "Pick {n} more", {n: open})}</button>`;
        const more = open ? gwCall("", "hire", tt("co.hire.more.said", {
          one: "{n} place still open: {button} opens the review for it alone.",
          other: "{n} places still open: {button} opens the review for those alone."}, {n: open, button})) : "";
        /* Why there is no Undo: the first hire's bonus (firstHire()). */
        const first = firstAsked && answer.undoable === false && hired ? gwCall("info", "info",
          tt("co.hire.done.first", "No Undo: this was your company's first hire, and the game's one-time first-employee bonus cannot be taken back.")) : "";
        /* An older mod's weeks after the call count once written. */
        const ch = chainTally(), weeks = c.weeks - (ch.all - ch.done);
        return `${gwTiles([[tt("co.hire.tile.hired", "Hired"), null, hrNum(hired)], [tt("co.hire.tile.moved", "Reassigned"), null, hrNum(moved)],
            ...(mode === "hire" ? [] : [[tt("co.hire.tile.weeks", "Site schedules"), null, hrNum(weeks)]]),
            [tt("co.hire.tile.wages", "Added wages"), null, `+${fmt(bill)}<small class="hr-u">${tt("co.hire.perday", "/day")}</small>`]])}
          ${mode === "hire" ? "" : `<p class="gw-lead">${tt("co.hire.starts", "Everyone starts on their hours from the next hour in the game.")}</p>`}${sites}${goneCall}${emptyCall}${more}${first}
          ${gapText ? gwCall("warn", "alert", `${gapText}. ${gapWhy ? `${gapWhy} ` : ""}${tt("co.hire.gap.stays", "It stays on the Staff page until someone matches.")}`) : ""}${shortCall}
          ${hrLast.one ? "" : `<p class="hr-lock">${gwSvg("lock")}<span>${tt("co.hire.noundo.done", "No undo with this mod. To let someone go, fire them in MyEmployees in the game.")}</span></p>`}`;
      }
      const blocked = answer.blocked === "myemployees" ? `<div class="gw-no"><span class="ic">${hrSvg("phone")}</span><div class="rule">${tt("co.hire.myemployees", "MyEmployees is open in the game.")}</div><div class="fix">${
        gwSvg("right")}<span>${tt("co.hire.myemployees.fix", "Close the MyEmployees app on your in-game phone, then try again.")}</span></div></div>` : "";
      const rewritten = (answer.sites || []).filter(s => s && s.before && s.after);
      /* Who this leaves with no hours at a site: the site's own people the
         week gives none (`stranded`) and those the game's answer names
         (`leftWithout`), each once, in one plain note: they stay on as spare,
         which is fine (Peter, 29 September 2026). */
      const spare = new Map();
      [...req.touched.values()].forEach(at => (at.stranded || []).forEach(id => {
        if(!spare.has(id)) spare.set(id, gwWho(id, at.S.row).name);
      }));
      const spareNames = new Set([...spare.values()].filter(Boolean));
      rewritten.forEach(s => (s.leftWithout || []).forEach(p => {
        if(!p) return;
        const key = p.employeeId || `name:${p.name}`;
        if(spare.has(key) || (!p.employeeId && spareNames.has(p.name))) return;
        spare.set(key, p.name);
      }));
      const left = [...spare.values()].map(name => `<span class="person"><i>${spEsc(gwInitials(name))}</i>${spEsc(name || tt("co.hire.someone", "someone"))}</span>`);
      const fewer = hrFewer(m, req, rewritten);
      const fewerCall = fewer.length ? gwCall("", "roster", tt("co.hire.fewer", "<b>Fewer hours than now</b> in the week sent: {who}.",
        {who: fewer.map(({S, r}) => tt("co.hire.fewer.one", "{name} ({site}, {now} → {h} h)", {name: spEsc(r.name || tt("co.hire.someone", "someone")),
          site: spEsc(S.b ? shortName(S.b) : tt("co.hire.asite", "a site")), now: hrNum(r.now), h: hrNum(r.hours)})).join(", ")})) : "";
      const displaced = [...req.touched.values()].filter(at => at.lost && at.lost.hours > 0);
      const displacedCall = displaced.length ? gwCall("", "roster", tt("co.hire.displaced", "<b>Hours the plan takes over</b>: hours the plan does not own that overlap its own are cut to fit, {where}. The people on them keep any hours outside the plan's.",
        {where: displaced.map(at => tt("co.hire.displaced.one", {one: "{site} {n} hour a week", other: "{site} {n} hours a week"},
          {site: spEsc(at.S.b ? shortName(at.S.b) : tt("co.hire.asite", "a site")), n: at.lost.hours})).join(", ")})) : "";
      /* Hires that join with no hours at a site whose week this writes: said,
         with the way to hire without hours on purpose. */
      /* Each with their own reason, as Quick hire's list gives it (PR #184). */
      const zeroWhy = z => z.nofit ? tt("co.hire.quick.nofit", "no open week fits {demands}", {demands: z.nofit.map(hrName).join(", ")})
        : tt("co.hire.zero.noweek", "the plan has no open week left for them");
      const zero = mode === "both" && req.zero.length ? gwCall("warn", "clock", `${tt("co.hire.zero.head",
        {one: "<b>{n} hire joins with no hours</b>.", other: "<b>{n} hires join with no hours</b>."}, {n: req.zero.length})} ${
        tt("co.hire.zero.fix", "Choose Hire only to hire without hours, or hire fewer.")}<ul class="gw-chk">${
        req.zero.map(z => `<li>${tt("co.hire.zero.one", "<b>{name}</b>: {why}", {name: spEsc(z.c.name || "?"), why: zeroWhy(z)})}</li>`).join("")}</ul>`) : "";
      const chain = !hrLast.one && req.rest.length ? hrChainNote(req.rest.length) : "";
      /* Every week this call writes, checked per person (gwWeekCheck()). */
      /* Somebody the call moves elsewhere is checked where they go, not left
         an empty week where they were (PR #184). */
      const writes = [...req.body.sites.filter(x => x.days), ...req.rest.map(r => r.body)], away = new Set(req.body.moves.map(x => x.employeeId));
      const checked = writes.flatMap(x => {
        const S = m.sites.find(y => y.key === gwKeyOf(x.address));
        const row = S && S.site.kind === "office" && !(req.touched.get(S.key) || {}).inbound ? gwOfficeRow(S.key) : S && S.row;
        return gwWeekCheck(row, x.days, away).map(p => Object.assign(p, writes.length > 1 && S ? {site: spEsc(hrSiteName(S))} : {}));
      });
      const warned = [...req.touched.values()].flatMap(at => at.hires.filter(h => hrWarns(m, h.c, at.S, h.w ? {w: h.w, S: at.S} : null).length));
      const officeLeft = [...req.touched.values()].flatMap(at => (at.leftOut || []).map(x => gwCall("warn", "alert", tt("sp.gw.sch.office.left",
        "<b>{name}</b>: {h} h of the office default left out, more than their week can take",
        {name: spEsc(x.name || tt("sp.gw.someone.cap", "Someone")), h: x.hours})))).join("");
      return `${hrModeHtml(hrLast.modes, mode)}${blocked}${gwTiles([[tt("co.hire.tile.hire", "Hire"), null, hrNum(c.hire)], [tt("co.hire.tile.move", "Reassign"), null, hrNum(c.move)],
          ...(mode === "hire" ? [] : [[tt("co.hire.tile.weeks", "Site schedules"), null, hrNum(c.weeks)]]),
          [tt("co.hire.tile.wages", "Added wages"), null, `+${fmt(bill)}<small class="hr-u">${tt("co.hire.perday", "/day")}</small>`]])}
        ${mcOrdinaryWageNote()}<p class="gw-lead">${tt("co.hire.lead", "Who goes where. Open a site to see each person and the days they work.")}</p>
        ${sites}${goneCall}${zero}${fewerCall}${emptyCall}${displacedCall}${left.length ? `<div class="gw-box">${gwCall("", "exit", tt("sp.gw.left.head", "<b>No hours here after this</b>"))}<div class="gw-pills">${left.join("")}</div></div>` : ""}
        ${gapText ? gwCall("warn", "alert", `${gapText}.${gapWhy ? ` ${gapWhy}` : ""}`) : ""}${shortCall}${chain}
        ${(req.unreadableSites || []).map(S => gwCall("warn", "alert", tt("sp.evidence.unreadable", "{site}: the current schedule contains unreadable entries. Hires and assignments can proceed, but this office's schedule will stay unchanged; repair its entries in BizMan before applying staffing.", {site: spEsc(hrSiteName(S))}))).join("")}
        ${gwCheckLines(checked)}${officeLeft}
        ${warned.length ? gwCall("info", "info", tt("co.hire.warned", {one: "{n} person asks for something their site does not meet (marked orange in Change picks). They are hired anyway.",
          other: "{n} people ask for something their site does not meet (marked orange in Change picks). They are hired anyway."}, {n: warned.length})) : ""}`;
    },
    bind: (dlg, replan) => {
      dlg.querySelectorAll("[data-hr-mode]").forEach(b => { b.onclick = () => {
        if(b.getAttribute("aria-pressed") === "true" || b.classList.contains("gw-busy")) return;
        pick = b.dataset.hrMode;
        /* Said at once on the pill; the rest waits for the game's answer. */
        dlg.querySelectorAll("[data-hr-mode]").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
        replan(b);
      }; });
    },
    /* An older mod's schedule only: the hire call would carry nothing, and
       MyEmployees open would still refuse it. The weeks go one by one. */
    local: (body, dryRun) => !hrLast.one && !body.hires.length && !body.moves.length && !body.sites.length
      ? {ok: true, kind: "hire", dryRun, hired: [], moved: [], skipped: [], sites: [], wageAdded: 0, rows: []} : null,
    get hint(){ return firstHire() ? tt("co.hire.hint.first", "Your company's first hire cannot be undone: the game gives its one-time first-employee bonus with it.")
      : hrLast.one ? tt("co.hire.hint.undo", "Undo takes every hire, reassign and week of this back in one step.")
      : tt("co.hire.hint.noundo", "This mod cannot undo a hire. To let someone go later, fire them in the MyEmployees app in the game."); },
    refusedHint: answer => answer.blocked === "myemployees" ? tt("co.hire.refused.myemployees", "The game cannot hire while you are in that app.") : tt("sp.gw.unchanged", "Nothing was changed."),
    learn: answer => { hrLast.answer = answer; if(answer.dryRun !== false) firstAsked = firstHire(); },
    /* Every person picked has left the candidate list since the board read
       the game: a Quick hire, or a hire with nothing else to do (no reassign
       and no week), would write nothing but the week with nobody on it (and
       open a shop around the clock). Apply stays off until the board reads
       the game again. Anywhere else the moves and weeks still go, and the
       pills stay. */
    idle: answer => {
      const b = hrLast.req.body, n = b.hires.length;
      if(!n || goneOf(answer).size < n || (o.scope !== "quick" && (b.moves.length || hrLast.req.weeks))) return "";
      return tt("co.hire.idle.gone", {one: "Nobody to hire: the application ran out since the board read the game. Refresh the board to pick again.",
        other: "Nobody to hire: all {n} applications ran out since the board read the game. Refresh the board to pick again."}, {n});
    },
    /* The verb says which of the three it does. */
    applyLabel: () => {
      if(!planned) return tt("co.hire.go.both", "Hire and schedule");
      const c = counts(), mode = hrLast.mode;
      if(mode === "week") return tt("co.hire.go.week", {one: "Write {n} week", other: "Write {n} weeks"}, {n: c.weeks});
      if(mode === "hire") return c.move ? tt("co.hire.go.hiremove", "Hire {h}, reassign {m}", {h: c.hire, m: c.move}) : tt("co.hire.go.hire", "Hire {n}", {n: c.hire});
      return o.scope === "all" && !o.only ? tt("co.hire.go.all", {one: "Staff {n} site", other: "Staff {n} sites"}, {n: c.sites})
        : tt("co.hire.go.both", "Hire and schedule");
    },
    applying: tt("co.hire.applying", "Hiring, reassigning and writing the weeks…"),
    /* One undo for the whole of it, from mod 0.4.0 (none before), where the
       mod says it kept it (`undoable`). */
    changed: answer => !!hrLast.one && answer.undoable === true && (people(answer) > 0
      || (answer.sites || []).some(s => s && s.before && s.after && (s.before.print !== s.after.print || s.openedHours))),
    done: answer => {
      if(answer.undo) return tt("co.hire.undone", "Undone: every hire, reassign and week of that step is back as it was.");
      /* The weeks an older mod writes after the call are counted too. */
      const n = people(answer), ch = answer.dryRun === false && !hrLast.one ? chainTally() : {done: 0, none: 0, failed: 0};
      const w = weeksOf(answer) + ch.done;
      const said = [n ? tt("co.hire.done.people", {one: "{n} person hired or reassigned in the game.", other: "{n} people hired or reassigned in the game."}, {n}) : "",
        w ? tt("co.hire.done.weeks", {one: "{n} week written.", other: "{n} weeks written."}, {n: w}) : "",
        ch.failed ? tt("co.hire.done.failed", {one: "{n} week not written.", other: "{n} weeks not written."}, {n: ch.failed}) : "",
        ch.none ? tt("co.hire.done.noanswer", {one: "{n} week got no answer: check it in the game.", other: "{n} weeks got no answer: check them in the game."}, {n: ch.none}) : ""]
        .filter(Boolean).join(" ");
      return said || tt("co.hire.done.none", "Nothing changed in the game.");
    },
    undoHint: () => tt("co.hire.undohint", "Undo takes it all back, until the game's next day."),
    onDone: answer => {
      const last = hrLast;
      last.answer = answer;
      applied = last;
      written = pgHireDone(last.req.body, answer);
      /* The game drops its schedule undo for a site this call wrote (HireWrite's
         ForgetScheduleUndo): so does the board. */
      const wrote = new Set([...(answer.sites || []).filter(x => x && x.after).map(x => gwKeyOf(x.address)),
        ...(answer.moved || []).filter(x => x && x.shiftsCleared).map(x => ((last.req.names.get(x.employeeId) || {}).move || {}).from).filter(Boolean).map(S => S.key)]);
      const sched = gwUndoable.schedule;
      if(sched && (sched.sites || []).some(k => wrote.has(k))) delete gwUndoable.schedule;
      const gone = goneOf(answer);
      const only = {};
      last.req.body.hires.forEach(h => {
        if(!gone.has(h.candidateId)) return;
        const at = [...last.req.touched.values()].find(x => x.hires.some(y => y.c.id === h.candidateId && y.w));
        const x = at && at.hires.find(y => y.c.id === h.candidateId);
        if(x){ const k = `${at.S.key}|${x.skill}`; only[k] = (only[k] || 0) + 1; }
      });
      hrUi.more = Object.keys(only).length ? {only, board: D} : null;
      /* Placed people leave the page's ticks: they are staff now. */
      last.req.body.hires.forEach(h => { hrUi.force.delete(h.candidateId); hrUi.skip.delete(h.candidateId); });
      hrHiredAdd((answer.hired || []).map(h => h && h.candidateId));
      /* An older mod: the other weeks now, one by one, each said in the review. */
      if(last.req.rest.length){
        last.req.rest.forEach(({S}) => { last.chain[S.key] = "wait"; });
        const dlg = gwOpen;
        last.chainRun = Promise.resolve().then(() => hrChain(last, dlg));
      }
      if(hooks.onDone) hooks.onDone(answer);
    },
    /* Done is said once an older mod's weeks after the call are all answered. */
    settle: () => (applied && applied.chainRun) || null,
    onFailed: res => { if(hooks.onFailed) hooks.onFailed(res); },
    /* Undone: whoever it hired is a candidate again, and its records go. */
    /* The call this Undo is for (`applied`), not the review on screen now: the
       strip's Undo can come after another review opened. */
    onUndo: () => {
      pgDrop(written); written = [];
      const back = new Set((((applied || {}).answer || {}).hired || []).map(h => h && h.candidateId));
      /* The mod drops its schedule undo for every site the hire undo touched
         (ForgetScheduleUndo): so does the board. */
      const b = ((applied || {}).req || {}).body || {};
      hrUndoTouched(new Set([...(b.sites || []).map(x => x.address), ...(b.hires || []).map(x => x.address),
        ...(b.moves || []).flatMap(x => [x.to, x.from])].filter(Boolean).map(gwKeyOf)));
      if(hrUi.hired) back.forEach(id => hrUi.hired.ids.delete(id));
      hrUi.more = null;
      hrStale();
    },
    more: hooks.more || null,
  });
  if(gwOpen) gwOpen.classList.add("hr-wide");
  return !!(gwOpen && gwOpen.open);
}
/* The people a replaced week gives fewer hours than the game has them on now,
   by the site's plan (`fewer`), for the sites the dry run says it rewrites
   and the ones written after it; never at an office whose write only adds. */
function hrFewer(m, req, rewritten){
  const keys = new Set([...(rewritten || []).map(s => s && s.address && gwKeyOf(s.address)).filter(Boolean),
    ...((req && req.rest) || []).map(r => r.S.key)]);
  /* The week each site is sent, against the game's: hours per person. */
  const sent = new Map([...req.body.sites.filter(x => x.days).map(x => [gwKeyOf(x.address), x.days]),
    ...(req.rest || []).map(r => [r.S.key, r.body.days])]);
  const away = new Set(req.body.moves.map(x => x.employeeId));
  const sum = (map, id, h) => map.set(id, (map.get(id) || 0) + h);
  return m.sites.filter(S => keys.has(S.key) && !(S.site.kind === "office" && !spOfficeReplaces(S.row) && !((req.touched.get(S.key) || {}).inbound)))
    .flatMap(S => {
      const row = S.row || {};
      /* A row that does not carry the game's week: the plan's own figures. */
      if(!row.current || !sent.has(S.key)) return (S.plan.fewer || []).map(r => ({S, r}));
      const now = new Map(), then = new Map();
      (row.current.list || []).forEach(s => { const id = ((row.people || [])[s.p] || {}).id; if(spHasId(id)) sum(now, id, s.t - s.f); });
      sent.get(S.key).forEach(({shifts}) => (shifts || []).forEach(x => sum(then, x.employeeId, x.t - x.f)));
      /* Nobody moved away, and nobody left with none (named on their own). */
      return [...now].filter(([id, h]) => !away.has(id) && (then.get(id) || 0) > 0 && then.get(id) < h)
        .map(([id, h]) => ({S, r: {id, name: gwWho(id, row).name, now: h, hours: then.get(id)}}));
    });
}
/* A site row in the review opens for its people. */
let hrReviewBound = false;
function bindHireReview(){
  if(hrReviewBound) return;
  hrReviewBound = true;
  on("click", "dialog [data-hr-site]", b => {
    if(!hrLast) return;
    const key = b.dataset.hrSite, dlg = b.closest("dialog");
    hrUi.reviewOpen = hrUi.reviewOpen === key ? null : key;
    const phase = hrSitesPhase(dlg.dataset.phase, hrLast.chain);
    const gone = new Set(((hrLast.answer || {}).skipped || []).filter(s => s && s.reason === "gone").map(s => s.candidateId));
    const tmp = document.createElement("div");
    tmp.innerHTML = hrReviewSites(hrLast.req, phase, gone, hrLast.chain);
    b.closest(".hr-dsites").replaceWith(tmp.firstElementChild);
    const again = dlg.querySelector(`[data-hr-site="${CSS.escape(key)}"]`);
    if(again) again.focus();
    wireTips();
  });
  /* "Pick N more" after a partial result: once the board has read the game,
     the review again for those places only. */
  on("click", "[data-hr-more]", el => {
    const more = hrUi.more;
    if(!more || more.board === D) return;
    /* Kept until the review opens: it may wait for the Staff page's key. */
    odThen("hiring", () => { hrUi.more = null; hrReview({only: more.only}); }, "hrReview");
  });
}
/* The button waits for the board read after the apply. */
function hrMoreReady(){
  const more = hrUi.more;
  if(!more || more.board === D || !gwOpen) return;
  gwOpen.querySelectorAll("[data-hr-more]").forEach(b => { b.disabled = false; b.removeAttribute("title"); });
}
/* A roster's pick between its two plans changes what Staff proposes: it is
   drawn again when it is next shown. */
function hrStale(){
  const row = PAGE_DRAWS.find(r => r[2] === "staff");
  if(row && hasData()) pageStale.add(row);
}
/* ...and what Staffing › Schedules summarises for that shop. */
function nxSchedStale(){
  const row = PAGE_DRAWS.find(r => r[2] === "schedules");
  if(row && hasData()) pageStale.add(row);
}
/* Staffing › Payroll (docs/architecture.md, Pages): the Payroll view main folded
   into Company › Staff (issue #89) stays a view of its own in the redesign, beside
   Staff needs.
   Payroll is the headcount by role against the biggest role, and whatever needs
   doing as a chip beside the heading: nobody unhappy and nothing absent leaves
   one satisfaction chip. */
function payrollWhy(){
  const off = (D.businesses || [])
    .map(b => [b, (b.wages || 0) - (b.staffCost || 0)])
    .filter(([b, d]) => !b.wageUnavailable && !b.staffCostUnavailable && Math.abs(d) >= Math.max(100, (b.staffCost || 0) * .05))
    .sort((a, z) => Math.abs(z[1]) - Math.abs(a[1]));
  const sites = off.slice(0, 4).map(([b, d]) => `${b.name} (${d > 0 ? "+" : ""}${fmt(d)})`).join(", ");
  return tt("co.pay.why.rates", "At today's rates: each person's hourly wage times their assigned weekly hours, over seven days.")
    + " " + tt("co.pay.why.booked", "Booked yesterday: the wages yesterday's statements recorded, the Wages total of the Portfolio.")
    + (!off.length ? "" : " " + (off.length > 4
      ? tt("co.pay.why.differ.more", "They differ at {sites} and {n} more.", {sites, n: off.length - 4})
      : tt("co.pay.why.differ", "They differ at {sites}.", {sites})));
}
/* The sites whose booked wages part from their people's rates and hours,
   largest first: what explains the Payroll's two figures. */
const payrollOff = () => (D.businesses || [])
  .map(b => [b, (b.wages || 0) - (b.staffCost || 0)])
  .filter(([b, d]) => !b.wageUnavailable && !b.staffCostUnavailable && Math.abs(d) >= Math.max(100, (b.staffCost || 0) * .05))
  .sort((a, z) => Math.abs(z[1]) - Math.abs(a[1]));
function drawPayroll(){
  const st = D.staff;
  const rolesOpen = q(".pay-roles", $("secPayroll"))?.open;
  const trouble = [[n => tt("co.pay.unhappy", "{n} unhappy", {n}), st.unhappy, tt("co.pay.unhappy.tip", "Satisfaction below 70%")],
                   [n => tt("co.pay.out", "{n} out", {n}), st.absent, tt("co.pay.out.tip", "Absent today")],
                   [n => tt("co.pay.complaining", "{n} complaining", {n}), st.complaining,
                    tt("co.pay.complaining.tip", "With an open complaint")]].filter(([,v]) => v);
  const max = Math.max(...st.roles.map(r => r.count), 1);
  const booked = D.kpi && (D.daily || []).length ? D.kpi.wageBill || 0 : null;
  /* Two wage figures that legitimately differ, each saying what it is, and
     the difference only where both are known. */
  const diff = booked === null || st.wageUnavailable ? null : (st.dailyCost || 0) - booked;
  /* The labels say what each tile is; the formulas are the heading's tip
     (payrollWhy()). Only a missing statement is said under its tile. */
  const tile = (lab, v, small, cls = "") => `<div class="pay-tile ${cls}"><span class="lab">${lab}</span><b>${v}</b>${small ? `<small>${small}</small>` : ""}</div>`;
  const tiles = `<div class="pay-tiles">${tile(tt("co.pay.tile.people", "People"), num(st.total), "")}${
    tile(tt("co.pay.tile.rate", "At today's rates"), st.wageUnavailable ? "—" : fmt(st.dailyCost || 0), st.wageUnavailable ? tt("co.mod.wageUnknown", "Current hourly wages could not be verified.") : "")}${
    booked === null ? tile(tt("co.pay.tile.booked", "Booked yesterday"), "—", tt("co.pay.tile.booked.none", "no statement yet"))
      : tile(tt("co.pay.tile.booked", "Booked yesterday"), fmt(booked), "")}${
    diff === null ? "" : tile(tt("co.pay.tile.diff", "Difference"), `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${fmt(Math.abs(diff))}`, "", Math.abs(diff) >= 100 ? "warn" : "")}</div>`;
  const off = payrollOff();
  const sites = off.length ? `<div class="pay-off"><h3>${tt("co.pay.off.title2", "Sites whose wages yesterday differ from today's rates")}</h3><ul>${off.slice(0, 8).map(([b, d]) =>
    `<li>${hoodHtml(b)}<a class="link" href="${attr(siteHref(b.key))}" data-pay-site="${attr(b.key)}">${spEsc(shortName(b))}</a><span class="${d > 0 ? "up" : "dn"}">${
      d > 0 ? "+" : "−"}${fmt(Math.abs(d))}</span><small>${tt("co.pay.off.row2", "paid {b} yesterday · {r} at today's rates", {b: fmt(b.wages || 0), r: fmt(b.staffCost || 0)})}</small></li>`).join("")}</ul></div>` : "";
  ctlRelease($("secPayroll"));
  $("secPayroll").innerHTML = sechead(tt("co.pay.title", "Payroll"), {sr: true, ctl: "staffing/payroll",
    why: payrollWhy(),
    aside: st.total ? chipHtml(st.avgSatisfaction >= 70 ? "ok tr" : "warn tr", `${st.avgSatisfaction}%`,
        tt("co.pay.avg.tip", "Average satisfaction across {n} staff", {n: st.total}))
      + trouble.map(([l, v, tip]) => chipHtml("warn tr", l(v), tip)).join("") : "",
  }) + tiles + mcOrdinaryWageNote(st) + sites + (st.total ? `<details class="pay-roles"${rolesOpen ? " open" : ""}><summary>${tt("co.pay.roles", "Staff by role")}</summary><div class="roles">${st.roles.map(r => `<div class="role rv">
      <span>${r.role}</span>
      <span class="tr"><i style="width:${(r.count / max * 100).toFixed(0)}%"></i></span>
      <span class="c">${!r.wageUnavailable && r.cost != null
        ? `<span>${r.count}</span><b>${money(r.cost)}</b>`
        : r.count}</span></div>`).join("")}</div></details>` : `<p class="quiet">${tt("co.pay.empty", "No staff hired yet.")}</p>`);
}
