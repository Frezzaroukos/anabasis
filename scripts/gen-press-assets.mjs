#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const PUBLIC = resolve(ROOT, 'public');
const PRESS = resolve(PUBLIC, 'press');

const b64 = (path) => readFileSync(path).toString('base64');
const font = (family, path, weight = '100 900') =>
  `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${b64(path)}) format('woff2');font-weight:${weight};font-style:normal;font-display:block}`;

const css = `
${font('Manrope', resolve(PUBLIC, 'fonts/manrope-latin-wght-normal.woff2'), '200 800')}
${font('JetBrains Mono', resolve(PUBLIC, 'fonts/jetbrains-mono-latin-wght-normal.woff2'), '100 800')}
${font('Fira Sans Condensed', resolve(ROOT, 'node_modules/@fontsource/fira-sans-condensed/files/fira-sans-condensed-latin-600-normal.woff2'), '600')}
*{box-sizing:border-box}
html,body{margin:0;overflow:hidden}
`;

const logoWhite = `data:image/svg+xml;base64,${b64(resolve(PUBLIC, 'logo-white.svg'))}`;
const logoDark = `data:image/svg+xml;base64,${b64(resolve(PUBLIC, 'logo.svg'))}`;
const appIcon = `data:image/svg+xml;base64,${b64(resolve(PUBLIC, 'app-icon.svg'))}`;

const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
html,body{width:1920px;height:1080px}
body{background:#101013;color:#F3F1F8;font-family:Manrope,system-ui,sans-serif}
.sheet{position:relative;width:1920px;height:1080px;padding:64px 80px 48px;display:flex;flex-direction:column;overflow:hidden}
.glow{position:absolute;right:-160px;top:-260px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(130,57,239,.28),transparent 65%)}
header{position:relative;font-family:'JetBrains Mono',monospace;font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#B88CFF}
header span{color:#6E6978}
main{position:relative;display:grid;grid-template-columns:560px 1fr;gap:92px;flex:1;align-items:center}
.mark{width:250px;height:250px}
h1{font-family:'Fira Sans Condensed',sans-serif;font-size:84px;font-weight:600;letter-spacing:.19em;line-height:1;margin:26px 0 0}
.tag{font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:.15em;color:#B88CFF;margin:20px 0 0}
.desc{font-size:17px;line-height:1.65;color:#A7A1AE;max-width:430px;margin:20px 0 0}
.right{display:flex;flex-direction:column;gap:52px}
h2{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:#8A8592;margin:0 0 18px}
.swatches{display:flex;gap:14px}
.sw{flex:1}
.chip{height:104px;border-radius:10px;border:1px solid rgba(255,255,255,.10)}
.name{font-size:13px;font-weight:600;margin-top:11px;color:#E9E6EE}
.hex{font-family:'JetBrains Mono',monospace;font-size:10px;color:#7C7686;margin-top:3px}
.row{display:grid;grid-template-columns:1fr 220px;gap:64px;align-items:end}
.types{display:flex;flex-direction:column;gap:18px}
.type{display:flex;align-items:baseline;gap:20px}
.type b{font-size:44px;line-height:1;font-weight:600;color:#F3F1F8;min-width:96px}
.type .fira{font-family:'Fira Sans Condensed',sans-serif;letter-spacing:.06em}
.type .manrope{font-family:Manrope,sans-serif}
.type .mono{font-family:'JetBrains Mono',monospace;font-size:36px}
.type small{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;color:#8A8592;text-transform:uppercase}
.icon{width:190px;height:190px;border-radius:38px;display:block;box-shadow:0 26px 60px -24px rgba(0,0,0,.8)}
footer{position:relative;display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,.10);padding-top:22px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6E6978}
footer b{color:#B88CFF;font-weight:500}
</style></head><body><div class="sheet"><div class="glow"></div>
<header>Anabasis <span>/ Brand identity</span></header>
<main>
  <div>
    <img class="mark" src="${logoWhite}" alt="">
    <h1>ANABASIS</h1>
    <p class="tag">EVERY SKILL IS A LADDER.</p>
    <p class="desc">Weighted calisthenics and skill progression. Offline-first, private by default, open source.</p>
  </div>
  <div class="right">
    <section><h2>01 / Color</h2><div class="swatches">
      ${[['Night','#101013','#101013'],['Graphite','#1C1C21','#1C1C21'],['Violet','#8239EF','#8239EF'],['Violet light','#B88CFF','#B88CFF'],['Achievement','#F56E14','#F56E14'],['Daylight','#FCFCFD','#FCFCFD']].map(([n,h,c])=>`<div class="sw"><div class="chip" style="background:${c}"></div><div class="name">${n}</div><div class="hex">${h}</div></div>`).join('')}
    </div></section>
    <section class="row"><div><h2>02 / Type</h2><div class="types">
      <div class="type"><b class="fira">Aa</b><small>Display · Fira Sans Condensed</small></div>
      <div class="type"><b class="manrope">Aa</b><small>UI · Manrope</small></div>
      <div class="type"><b class="mono">01</b><small>Data · JetBrains Mono</small></div>
    </div></div><div><h2>03 / App icon</h2><img class="icon" src="${appIcon}" alt="Anabasis app icon"></div></section>
  </div>
</main>
<footer><span>Anabasis / Weighted calisthenics &amp; skill progression</span><span><b>anabasis.axonos.dev</b> · open source · offline-first</span></footer>
</div></body></html>`;

const lockup = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
html,body{width:1024px;height:1024px}
body{background:#FCFCFD;color:#1C1C21;font-family:Manrope,sans-serif;display:flex;align-items:center;justify-content:center}
.lock{display:flex;flex-direction:column;align-items:center;text-align:center;padding:72px}
.mark{width:390px;height:390px}
h1{font-family:'Fira Sans Condensed',sans-serif;font-size:88px;font-weight:600;letter-spacing:.2em;line-height:1;margin:28px 0 0}
.tag{font-family:'JetBrains Mono',monospace;font-size:17px;letter-spacing:.18em;color:#8239EF;margin:20px 0 0}
.desc{font-size:17px;line-height:1.6;color:#5E5A66;margin:18px 0 0}
</style></head><body><div class="lock"><img class="mark" src="${logoDark}" alt="">
<h1>ANABASIS</h1><p class="tag">EVERY SKILL IS A LADDER.</p><p class="desc">Weighted calisthenics &amp; skill progression</p></div></body></html>`;

const iconMock = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
html,body{width:512px;height:512px}
body{background:radial-gradient(circle at 50% 38%,#FFFFFF,#ECE9F1 72%);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Manrope,sans-serif}
img{width:300px;height:300px;border-radius:66px;box-shadow:0 30px 60px -22px rgba(28,28,33,.42)}
p{font-size:36px;font-weight:650;letter-spacing:-.02em;color:#1C1C21;margin:34px 0 0}
</style></head><body><img src="${appIcon}" alt="Anabasis app icon"><p>Anabasis</p></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const shot = async (html, path, width, height) => {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, animations: 'disabled' });
};
await shot(sheet, resolve(PRESS, 'brand-sheet.png'), 1920, 1080);
await shot(lockup, resolve(PRESS, 'logo-lockup.png'), 1024, 1024);
await shot(iconMock, resolve(PRESS, 'app-icon-mockup.png'), 512, 512);
await browser.close();
console.log('press assets → public/press');
