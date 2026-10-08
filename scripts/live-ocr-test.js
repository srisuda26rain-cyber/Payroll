#!/usr/bin/env node
/**
 * ทดสอบ AI อ่านใบลงเวลาบน "เว็บจริง" ครบวงจร (อัปรูปผ่านเมนู อัปรูปใบลงเวลา → AI อ่าน → เทียบเฉลย)
 * ใช้: node scripts/live-ocr-test.js <URL /exec> <โฟลเดอร์ fixture> [โฟลเดอร์เก็บภาพผล]
 *   fixture = ocr-test-PAYTS.png (ใบ PAY-TS ที่พิมพ์จากเว็บนั้นแล้วกรอกเวลา) + ocr-test-key.json
 *   ocr-test-key.json = {employee_id (≤ 8 ตัว), name, from, to, rows: [[YYYY-MM-DD, HH:MM, HH:MM], ...]}
 *   ต้องตั้ง env PLAYWRIGHT_CORE + CHROME (ดู references/deploy-and-test.md)
 * ⚠️ เขียนเว็บจริง: เพิ่มพนักงานทดสอบชั่วคราว — ต้องได้รับอนุญาตจากเจ้าของระบบก่อนทุกครั้ง
 *    ไม่กดบันทึกลงชีตเวลา · จบแล้ว (หรือล้มกลางทาง) ลบพนักงานทดสอบ + ย้ายรูป/ผลอ่านทดสอบลงถังขยะเสมอ
 *    ไม่ใส่รูป fixture ไว้ในสกิล เพราะใบที่พิมพ์จากเว็บมีโลโก้/ชื่อบริษัทลูกค้า
 */
