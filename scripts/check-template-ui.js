#!/usr/bin/env node
/**
 * ตรวจหน้าเว็บของเทมเพลตในเบราว์เซอร์ (ไม่ต้อง deploy): ติดตั้งใหม่พาไปหน้าตั้งค่า → ตั้งชื่อบริษัท → อัปโหลดโลโก้
 * → ชื่อ/โลโก้ขึ้นแถบเมนู โปรไฟล์ ใบลงเวลา สลิป → ลบโลโก้ → ไม่มีข้อความแบรนด์อื่นค้าง → ไม่มี JS error
 * ใช้: node scripts/check-template-ui.js [โฟลเดอร์ template]   (ค่าเริ่มต้น = assets/template)
 * ต้องมี playwright-core: ตั้ง PLAYWRIGHT_CORE=<path node_modules/playwright-core> และ CHROME=<path chrome.exe> ถ้าไม่ได้ติดตั้งแบบปกติ
 * ภาพหน้าจอเขียนลงโฟลเดอร์ปัจจุบัน: shot-1-fresh.png / shot-2-settings.png / shot-3-card.png
 */
const fs = require('fs'); const os = require('os'); const path = require('path'); const { pathToFileURL } = require('url');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const TPL = path.resolve(process.argv[2] || path.join(__dirname, '..', 'assets', 'template'));
const { buildHtml } = require(path.join(TPL, 'tools', 'make-preview.js'));
const PREVIEW = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'payroll-tpl-')), 'preview.html');
fs.writeFileSync(PREVIEW, buildHtml(fs.readFileSync(path.join(TPL, 'Index.html'), 'utf8'),
  JSON.parse(fs.readFileSync(path.join(TPL, 'tools', 'preview-mock.json'), 'utf8'))), 'utf8');
