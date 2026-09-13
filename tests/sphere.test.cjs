const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
let browser,server,url,html;
before(async()=>{
  const rendered=spawnSync(process.env.PYTHON || 'python',['-c','from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],{cwd:root,maxBuffer:4*1024*1024});
  assert.equal(rendered.status,0,rendered.stderr.toString());html=rendered.stdout;
  server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
const settle=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(reduced){
  const page=await browser.newPage({viewport:{width:1280,height:960}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(reduced)await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('https://**',r=>r.abort());
  await page.goto(url);
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
  await settle(1700);
}
const orbs=page=>page.locator('.orb').count();

test('the map hook swallows every shelf ball one after another and the shelf recovers',async()=>{
  const {page,errors}=await fixture();
  try{
    await settle(2000); // the first ball's entrance
    await rollOut(page,2);await rollOut(page,3);
    assert.equal(await orbs(page),3);
    const started=await page.evaluate(()=>window.__consumeBalls(600,400,()=>window.__eaten=(window.__eaten||0)+1));
    assert.equal(started,3);
    await settle(2500);
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

test('with reduced motion the hook empties the shelf at once and reports each ball',async()=>{
  const {page,errors}=await fixture(true);
  try{
    await settle(700); // under reduced motion an entrance ends at its 400 ms mark
    assert.equal(await orbs(page),1);
    const started=await page.evaluate(()=>window.__consumeBalls(600,400,()=>window.__eaten=(window.__eaten||0)+1));
    assert.equal(started,1);
    assert.equal(await orbs(page),0);
    assert.equal(await page.evaluate(()=>window.__eaten),1);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
