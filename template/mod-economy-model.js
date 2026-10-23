/* Portable companion models. Inputs are validated provider terms and explicit
   plan choices. Integer intermediates preserve the producers' rounding order;
   these functions never read the board, persistence or a live game. */
const ModEconomyModel = (() => {
  "use strict";

  const whole = value => {
    if(!Number.isSafeInteger(value)) throw new TypeError("Expected a safe integer model input");
    return BigInt(value);
  };
  const positive = value => {
    const n = whole(value);
    if(n < 0n) throw new RangeError("Expected a nonnegative model input");
    return n;
  };
  const min = (a, b) => a < b ? a : b;
  const max = (a, b) => a > b ? a : b;
  const clamp = (n, a, b) => min(max(n, a), b);
  const number = value => {
    const n = Number(value);
    if(!Number.isSafeInteger(n)) throw new RangeError("Model result exceeds integer precision");
    return n;
  };
  const serviceIndex = service => {
    if(service !== "power" && service !== "water") throw new TypeError("Unknown utility service");
    return service === "power" ? 0 : 1;
  };

  function seasonAt(terms, day){
    const year = number(positive(terms.yearDays));
    if(!year || terms.seasonByDayOfYear?.length !== year) throw new TypeError("Invalid utility calendar");
    const d = number(whole(day));
    const season = terms.seasonByDayOfYear[((Math.max(1, d) - 1) % year + year) % year];
    if(!Number.isInteger(season) || season < 0 || season > 3) throw new TypeError("Invalid utility season");
    return season;
  }

  // RLO UtilitiesRules.Use: units are watt-hours and litres. A business's
  // closed share precedes its seasonal factor, so truncation happens twice.
  function utilityUse({terms, service, kind, area, open, season, people = 1}){
    const i = serviceIndex(service);
    const floors = i === 0 ? terms.powerPerSqm : terms.waterPerSqm;
    const seasons = i === 0 ? terms.powerSeasonThousandths : terms.waterSeasonThousandths;
    if(!Number.isInteger(kind) || kind < 0 || kind >= floors.length) throw new TypeError("Unsupported utility kind");
    if(!Number.isInteger(season) || season < 0 || season >= seasons.length || typeof open !== "boolean")
      throw new TypeError("Invalid utility plan");
    let use;
    if(kind === 0){
      const persons = max(1n, whole(people));
      use = i === 0 ? (positive(terms.homePowerBase) + positive(terms.homePowerPerSqm) * max(0n, whole(area)))
        * (1000n + positive(terms.extraPersonShareThousandths) * (persons - 1n)) / 1000n
        : positive(terms.homeWaterPerPerson) * persons;
    }else{
      use = positive(floors[kind]) * max(0n, whole(area));
      if(!open) use = use * positive(terms.closedShareThousandths) / 1000n;
    }
    return number(use * positive(seasons[season]) / 1000n);
  }

  // HART RunningCosts.DayUse. Plumbing replaces the open floor allowance;
  // refrigeration replaces standby only when it consumes more.
  function equipmentUse({terms, service, use, hours, equipment}){
    serviceIndex(service);
    const u = whole(use);
    if(u < 0n) return number(u);
    const h = clamp(whole(hours), 0n, 24n);
    const closed = positive(terms.closedShareThousandths), reference = positive(terms.referenceHours);
    if(closed === 0n || closed > 1000n || reference === 0n) throw new TypeError("Invalid equipment model terms");
    const full = h > 0n ? u : u * 1000n / closed;
    const standby = full * closed / 1000n;
    const active = full * (1000n - closed) * h / (1000n * reference);
    return number(service === "power"
      ? max(standby, positive(equipment.alwaysWatts) * 24n) + active + positive(equipment.openWatts) * h
      : standby + max(active, positive(equipment.litresPerOpenHour) * h));
  }

  // RLO UtilitiesRules.DayCents. This is accrual, not an additional payment
  // to add to an account's reported accrued balance or monthly bill.
  function utilityDayCents({terms, service, use, temporary = false}){
    const i = serviceIndex(service);
    if(typeof temporary !== "boolean") throw new TypeError("Invalid supply state");
    let cents = (max(0n, whole(use)) * positive(terms.unitCents[i]) + 500n) / 1000n
      + positive(terms.standingCents[i]);
    cents = cents * clamp(whole(terms.priceLevel), positive(terms.priceLevelMin), positive(terms.priceLevelMax)) / 1000n;
    if(temporary) cents = cents * (1000n + positive(terms.temporarySurchargeThousandths)) / 1000n;
    return number(min(cents, positive(terms.dailyCapCents)));
  }

  function billMoney(cents, cap){
    return number(min((max(0n, whole(cents)) + 50n) / 100n, positive(cap)));
  }

  function internetDayCents({monthCents, monthDays, active = true, outage = false}){
    if(typeof active !== "boolean" || typeof outage !== "boolean") throw new TypeError("Invalid internet state");
    if(!active || outage) return 0;
    const days = max(1n, whole(monthDays));
    return number((positive(monthCents) + days / 2n) / days);
  }

  function officeItDayCents({terms, seats, priceLevel, monthDays, active = true, outage = false, cap}){
    if(typeof active !== "boolean" || typeof outage !== "boolean") throw new TypeError("Invalid internet state");
    if(!active || outage || whole(seats) <= 0n) return 0;
    const month = positive(seats) * positive(terms.seatMonthCentsAtBasePrice)
      * clamp(whole(priceLevel), positive(terms.priceLevelMin), positive(terms.priceLevelMax)) / 1000n;
    const days = max(1n, whole(monthDays));
    return number(min((month + days / 2n) / days, positive(cap)));
  }

  function equipmentFor(lines, items){
    const byId = items instanceof Map ? items : new Map(items.map(item => [item.itemId, item]));
    const sum = {openWatts: 0n, alwaysWatts: 0n, litresPerOpenHour: 0n, officeSeats: 0n};
    for(const [id, qty] of lines){
      const count = positive(qty);
      if(count === 0n) continue;
      const item = byId.get(id);
      if(!item) return {status: "unavailable", reason: "equipment-item-unknown", itemId: id};
      for(const key of ["openWatts", "alwaysWatts", "litresPerOpenHour"]) sum[key] += positive(item[key]) * count;
      if(typeof item.officeSeat !== "boolean") throw new TypeError("Invalid office seat classification");
      if(item.officeSeat) sum.officeSeats += count;
    }
    return {status: "ready", ...Object.fromEntries(Object.entries(sum).map(([key, value]) => [key, number(value)]))};
  }

  function create(companion = {}){
    const captureDay = Number.isSafeInteger(companion.day) ? companion.day : 1;
    const get = (provider, name) => {
      const report = companion[provider];
      if(!report) return {status:'disabled',data:null};
      return report.modules?.[name] || {status:'unavailable',data:null};
    };
    const addressKey = a => a ? `${a.street}#${a.number}` : null;
    const index=(rows,key)=>new Map((rows||[]).map(row=>[key(row),row]));
    const hc=get('hart','runningCosts').data,uc=get('rlo','utilities').data,cc=get('rlo','company').data,rc=get('rlo','requirements').data;
    const itemClasses=index(hc?.items,i=>i.itemId),costSites=index(hc?.currentSites,s=>addressKey(s.address));
    const companySites=index(cc?.sites,s=>addressKey(s.address)),typeKinds=index(uc?.typeKinds,t=>t.typeId),requirementTypes=index(rc?.types,t=>t.typeId);
    const accountsBySite=new Map();for(const account of uc?.accounts||[]){const k=addressKey(account.address);if(!accountsBySite.has(k))accountsBySite.set(k,[]);accountsBySite.get(k).push(account);}
    const plansByDistrict=new Map();for(const provider of uc?.internet?.providers||[])for(const district of provider.districts){
      if(!plansByDistrict.has(district))plansByDistrict.set(district,[]);
      for(const plan of provider.plans)plansByDistrict.get(district).push({...plan,provider:provider.provider});
    }
    for(const plans of plansByDistrict.values())plans.sort((a,b)=>a.businessMonthlyMonthCents-b.businessMonthlyMonthCents||a.provider-b.provider||a.plan-b.plan);
    const educationCourses=index(get('rlo','education').data?.courses,c=>c.courseId);
    const factoryByItem=new Map();for(const course of get('hart','factoryPurchases').data?.courses||[])for(const item of course.itemIds)factoryByItem.set(item,course);
    const add = xs => number(xs.reduce((a,x) => a + positive(x),0n));
    const noCost = reason => ({status:'unavailable',dailyCents:null,byDayCents:Array(7).fill(null),
      startupCents:null,requirements:[],reasons:[reason],dayCost:()=>null});

    function operating(input){
      try { return operatingChecked(input); }
      catch(error){ return noCost(error.message || 'invalid-operating-input'); }
    }
    function operatingChecked({typeId, building, lines = [], open, existing = false, day = captureDay, equipmentOverride = null, existingExtraLines = []}){
      positive(day);
      if(!building || typeof typeId !== 'string' || !Array.isArray(open) || open.length !== 7)
        throw new TypeError('operating-input-incomplete');
      const hours = open.map(intervals => {
        if(!Array.isArray(intervals)) throw new TypeError('schedule-unknown');
        const occupied = new Set();
        for(const interval of intervals){
          if(!Array.isArray(interval) || interval.length !== 2) throw new TypeError('schedule-unknown');
          const [from,to] = interval;
          if(!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > 24 || from > to)
            throw new TypeError('schedule-unknown');
          for(let h=from;h<to;h++) occupied.add(h);
        }
        return occupied.size;
      });
      const requirements = [], reasons = [], startup = [], termsRenewals = [];
      const u = get('rlo','utilities'), h = get('hart','runningCosts'), company = get('rlo','company'), req = get('rlo','requirements');
      const unknown = (module, reason) => { if(!['ready','disabled'].includes(module.status)) reasons.push(reason); };
      unknown(u,'rlo-utilities-unavailable');
      const runtime = get('hart','runtime');
      const hartKnownOff = runtime.status==='ready' && ['equipment_utilities','office_it'].every(k=>runtime.data.rules[k]?.effective===false);
      if(!hartKnownOff) unknown(h,'hart-running-costs-unavailable');
      unknown(company,'rlo-company-unavailable');
      const licenceState=company.status==='ready'?company.data.partStates?.licences:company.status;
      if(licenceState!=='disabled') unknown(req,'rlo-requirements-unavailable');
      if(req.status==='ready' && !['ready','disabled'].includes(licenceState)) reasons.push('company-licences-unavailable');
      const site = company.status === 'ready' ? companySites.get(building.key) : null;
      const needsCompanySite=company.status==='ready' && (['staff','cover'].some(part=>company.data.partStates?.[part]==='ready')
        || req.status==='ready' && licenceState==='ready');
      if(existing && needsCompanySite && !site) reasons.push('company-site-unavailable');
      if(existing && company.status === 'ready'){
        for(const part of ['staff','cover']) if(!['ready','disabled'].includes(company.data.partStates?.[part]))
          reasons.push(`company-${part}-unavailable`);
      }
      let equipment = {status:'ready',openWatts:0,alwaysWatts:0,litresPerOpenHour:0,officeSeats:0};
      let equipmentOn = false, officeOn = false;
      if(h.status === 'ready'){
        for(const key of ['equipment','officeIt']) if(h.data[key].effective === null) reasons.push(`hart-${key}-unknown`);
        equipmentOn = h.data.equipment.effective === true;
        officeOn = h.data.officeIt.effective === true && h.data.officeTypeIds.includes(typeId);
        if(equipmentOn || officeOn){
          if(equipmentOverride){
            equipment = {status:'ready',...Object.fromEntries(['openWatts','alwaysWatts','litresPerOpenHour','officeSeats']
              .map(k=>[k,number(positive(equipmentOverride[k]))]))};
          }else if(existing){
            const baseline=costSites.get(building.key);
            if(!baseline){ equipment={status:'unavailable',reason:'current-equipment-unavailable'}; }
            else{
              const extra=equipmentFor(existingExtraLines,itemClasses);
              equipment=extra.status!=='ready'?extra:{status:'ready',...Object.fromEntries(['openWatts','alwaysWatts','litresPerOpenHour','officeSeats']
                .map(k=>[k,number(positive(baseline[k])+positive(extra[k]))]))};
              equipmentOn=equipmentOn && baseline.equipmentApplies;
            }
          }else equipment = equipmentFor(lines,itemClasses);
          if(equipment.status !== 'ready') reasons.push(equipment.reason);
        }
      }
      let kind, internet = null, utilityAccounts = [], preparationDays = 0;
      if(u.status === 'ready'){
        if(u.data.model !== 'rlo-utilities-v1') throw new TypeError('utility-model-unavailable');
        positive(building.m2);
        kind = typeKinds.get(typeId)?.kind;
        if(kind === undefined) reasons.push('utility-type-unavailable');
        if(existing){
          utilityAccounts = accountsBySite.get(building.key)||[];
          for(const service of ['power','water']) if(!utilityAccounts.some(a=>a.service===service)) reasons.push(`${service}-account-unavailable`);
          if(u.data.unresolvedAccountServices.length) reasons.push('utility-account-identities-unresolved');
        }else if(building.owned === true) reasons.push('owned-property-utility-deposit-unavailable');
        const needInternet = u.data.internetEnabled && (u.data.internet.needs.includes(typeId) || officeOn);
        if(needInternet){
          if(existing){
            internet = utilityAccounts.find(a=>a.service==='internet');
            if(!internet) reasons.push('internet-account-unavailable');
            else if(internet.state !== 'active'){ reasons.push('internet-not-active'); requirements.push({kind:'internet',status:'required',reason:'internet-not-active'}); }
          }else{
            const plans = plansByDistrict.get(building.hood)||[];
            if(!plans.length) reasons.push('internet-coverage-unavailable');
            else{
              internet = {...plans[0],state:'active',monthCents:plans[0].businessMonthlyMonthCents,outageFromHour:0,outageUntilHour:0};
              startup.push(u.data.internet.installFeeCents);
              preparationDays = u.data.internet.installDays;
              requirements.push({kind:'internet',status:'required',provider:internet.provider,plan:internet.plan,
                monthCents:internet.monthCents,installationCents:u.data.internet.installFeeCents,
                preparationDays,contract:false,reason:'install-before-opening'});
            }
          }
        }
      }else if(u.status === 'disabled' && (equipmentOn || officeOn)){
        // An effective HART cost hook with a disabled owner is inconsistent, never a zero quote.
        reasons.push('hart-utility-owner-disabled');
      }
      if(req.status === 'ready' && licenceState==='ready'){
        const r = req.data;
        const type = requirementTypes.get(typeId);
        if(!type) reasons.push('licence-type-unavailable');
        else{
          let mask = whole(type.licenceNeedsMask);
          if(open.some(slots=>slots.some(([from,to])=>to>from && (from<r.lateOpeningHours.before || to>r.lateOpeningHours.after))))
            mask |= 1n << whole(r.lateOpeningHours.permitKind);
          for(const licence of r.licences){
            if((mask & (1n << whole(licence.kind)))===0n) continue;
            if(licence.termDays <= 0) throw new TypeError('licence-term-unavailable');
            const held = existing ? site?.licences.find(l=>l.kind===licence.kind) : null;
            if(existing && !held){ reasons.push('licence-record-unavailable'); continue; }
            const valid = !!held && held.untilDay >= day;
            const graceDays = existing ? 0 : r.newSiteGraceDays;
            const first = valid ? held.untilDay-day+1 : graceDays + licence.termDays;
            if(!valid) startup.push(licence.feeCents);
            termsRenewals.push({kind:licence.kind,first,termDays:licence.termDays,cents:licence.feeCents});
            requirements.push({kind:'licence',licence:licence.kind,status:valid?'held':'required',
              startupCents:valid?0:licence.feeCents,termDays:licence.termDays,graceDays,firstRenewalOffset:first,
              closesWhenMissing:licence.closesWhenMissing});
          }
        }
      }
      const componentCost = offset => {
        positive(offset);
        if(reasons.length) return null;
        const actualDay = day + offset, weekday = ((actualDay%7)+7)%7;
        const parts = {power:0,water:0,internet:0,officeIt:0,company:0,licences:0};
        if(u.status === 'ready'){
          const t = u.data.terms;
          for(const service of ['power','water']){
            const account = existing ? utilityAccounts.find(a=>a.service===service) : null;
            if(account && !['active','temporary'].includes(account.state)) return null;
            if(account?.state==='temporary' && actualDay>=account.temporaryUntilDay) return null;
            let use = utilityUse({terms:t,service,kind,area:building.m2,open:hours[weekday]>0,season:seasonAt(t,actualDay)});
            if(equipmentOn) use = equipmentUse({terms:h.data,service,use,hours:hours[weekday],equipment});
            parts[service] = utilityDayCents({terms:t,service,use,temporary:account?.state==='temporary'});
          }
          if(internet){
            const active = internet.state==='active';
            const outage = internet.outageUntilHour>internet.outageFromHour && Math.floor(internet.outageFromHour/24)===actualDay;
            parts.internet = internetDayCents({monthCents:internet.monthCents,monthDays:t.monthDays,active,outage});
            if(officeOn) parts.officeIt = officeItDayCents({terms:h.data,seats:equipment.officeSeats,priceLevel:t.priceLevel,
              monthDays:t.monthDays,active,outage,cap:t.dailyCapCents});
          }
        }
        if(existing && site){
          parts.company = company.data.partStates?.staff==='ready'?site.managerDailyAllowanceCents:0;
          if(company.data.partStates?.staff==='ready' && site.overtime.active && actualDay>=site.overtime.fromDay && actualDay<site.overtime.untilDay)
            parts.company += site.overtime.dailyCents;
          for(const policy of company.data.partStates?.cover==='ready'?site.cover:[]){
            if(!policy.active) continue;
            if(actualDay>policy.untilDay) return null; // Renewal premium depends on future takings/claims.
            if(actualDay>=policy.fromDay) parts.company += policy.dailyCents;
          }
        }
        parts.licences = add(termsRenewals.filter(r=>offset>=r.first && (offset-r.first)%r.termDays===0).map(r=>r.cents));
        return parts;
      };
      const dayCost = offset => { const parts=componentCost(offset); return parts ? add(Object.values(parts)) : null; };
      // Copilot schedules are Sunday..Saturday; native day 1 is Monday.
      const byDayCents = Array.from({length:7},(_,weekday)=>dayCost((weekday-(day%7)+7)%7));
      const known = byDayCents.every(Number.isSafeInteger);
      const finalReasons = !known && !reasons.length ? ['commitment-future-input-unavailable'] : [...new Set(reasons)];
      return {status:known?'ready':'unavailable',dailyCents:known?add(byDayCents)/7:null,byDayCents,
        startupCents:reasons.length?null:add(startup),requirements,reasons:finalReasons,
        preparationDays,dayCost,componentCost,renewals:termsRenewals,
        basis:'daily-accrual-plus-term-renewals',assumptions:['captured-price-level','no-new-outages','prerequisites-before-opening'],
        observedAccounts:utilityAccounts,companyAccountant:company.status==='ready' && company.data.partStates?.tax==='ready'?company.data.accountant:null};
    }

    function factoryRequirements(lines, ownedItems = []){
      try { return factoryChecked(lines,ownedItems); }
      catch(error){ return {status:'unavailable',startupCents:null,totalCents:null,requirements:[],reasons:[error.message || 'factory-input-unknown']}; }
    }
    function factoryChecked(lines, ownedItems){
      const f = get('hart','factoryPurchases'), e = get('rlo','education');
      const empty = {status:'ready',startupCents:0,totalCents:0,requirements:[],reasons:[]};
      if(f.status==='disabled') return empty;
      if(f.status!=='ready') throw new TypeError('factory-gate-unavailable');
      if(f.data.gate.effective===false) return empty;
      if(f.data.gate.effective!==true) throw new TypeError('factory-gate-unknown');
      const owned = new Map(Array.isArray(ownedItems) ? ownedItems.map(x=>Array.isArray(x)?x:[x,1]) : Object.entries(ownedItems));
      const counts=new Map();
      for(const [id,n] of lines) counts.set(id,number(positive(counts.get(id)||0)+positive(n)));
      const buying = new Set([...counts].filter(([id,n])=>positive(n)>positive(owned.get(id)||0)).map(([id])=>id));
      const needed = [...new Set([...buying].map(id=>factoryByItem.get(id)).filter(Boolean))];
      if(!needed.length) return empty;
      if(e.status!=='ready') throw new TypeError('education-owner-unavailable');
      const requirements = [], reasons = [];
      let now=0,total=0,totalKnown=true;
      for(const course of needed){
        const observed = educationCourses.get(course.courseId);
        const held = f.data.heldRecords;
        if(!observed){reasons.push('education-course-unavailable');requirements.push({courseId:course.courseId,status:'unknown'});continue;}
        if(observed.qualified){requirements.push({courseId:course.courseId,status:'qualified',startupCents:0});continue;}
        if(held.status!=='ready'){reasons.push('held-records-unavailable');requirements.push({courseId:course.courseId,status:'unknown'});continue;}
        if(held.data.some(c=>c.courseId===course.courseId)){reasons.push('course-record-held');requirements.push({courseId:course.courseId,status:'held'});continue;}
        if(observed.enrollment){requirements.push({courseId:course.courseId,status:'in-progress',startupCents:0,
          enrollment:observed.enrollment});totalKnown=false;continue;}
        const quote = observed.quotes.find(q=>q.mode===0 && q.loan===false);
        if(!quote || quote.quoteStatus==='unknown'){reasons.push('education-quote-unavailable');requirements.push({courseId:course.courseId,status:'unknown'});continue;}
        if(!observed.offered || !observed.prerequisitesMet || quote.quoteStatus!=='ok'){
          reasons.push(quote.reason || 'education-ineligible');requirements.push({courseId:course.courseId,status:'ineligible',reason:quote.reason});continue;
        }
        now = add([now,quote.immediateCashCents ?? quote.feeNowCents]);
        if(Number.isSafeInteger(quote.totalFeeCents)) total=add([total,quote.totalFeeCents]); else totalKnown=false;
        requirements.push({courseId:course.courseId,courseKey:course.courseKey,status:'required',startupCents:quote.immediateCashCents ?? quote.feeNowCents,
          totalCents:quote.totalFeeCents ?? null,approximateDurationDays:quote.approximateDurationDays,quote});
      }
      return {status:reasons.length?'unavailable':'ready',startupCents:reasons.length?null:now,
        totalCents:reasons.length || !totalKnown?null:total,requirements,reasons:[...new Set(reasons)],
        completionGuaranteed:false,costBasis:'current-owner-quotes-once-per-course'};
    }
    return {operating,factoryRequirements};
  }

  return {create, seasonAt, utilityUse, equipmentUse, utilityDayCents, billMoney, internetDayCents, officeItDayCents, equipmentFor};
})();
if(typeof module !== "undefined" && module.exports) module.exports = ModEconomyModel;