const fs = require('fs'); const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE);
const URL_ = process.argv[2];
const FIX = process.argv[3];
if (!URL_ || !FIX) { console.error('ใช้: node live-ocr-test.js <URL /exec> <โฟลเดอร์ fixture> [โฟลเดอร์เก็บภาพผล]'); process.exit(2); }
const EV = process.argv[4] || FIX;
const KEY = JSON.parse(fs.readFileSync(path.join(FIX, 'ocr-test-key.json'), 'utf8'));
async function appFrame(p) {
  for (let i = 0; i < 60; i++) {
    for (const fr of p.frames()) { try { if (await fr.evaluate(() => typeof google !== 'undefined' && !!(google.script && google.script.run) && !!document.querySelector('.navitem.active'))) return fr; } catch (e) {} }
    await p.waitForTimeout(500);
  }
  throw new Error('ไม่เจอ frame ของแอป');
}
const call = (fr, n, ...a) => fr.evaluate(([n, a]) => new Promise((res, rej) => google.script.run.withSuccessHandler(res).withFailureHandler((e) => rej(String(e)))[n]('', ...a)), [n, a]);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
  let f, fileId = '', created = false, result = null, exitCode = 1;
  try {
    await p.goto(URL_, { waitUntil: 'load', timeout: 60000 }); f = await appFrame(p);
    // กันลบพนักงานจริง: apiSaveEmployee เขียนทับรหัสเดิม แล้ว finally จะลบทิ้ง → รหัสทดสอบต้องขึ้นต้น TST และยังไม่มีในทะเบียน
    if (!/^TST/i.test(KEY.employee_id)) throw new Error('employee_id ใน ocr-test-key.json ต้องขึ้นต้น TST (กันชนพนักงานจริง)');
    const pre = JSON.parse(await call(f, 'apiBootstrap'));
    if ((pre.employees || []).some((e) => String(e.employee_id).trim().toUpperCase() === KEY.employee_id.toUpperCase())) {
      throw new Error('รหัส ' + KEY.employee_id + ' มีในทะเบียนแล้ว — หยุด ไม่แตะข้อมูลเดิม (เปลี่ยนรหัสใน fixture)');
    }
    const saved = await call(f, 'apiSaveEmployee', { employee_id: KEY.employee_id, employee_name: KEY.name, type: 'Part-time', hourly_rate: 80, status: 'ทำงาน' });
    console.log('saveEmployee:', JSON.stringify(saved));
    const sv = typeof saved === 'string' ? JSON.parse(saved) : saved;
    created = !!(sv && sv.ok === true && sv.updated === false);   // ลบตอนจบเฉพาะแถวที่สคริปต์นี้เพิ่งสร้าง
    if (!created) throw new Error('บันทึกพนักงานทดสอบไม่สำเร็จ/ไปทับแถวเดิม — หยุด');
    await p.goto(URL_, { waitUntil: 'load', timeout: 60000 }); f = await appFrame(p); await p.waitForTimeout(2000);
    await f.evaluate(() => go('tsup')); await p.waitForTimeout(1500);
    await f.evaluate((id) => tuPick(id), KEY.employee_id);
    await f.fill('#tuFrom', KEY.from); await f.fill('#tuTo', KEY.to);
    await f.setInputFiles('label.tu-big:not(.primary) input[type=file]', path.join(FIX, 'ocr-test-PAYTS.png'));
    for (let i = 0; i < 30; i++) { await p.waitForTimeout(400); if (await f.evaluate(() => !!TU.img)) break; }
    const ready = await f.evaluate(() => ({ emp: TU.emp && TU.emp.employee_id, img: TU.img && [TU.img.w, TU.img.h], btnDisabled: document.getElementById('tuRead').disabled }));
    console.log('ก่อนอ่าน:', JSON.stringify(ready));
    await p.screenshot({ path: path.join(EV, 'ocr-live-1-before.png'), fullPage: true });
    const t0 = Date.now();
    await f.click('#tuRead');
    for (let i = 0; i < 360; i++) { await p.waitForTimeout(500); if (await f.evaluate(() => !TU.busy && !!TU.ocr)) break; }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    result = await f.evaluate(() => ({ ocr: TU.ocr, rows: TU.rows, fileId: TU.fileId, saved: TU.saved }));
    fileId = result.fileId || '';
    console.log('AI อ่านเสร็จใน', secs, 'วิ · ok:', result.ocr && result.ocr.ok, '· model:', result.ocr && result.ocr.model, '· error:', result.ocr && result.ocr.error || '-');
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(EV, 'ocr-live-2-result.png'), fullPage: true });
    // เทียบเฉลย
    const got = {}; (result.rows || []).forEach((r) => { got[r.work_date] = r; });
    let ok = 0; const diffs = [];
    KEY.rows.forEach(([d, i, o]) => { const g = got[d];
      if (g && g.check_in === i && g.check_out === o) ok++; else diffs.push({ date: d, want: i + '-' + o, got: g ? g.check_in + '-' + g.check_out : '(ไม่มีแถว)' }); });
    const extra = (result.rows || []).filter((r) => !KEY.rows.some((k) => k[0] === r.work_date));
    const summary = { secs: +secs, model: result.ocr && result.ocr.model, header: result.ocr && result.ocr.header, rowsRead: (result.rows || []).length,
      correct: ok + '/' + KEY.rows.length, diffs, extraRows: extra, warnings: result.ocr && result.ocr.warnings, flagged: (result.rows || []).filter((r) => r.unreadable || r.future).length,
      savedToAttendance: result.saved, jsErrors: errors };
    console.log(JSON.stringify(summary, null, 1));
    fs.writeFileSync(path.join(EV, 'ocr-live-result.json'), JSON.stringify({ summary, raw: result.ocr }, null, 1), 'utf8');
    if (result.ocr && result.ocr.ok && ok === KEY.rows.length && !extra.length) exitCode = 0;
  } catch (e) { console.error('ERROR ระหว่างทดสอบ:', e); }
  finally {
    try {
      if (!f) { await p.goto(URL_, { waitUntil: 'load', timeout: 60000 }); f = await appFrame(p); }
      if (fileId) console.log('purge files:', JSON.stringify(await call(f, 'apiPurgeBotTest', 'TEST_BOT_LIVE_OCR', [fileId])));
      if (created) console.log('deleteEmployee:', JSON.stringify(await call(f, 'apiDeleteEmployee', KEY.employee_id)));
      const boot = JSON.parse(await call(f, 'apiBootstrap'));
      const att = await call(f, 'apiAttendance', {});
      console.log('หลังเก็บกวาด: พนักงานทดสอบเหลือ', (boot.employees || []).filter((e) => e.employee_id === KEY.employee_id).length,
        '· พนักงานทั้งหมด', (boot.employees || []).length, '· แถวบันทึกเวลา', Array.isArray(att) ? att.length : JSON.stringify(att).slice(0, 80));
    } catch (e) { console.error('CLEANUP ERROR:', e); }
    await b.close();
    process.exit(exitCode);
  }
})();
