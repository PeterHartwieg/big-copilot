// Renders art.html into the Workshop images: thumbnail.png (the preview the
// in-game Mod Creator takes from the mod folder's root, 1 MB at most) and
// how-it-works.png (an extra image added on the Workshop page).
//   node mod/workshop/render.cjs
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const shots = [
  { id: "thumb", file: "thumbnail.png", w: 1024, h: 1024 },
  { id: "how", file: "how-it-works.png", w: 1920, h: 1080 },
];

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
  const url = pathToFileURL(path.join(__dirname, "art.html")).href;
  for (const s of shots) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
    await page.goto(`${url}#${s.id}`);
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(__dirname, s.file);
    await page.locator(`#${s.id}`).screenshot({ path: out });
    console.log(`${s.file}: ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
    await page.close();
  }
  await browser.close();
})();
