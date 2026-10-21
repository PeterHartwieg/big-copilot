/* Street Food planning arithmetic. No DOM, storage, or game writes.
   Travel follows FoodTrucks.Core.Fleet.Travel; distances are estimates along
   straight lines, not a navigation graph. Monday is weekday zero here. */
const StreetFoodModel = (() => {
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const point = p => p && finite(p.x) && finite(p.z) && Math.abs(p.x) <= 1e6 && Math.abs(p.z) <= 1e6;
  const distance = (a, b) => point(a) && point(b) ? Math.hypot(b.x - a.x, b.z - a.z) : null;
  const weekday = n => Number.isInteger(n) && n >= 0 && n < 7;
  const text = (s, max = 200) => typeof s === 'string' ? s.slice(0, max) : '';
  function transform(p, regions, inverse) {
    if (!p || !finite(p.x) || !finite(inverse ? p.y : p.z)) return null;
    for (const r of regions || []) {
      const w = r.worldBounds, b = r.bounds;
      if (!Array.isArray(w) || !Array.isArray(b) || w.length !== 4 || b.length !== 4 ||
          !w.every(finite) || !b.every(finite) || w[2] <= w[0] || w[3] <= w[1] || b[2] <= 0 || b[3] <= 0) continue;
      const u = inverse ? (p.x - b[0]) / b[2] : (p.x - w[0]) / (w[2] - w[0]);
      const v = inverse ? (p.y - b[1]) / b[3] : (w[3] - p.z) / (w[3] - w[1]);
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      return inverse ? {x: w[0] + u * (w[2] - w[0]), z: w[3] - v * (w[3] - w[1]), region: r.id}
        : {x: b[0] + u * b[2], y: b[1] + v * b[3], region: r.id};
    }
    return null;
  }
  function nearby(at, opportunities, radius = 50) {
    if (!point(at) || !finite(radius) || radius < 0) return [];
    return (opportunities || []).flatMap(row => {
      const d = distance(at, row);
      return d !== null && d <= radius ? [{...row, distance: d}] : [];
    }).sort((a, b) => a.distance - b.distance || String(a.key).localeCompare(String(b.key)));
  }
  function isOpen(row, day, minute) {
    if (row.closed) return false;
    if (!weekday(day) || !finite(minute) || !Array.isArray(row.hours) || row.hours.length !== 7) return null;
    const offset = Math.floor(minute / 1440), time = ((minute % 1440) + 1440) % 1440;
    const d = ((day + offset) % 7 + 7) % 7;
    const today = row.hours[d], yesterday = row.hours[(d + 6) % 7];
    if (!Array.isArray(today) || !Array.isArray(yesterday)) return null;
    return today.some(([a, b]) => finite(a) && finite(b) && time >= a && time < (b < a ? b + 1440 : b)) ||
      yesterday.some(([a, b]) => finite(a) && finite(b) && (b < a ? b + 1440 : b) > 1440 && time < (b < a ? b : b - 1440));
  }
  function nearbyStops(at, kind, catalogue, radius = 40) {
    if (!catalogue || catalogue.status !== 'ready' || !['cart', 'truck'].includes(kind)) return [];
    return nearby(at, (catalogue.spots || []).filter(s => s.kind === kind), radius)
      .sort((a, b) => a.distance - b.distance || String(a.id).localeCompare(String(b.id)));
  }
  function stopLocation(stop, kind, catalogue) {
    // Coordinates, not a persisted id or building key, establish the place.
    return nearbyStops(stop, kind, catalogue, .05)[0] || null;
  }
  function travelMinutes(from, to, vehicle, rules, gameSpeed = 1) {
    const d = distance(from, to), t = rules && rules.travel;
    if (d === null || !t || !finite(gameSpeed) || gameSpeed <= 0 || !finite(t.roadFactor) || t.roadFactor <= 0) return null;
    const rate = vehicle && vehicle.kind === 'truck' ? t.driveMinutesPerMetre
      : vehicle && vehicle.kind === 'cart' && finite(t.pushMetresPerSecond) && t.pushMetresPerSecond > 0 ? 1 / t.pushMetresPerSecond : null;
    return !finite(rate) || rate <= 0 ? null : Math.max(0, Math.ceil(d * t.roadFactor * rate * gameSpeed - 1e-9));
  }
  function normalizePlan(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.stops) || value.stops.length > 42 ||
        !weekday(value.weekday) || typeof value.id !== 'string' || !value.id || value.id.length > 200) return null;
    const ids = new Set(), stops = [];
    for (const s of value.stops) {
      if (!s || typeof s.id !== 'string' || !s.id || s.id.length > 200 || ids.has(s.id) ||
          !Number.isInteger(s.open) || !Number.isInteger(s.close) || s.open < 0 || s.close > 2880) return null;
      ids.add(s.id);
      stops.push({id: s.id, name: text(s.name), key: typeof s.key === 'string' ? text(s.key, 512) : null,
        ...(typeof s.locationId === 'string' ? {locationId: text(s.locationId, 200)} : {}),
        x: point(s) ? s.x : null, z: point(s) ? s.z : null, open: s.open, close: s.close,
        ...(finite(s.y) ? {y: s.y} : {}), ...(finite(s.heading) ? {heading: s.heading} : {})});
    }
    return {id: value.id, name: text(value.name), vehicleId: typeof value.vehicleId === 'string' ? text(value.vehicleId, 512) : null,
      kind: value.kind === 'truck' ? 'truck' : 'cart', weekday: value.weekday, stops,
      ...(finite(value.made) ? {made: value.made} : {}), ...(finite(value.edited) ? {edited: value.edited} : {})};
  }
  function validate(plan, {vehicle = null, rules = {}, gameSpeed = 1, stopLocations} = {}) {
    const issues = [], legs = [], stops = plan && Array.isArray(plan.stops) ? plan.stops : [];
    const limits = rules.schedules || {}, latest = limits.latestCloseMinute || 1620;
    const add = (code, stop, extra = {}) => issues.push({code, ...(stop ? {stopId: stop.id} : {}), ...extra});
    if (stops.length > (limits.maxStops || 6)) add('too_many_stops');
    for (const stop of stops) {
      if (!point(stop)) add('missing_position', stop);
      else if (stopLocations !== undefined && !stopLocation(stop, vehicle?.kind || plan.kind, stopLocations) &&
          !(vehicle?.id && (vehicle.schedule?.stops || []).some(s => distance(s, stop) !== null && distance(s, stop) <= .05)))
        add('unverified_stop', stop);
      if (!Number.isInteger(stop.open) || !Number.isInteger(stop.close) || stop.open < 0 || stop.open >= 1440 ||
          stop.close <= stop.open || stop.close > latest || stop.close - stop.open > 1440) add('bad_times', stop);
    }
    let total = 0, metres = 0, known = true;
    function leg(a, b, from, to) {
      const d = distance(a, b), minutes = travelMinutes(a, b, vehicle, rules, gameSpeed);
      legs.push({from, to, minutes, distance: d});
      if (d === null || minutes === null) known = false;
      else {total += minutes; metres += d;}
      return minutes;
    }
    let start = stops.length ? stops[0].open : 0, end = stops.length ? stops[stops.length - 1].close : 0;
    if (stops.length && point(vehicle && vehicle.home)) {
      const minutes = leg(vehicle.home, stops[0], 'home', stops[0].id);
      if (minutes !== null) start -= minutes + (limits.restockMinutes || 0);
    }
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1], b = stops[i], minutes = leg(a, b, a.id, b.id), gap = b.open - a.close;
      if (gap < 0) add('overlap', b, {otherStopId: a.id, minutes: -gap});
      else if (minutes !== null && gap < minutes) add('travel_gap', b, {otherStopId: a.id, minutes: minutes - gap});
    }
    if (stops.length && point(vehicle && vehicle.home)) {
      const minutes = leg(stops[stops.length - 1], vehicle.home, stops[stops.length - 1].id, 'home');
      if (minutes !== null) end += minutes;
      if (end > latest) add('return_after_day', stops[stops.length - 1], {minutes: end - latest});
    }
    if (stops.length && vehicle && vehicle.id) {
      const crew = (vehicle.crew || []).filter(c => c.exists !== false).map(c => c.id);
      if (!crew.length) add('missing_crew');
      else if (weekday(plan.weekday)) {
        const intervals = [];
        for (const h of (vehicle.schedule && vehicle.schedule.crewHours) || []) {
          if (!crew.includes(h.id) || !weekday(h.day) || !finite(h.start) || !finite(h.end)) continue;
          for (const week of [-1, 0, 1]) {
            const delta = (h.day - plan.weekday + week * 7) * 1440;
            intervals.push([delta + h.start, delta + h.end]);
          }
        }
        intervals.sort((a, b) => a[0] - b[0]);
        let cursor = start, missing = 0;
        for (const [a, b] of intervals) {
          if (b <= cursor || a >= end) continue;
          if (a > cursor) missing += a - cursor;
          cursor = Math.max(cursor, Math.min(b, end));
        }
        missing += Math.max(0, end - cursor);
        if (missing > 0) add('crew_gap', null, {minutes: missing});
      }
    }
    return {issues, legs, travelMinutes: known ? total : null, distance: known ? metres : null};
  }
  return {project: (p, r) => transform(p, r, false), unproject: (p, r) => transform(p, r, true),
    nearby, nearbyStops, stopLocation, isOpen, travelMinutes, normalizePlan, validate};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = StreetFoodModel;
