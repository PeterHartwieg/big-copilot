// The wordmark's sphere: balls rolled out onto the shelf, and the map's hook
// that swallows them. A bare CLI board (render(None)), no save.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {suiteBrowser, renderBoard, openPage} = require('./_page.cjs');
const browser = suiteBrowser();
/* Waits out the newest ball's entrance. Spawn and the hook refuse while a ball
   is busy; the sphere says when none is (as in map.test.cjs). */
async function entranceOver(page){
  await page.waitForFunction(()=>window.__sphereIdle(),null,{polling:50});
}
async function fixture(t,reduced){
  // Wide enough for three balls: the shelf ends short of the search field.
  const {page,errors}=await openPage(t,await browser(),{html:renderBoard(),url:'https://sphere.test/',
    viewport:{width:1920,height:960},reducedMotion:reduced?'reduce':undefined,allowErrors:true});
  // A bare board never boots (D is null) and its wordmark has no text, so the
  // test gives the wordmark its words and wires the sphere by hand.
  await page.evaluate(()=>{ $('title').textContent='Big Copilot'; wireSphere(); });
  await page.locator('#orb.live').waitFor();
  return {page,errors};
}
/* An entrance runs 400 ms after boot (60 ms after a click), then 180 ms of
   lead plus 1300 ms of motion, and spawn refuses while a ball is busy -- so
   each click waits for the previous ball to settle before it can land. */
async function rollOut(page,count){
  await page.click('.wordmark');
  await page.waitForFunction(k=>document.querySelectorAll('.orb').length>=k,count,{timeout:5000});
  await entranceOver(page);
}
const orbs=page=>page.locator('.orb').count();

test('the map hook swallows every shelf ball one after another and the shelf recovers',async t=>{
  const {page,errors}=await fixture(t);
  try{
    await entranceOver(page); // the first ball's entrance
    await rollOut(page,2);await rollOut(page,3);
    assert.equal(await orbs(page),3);
    const started=await page.evaluate(()=>window.__consumeBalls(600,400,()=>window.__eaten=(window.__eaten||0)+1));
    assert.equal(started,3);
    // each ball is gone once its flight lands: the last leaves 280 ms after
    // the first and flies 700 ms
    await page.waitForFunction(()=>document.querySelectorAll('.orb').length===0,null,{polling:50});
    assert.equal(await orbs(page),0);
    assert.equal(await page.evaluate(()=>window.__eaten),3);
    // the shelf is empty now, so there is nothing left to swallow
    assert.equal(await page.evaluate(()=>window.__consumeBalls(600,400)),0);
    // clicking the wordmark still rolls a fresh ball out of the dot
    await page.click('.wordmark');
    await page.waitForFunction(()=>document.querySelectorAll('.orb').length===1,undefined,{timeout:2000});
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('with reduced motion the hook empties the shelf at once and reports each ball',async t=>{
  const {page,errors}=await fixture(t,true);
  try{
    await entranceOver(page); // under reduced motion an entrance ends at its 400 ms mark
    assert.equal(await orbs(page),1);
    const started=await page.evaluate(()=>window.__consumeBalls(600,400,()=>window.__eaten=(window.__eaten||0)+1));
    assert.equal(started,1);
    assert.equal(await orbs(page),0);
    assert.equal(await page.evaluate(()=>window.__eaten),1);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