const URL_ = pathToFileURL(PREVIEW).href;
const DIR = process.cwd();
// โลโก้ทดสอบ 200×60 PNG (สี่เหลี่ยมน้ำเงิน + คำว่า ACME)
const TEST_LOGO = Buffer.from('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', 'base64');
let pass = 0, fail = 0;
const ok = (label, cond, extra) => { if (cond) { pass++; console.log('  ok   ' + label); } else { fail++; console.log('  FAIL ' + label + (extra ? ' → ' + extra : '')); } };
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('dialog', (d) => { errors.push('native dialog: ' + d.message()); d.dismiss(); });
  await p.goto(URL_, { waitUntil: 'load' });
  await p.waitForSelector('.navitem.active', { timeout: 20000 }); await p.waitForTimeout(900);

  const st = () => p.evaluate(() => ({
    active: (document.querySelector('.navitem.active') || {}).textContent,
    brand: document.getElementById('brandName').textContent, brandEn: document.getElementById('brandNameEn').textContent,
    prof: document.getElementById('profName').textContent, avClass: document.getElementById('profAv').className, avText: document.getElementById('profAv').textContent,
    nologo: document.documentElement.classList.contains('nologo'), logoBoxVisible: getComputedStyle(document.getElementById('brandLogo')).display !== 'none',
    title: document.title, cardImg: !!document.querySelector('#content img[alt="โลโก้บริษัท"]'),
  }));
  let s = await st();
  console.log('ติดตั้งใหม่ (ยังไม่ตั้งชื่อ/โลโก้)');
  ok('เปิดมาอยู่หน้าตั้งค่าระบบ', /ตั้งค่า/.test(s.active), s.active);
  ok('แถบเมนูโชว์ "ระบบเงินเดือน"', s.brand === 'ระบบเงินเดือน', s.brand);
  ok('ไม่มีกล่องโลโก้ว่างบนแถบเมนู', s.nologo && !s.logoBoxVisible);
  ok('โปรไฟล์โชว์อักษรย่อแทนโลโก้', s.avClass === 'av' && s.avText.length === 1, s.avClass + '/' + s.avText);
  await p.screenshot({ path: path.join(DIR, 'shot-1-fresh.png') });

  console.log('ตั้งชื่อบริษัท');
  await p.fill('#s_company_name', 'บริษัท เอซีเอ็มอี จำกัด');
  await p.fill('#s_company_name_en', 'ACME CO., LTD.');
  await p.evaluate(() => saveSet()); await p.waitForTimeout(700);
  s = await st();
  ok('แถบเมนู = ชื่อที่ตั้ง', s.brand === 'บริษัท เอซีเอ็มอี จำกัด' && s.brandEn === 'ACME CO., LTD.', s.brand + ' / ' + s.brandEn);
  ok('กล่องโปรไฟล์ = ชื่อที่ตั้ง', s.prof === 'บริษัท เอซีเอ็มอี จำกัด', s.prof);
  ok('ชื่อแท็บเบราว์เซอร์มีชื่อบริษัท', /เอซีเอ็มอี/.test(s.title), s.title);

  console.log('อัปโหลดโลโก้');
  await p.setInputFiles('#logoFile', { name: 'logo.png', mimeType: 'image/png', buffer: TEST_LOGO }); await p.waitForTimeout(1500);
  s = await st();
  ok('แถบเมนูมีโลโก้', !s.nologo && s.logoBoxVisible);
  ok('โปรไฟล์เปลี่ยนเป็นโลโก้', s.avClass === 'av logo', s.avClass);
  ok('การ์ดตั้งค่าโชว์รูปตัวอย่าง', s.cardImg);
  const logoW = await p.evaluate(() => { const i = new Image(); i.src = STATE.logo; return new Promise((r) => { i.onload = () => r([i.naturalWidth, i.naturalHeight, STATE.logo.slice(0, 22)]); }); });
  ok('ย่อรูปด้านยาว ≤ 600px เป็น PNG', logoW[0] <= 600 && logoW[2] === 'data:image/png;base64,', JSON.stringify(logoW));
  await p.screenshot({ path: path.join(DIR, 'shot-2-settings.png') });

  console.log('ชื่อ/โลโก้ไปขึ้นเอกสาร');
  await p.evaluate(() => go('card')); await p.waitForTimeout(2500);
  const ts = await p.evaluate(() => ({ co: (document.querySelector('.ts-co') || {}).textContent || '', logo: !!document.querySelector('.ts-logo'), code: /PAY-TS/.test(document.body.textContent) }));
  ok('ใบลงเวลา: ชื่อบริษัทบนหัวกระดาษ', ts.co === 'บริษัท เอซีเอ็มอี จำกัด · ACME CO., LTD.', ts.co);
  ok('ใบลงเวลา: โลโก้บนหัวกระดาษ', ts.logo);
  ok('ใบลงเวลา: รหัสฟอร์ม PAY-TS', ts.code);
  await p.screenshot({ path: path.join(DIR, 'shot-3-card.png') });
  const rows = await p.evaluate(() => { const b = JSON.parse(JSON.stringify(STATE)); return b.employees.length; });
  const slip = await p.evaluate(() => { const r = { employee_id: 'EMP001', employee_name: 'สมชาย ตัวอย่าง1', normal_hours: 8, ot_hours: 0, gross: 640, net: 640 };
    const h = slipDocHtml(r, { from: '2026-09-01', to: '2026-09-15' }); return { th: /เอซีเอ็มอี/.test(h), en: /ACME CO\., LTD\./.test(h), img: h.indexOf(STATE.logo) >= 0 }; });
  ok('สลิป: ชื่อไทย/อังกฤษ + โลโก้', slip.th && slip.en && slip.img, JSON.stringify(slip));

  console.log('ลบโลโก้');
  await p.evaluate(() => go('set')); await p.waitForTimeout(700);
  await p.evaluate(() => removeLogo()); await p.waitForTimeout(300);
  await p.click('#cfmOk'); await p.waitForTimeout(700);
  s = await st();
  ok('ลบแล้วกลับเป็นอักษรย่อ ไม่มีกล่องโลโก้', s.nologo && !s.logoBoxVisible && s.avClass === 'av', JSON.stringify(s));

  console.log('ข้อความแบรนด์เดิมบนหน้าจอ');
  for (const pg of ['dash', 'card', 'tsup', 'slip', 'payreport', 'set', 'pos']) {
    await p.evaluate((x) => go(x), pg); await p.waitForTimeout(1200);
    const t = await p.evaluate(() => document.body.innerText);
    ok('หน้า ' + pg + ' ไม่มี หมูอินเตอร์/MSP', !/หมูอินเตอร์|MSP|INTERFOOD/.test(t));
  }
  ok('ไม่มี JS error / dialog ของเบราว์เซอร์', errors.length === 0, errors.join(' | '));
  console.log(`\nRUN ${pass + fail} · PASS ${pass} · FAIL ${fail} (พนักงานสมมติ ${rows} คน)`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASHED', e); process.exit(2); });
