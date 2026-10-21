'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const M = require('../template/street-food-model.js');
const {rules} = require('../ba_street_food_rules.json');
const regions = require('../web/maps/locations.json').regions;
const stop = (id, x, open, close) => ({id, name: id, x, z: 0, open, close});
const plan = stops => ({id: 'p', name: 'Lunch route', kind: 'truck', weekday: 0, stops});

test('published world entrances project to the original map anchors in every panel', () => {
  for (const row of require('../web/maps/locations.json').buildings) {
    const p = M.project({x: row.world[0], z: row.world[1]}, regions);
    assert.equal(p.region, row.region);
    assert.ok(Math.abs(p.x - row.anchor[0]) <= .00051, row.key);
    assert.ok(Math.abs(p.y - row.anchor[1]) <= .00051, row.key);
    const w = M.unproject(p, regions);
    assert.ok(Math.hypot(w.x - row.world[0], w.z - row.world[1]) < 1e-8);
  }
  assert.equal(M.project({x: 1e9, z: 1e9}, regions), null);
  assert.equal(M.unproject({x: NaN, y: 10}, regions), null);
});
test('nearby sources respect 50 metres and never infer null coordinates as zero', () => {
  const a = M.nearby({x: 0, z: 0}, [{key:'b',x:30,z:40},{key:'a',x:50,z:0},{key:'c',x:51,z:0},{key:'d',x:null,z:null}]);
  assert.deepEqual(a.map(r => r.key), ['a','b']);
});
test('hours distinguish unknown, closed, midnight and an overnight Sunday', () => {
  assert.equal(M.isOpen({hours:null}, 0, 720), null);
  assert.equal(M.isOpen({hours:null,closed:true}, 0, 720), false);
  const row = {hours:Array.from({length:7},()=>[])};
  row.hours[6] = [[1380, 1560]];
  assert.equal(M.isOpen(row,0,60),true);
  assert.equal(M.isOpen(row,0,120),false);
  assert.equal(M.isOpen(row,6,1500),true);
});
test('travel matches the mod for cart, truck, game speed and exact integer rounding', () => {
  const a={x:0,z:0}, b={x:100,z:0};
  assert.equal(M.travelMinutes(a,b,{kind:'truck'},rules),4);
  assert.equal(M.travelMinutes(a,b,{kind:'cart'},rules),25);
  assert.equal(M.travelMinutes(a,b,{kind:'truck'},rules,2),8);
  assert.equal(M.travelMinutes(a,{x:null,z:0},{kind:'truck'},rules),null);
});
test('validation leaves manually ordered stops untouched, reports gaps and overlapping hours', () => {
  const p = plan([stop('a',0,600,660),stop('b',1000,670,720)]), before=JSON.stringify(p);
  const result=M.validate(p,{vehicle:{kind:'truck'},rules});
  assert.deepEqual(result.issues,[{code:'travel_gap',stopId:'b',otherStopId:'a',minutes:30}]);
  assert.equal(result.travelMinutes,40);
  assert.equal(JSON.stringify(p),before);
  p.stops.reverse();
  assert.equal(M.validate(p,{vehicle:{kind:'truck'},rules}).issues[0].code,'overlap');
});
test('crew coverage includes restock, travel home, prior-day and next-day hours', () => {
  const p=plan([stop('a',100,1380,1500)]);
  const vehicle={id:'v',kind:'truck',home:{x:0,z:0},crew:[{id:'c',exists:true}],schedule:{crewHours:[
    {id:'c',day:0,start:1320,end:1440},{id:'c',day:1,start:0,end:120}]}};
  assert.deepEqual(M.validate(p,{vehicle,rules}).issues,[]);
  vehicle.schedule.crewHours.pop();
  assert.equal(M.validate(p,{vehicle,rules}).issues.find(i=>i.code==='crew_gap').minutes,64);
  vehicle.crew[0].exists=false;
  assert.ok(M.validate(p,{vehicle,rules}).issues.some(i=>i.code==='missing_crew'));
});
test('stored plans keep manual fields and drop untrusted extras; malformed records fail closed', () => {
  const p={...plan([stop('a',0,600,660)]),vehicleId:'v',made:12,edited:15,extra:'discard'};
  p.stops[0].key='street#1';
  assert.equal(M.normalizePlan(p).stops[0].key,'street#1');
  assert.equal(M.normalizePlan(p).kind,'truck');
  assert.equal(M.normalizePlan(p).extra,undefined);
  assert.equal(M.normalizePlan({...p,weekday:7}),null);
  assert.equal(M.normalizePlan({...p,stops:[p.stops[0],p.stops[0]]}),null);
  assert.equal(M.normalizePlan({...p,stops:[{...p.stops[0],open:NaN}]}),null);
});

test('only exact kind-specific catalogue positions or this vehicle’s existing stops are checked', () => {
  const catalogue = {status:'ready',spots:[
    {id:'truck-a',kind:'truck',x:10,z:20}, {id:'cart-a',kind:'cart',x:13,z:20}
  ]};
  const plan = {kind:'truck',weekday:0,stops:[{id:'s',x:10,z:20,open:660,close:720}]};
  assert.equal(M.stopLocation(plan.stops[0], 'truck', catalogue).id,'truck-a');
  assert.equal(M.stopLocation({...plan.stops[0],x:11,locationId:'truck-a'},'truck',catalogue),null);
  assert.equal(M.stopLocation(plan.stops[0],'cart',catalogue),null);
  assert.equal(M.validate(plan,{rules,stopLocations:catalogue}).issues.some(i=>i.code==='unverified_stop'),false);
  assert.equal(M.validate({...plan,kind:'cart'},{rules,stopLocations:catalogue}).issues.some(i=>i.code==='unverified_stop'),true);
  const unavailable={status:'unavailable',spots:[]};
  assert.equal(M.validate(plan,{rules,stopLocations:unavailable}).issues.some(i=>i.code==='unverified_stop'),true);
  assert.equal(M.validate(plan,{rules,stopLocations:unavailable,vehicle:{id:'owned',kind:'truck',schedule:{stops:plan.stops}}}).issues.some(i=>i.code==='unverified_stop'),false);
  assert.equal(M.validate(plan,{rules,stopLocations:unavailable,vehicle:{kind:'truck',schedule:{stops:plan.stops}}}).issues.some(i=>i.code==='unverified_stop'),true);
});

test('nearby checked stops stay within reach and do not turn raw points into stops', () => {
  const catalogue={status:'ready',spots:[{id:'far',kind:'truck',x:41,z:0},{id:'near',kind:'truck',x:20,z:0},{id:'cart',kind:'cart',x:1,z:0}]};
  assert.deepEqual(M.nearbyStops({x:0,z:0},'truck',catalogue).map(s=>s.id),['near']);
  assert.equal(M.stopLocation({x:0,z:0},'truck',catalogue),null);
  assert.deepEqual(M.nearbyStops({x:0,z:0},'truck',{...catalogue,status:'unavailable'}),[]);
  const plan=M.normalizePlan({id:'p',kind:'truck',weekday:0,stops:[{id:'s',locationId:'near',x:20,z:0,y:1,heading:90,open:660,close:720}]});
  assert.equal(plan.stops[0].locationId,'near');
  assert.equal(plan.stops[0].heading,90);
});
