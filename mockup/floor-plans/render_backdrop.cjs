// Renders the stage backdrop for the floor-plans canvas: a crop of the shipped
// map artwork (web/maps/map-background.svg) at the zoom the finder uses when a
// row is picked. Writes project/stage.jpg, which the artboards link to. Needs Playwright:
//   NODE_PATH=<checkout>/node_modules PLAYWRIGHT_CHANNEL=msedge node render_backdrop.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
// The world the stage pans over: its corner in map units, pixels a unit, size in
// CSS px. Kept in step with WORLD in build_canvas.py.
const VIEW = { x: 960, y: 690, z: 3.2, w: 2240, h: 1344 };
const url = p => 'file:///' + p.split(path.sep).join('/');
(async () => {
  const svg = path.resolve(__dirname, '..', '..', 'web', 'maps', 'map-background.svg');
  const html = `<!doctype html><body style="margin:0;background:#0d100f;overflow:hidden">
    <img src="${url(svg)}" style="position:absolute;left:${-VIEW.x * VIEW.z}px;top:${-VIEW.y * VIEW.z}px;width:${1728 * VIEW.z}px;height:${1195.36 * VIEW.z}px">`;
  const tmp = path.join(__dirname, '_backdrop.html');
  fs.writeFileSync(tmp, html);
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const page = await browser.newPage({ viewport: { width: VIEW.w, height: VIEW.h }, deviceScaleFactor: 1.25 });
  await page.goto(url(tmp));
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: path.join(__dirname, 'project', 'stage.jpg'), type: 'jpeg', quality: 72 });
  await browser.close();
  fs.unlinkSync(tmp);
})();
