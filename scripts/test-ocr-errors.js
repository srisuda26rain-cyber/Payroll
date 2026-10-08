#!/usr/bin/env node
/**
 * ตรวจการเรียก Gemini ใน TimesheetOcr.gs บน Node (จำลอง UrlFetchApp — ไม่ยิงเน็ตจริง)
 * ใช้: node scripts/test-ocr-errors.js [path/to/TimesheetOcr.gs] [path/to/Code.gs]
 * ครอบ: ลำดับรุ่นตั้งต้น · ข้อความ 400/401/403 (โปรเจกต์ถูกระงับ) · ไม่มีคีย์หลุดในข้อความ · ล้มทุกรุ่นต้องบอกเหตุ
 *       · ปุ่มทดสอบคีย์ (tsocrPing_ / apiTsOcrReady(pin,true))
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const tpl = path.join(__dirname, '..', 'assets', 'template');
const ocrFile = process.argv[2] || path.join(tpl, 'TimesheetOcr.gs');
const codeFile = process.argv[3] || path.join(tpl, 'Code.gs');
const KEY = 'AIzaSyTESTKEY0000000000000000000000000';

function load(props, responder) {
  const calls = [], logs = [], cache = {};
  const ctx = {
    console: { log(...a) { logs.push(a.join(' ')); } }, Object, JSON, Math, String, Date, Number, Array, isFinite, parseInt, parseFloat, isNaN,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } }) },
    UrlFetchApp: {
      fetch(url, opt) {
        const model = decodeURIComponent(url.split('/models/')[1].split(':')[0]);
        calls.push({ model, key: opt.headers['x-goog-api-key'] });
        const r = responder(model, calls.length, opt);
        if (r instanceof Error) throw r;
        return { getResponseCode: () => r[0], getContentText: () => (typeof r[1] === 'string' ? r[1] : JSON.stringify(r[1])) };
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ocrFile, 'utf8'), ctx);
  if (fs.existsSync(codeFile)) vm.runInContext(fs.readFileSync(codeFile, 'utf8'), ctx);
  ctx.props_ = ctx.PropertiesService.getScriptProperties;
  return { ctx, calls, logs };
}
const gerr = (code, msg, status) => ({ error: { code, message: msg, status } });
const okBody = { candidates: [{ content: { parts: [{ text: JSON.stringify({ is_timesheet: true, summary: '', employee_id: 'A1', employee_name: 'x', period_text: '', rows: [] }) }] } }] };
const IMG = 'iVBORw0KGgo=';
const ocr = (ctx) => ctx.ocrTimesheetImage_(IMG, 'image/png', {});

let pass = 0, fail = 0;
function t(name, fn) {
  let ok = false, info = '';
  try { const r = fn(); ok = r === true; if (!ok) info = String(r); } catch (e) { info = 'throw ' + (e && e.message || e); }
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  → ' + info));
}
const has = (s, ...subs) => subs.every((x) => String(s).indexOf(x) >= 0) || 'ได้: ' + s;

t('1 ไม่ตั้ง GEMINI_MODEL → ลอง gemini-3.5-flash ก่อน 2.5', () => {
  const { ctx, calls } = load({ GEMINI_API_KEY: KEY }, () => [200, okBody]);
  const r = ocr(ctx);
  return (r.ok && calls[0].model === 'gemini-3.5-flash') || 'รุ่นแรก ' + (calls[0] && calls[0].model) + ' ok=' + r.ok;
});
t('2 403 "denied access" → บอกว่าโปรเจกต์ถูกระงับ + ทางแก้', () => {
  const { ctx } = load({ GEMINI_API_KEY: KEY }, () => [403, gerr(403, 'Your project has been denied access. Please contact support.', 'PERMISSION_DENIED')]);
  return has(ocr(ctx).error, 'ระงับ', 'aistudio.google.com/apikey', 'denied access');
});
t('3 403 แบบอื่น → แนบข้อความ Google', () => {
  const { ctx } = load({ GEMINI_API_KEY: KEY }, () => [403, gerr(403, 'Generative Language API has not been used in project 123', 'PERMISSION_DENIED')]);
  return has(ocr(ctx).error, 'ไม่มีสิทธิ์', 'Google ตอบ: Generative Language API has not been used');
});
t('4 400 API key not valid → บอกคีย์ใช้ไม่ได้', () => {
  const { ctx } = load({ GEMINI_API_KEY: KEY }, () => [400, gerr(400, 'API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT')]);
  return has(ocr(ctx).error, 'ใช้ไม่ได้', 'API key not valid');
});
t('5 Google สะท้อนคีย์กลับมาในข้อความ → ห้ามหลุดถึงหน้าเว็บ และ log', () => {
  const { ctx, logs } = load({ GEMINI_API_KEY: KEY }, () => [403, gerr(403, 'key ' + KEY + ' denied access', 'PERMISSION_DENIED')]);
  const e = ocr(ctx).error, lg = logs.join('\n');
  if (!lg) return 'ไม่มี log เลย (เคสไม่ได้แตะ log)';
  return (e.indexOf(KEY) < 0 && e.indexOf('AIza') < 0 && e.indexOf('***') >= 0 && lg.indexOf(KEY) < 0) || 'ได้: ' + e + ' | log: ' + lg;
});
t('6 ล้มทุกรุ่น (500) → ข้อความต้องมีเหตุจาก Google', () => {
  const { ctx } = load({ GEMINI_API_KEY: KEY }, () => [500, gerr(500, 'Internal error encountered.', 'INTERNAL')]);
  return has(ocr(ctx).error, 'Google ตอบ:', 'Internal error encountered');
});
t('7 รุ่นแรก 404 → ถอยไปรุ่นถัดไปแล้วอ่านได้ (ของเดิมต้องไม่พัง)', () => {
  const { ctx, calls } = load({ GEMINI_API_KEY: KEY, GEMINI_MODEL: 'gemini-x-404' }, (m) => (m === 'gemini-x-404' ? [404, gerr(404, 'not found', 'NOT_FOUND')] : [200, okBody]));
  const r = ocr(ctx);
  return (r.ok && calls[calls.length - 1].model !== 'gemini-x-404') || JSON.stringify(r);
});
t('8 429 ทุกครั้ง คีย์เดียว → ข้อความโควต้าเต็ม (ของเดิมต้องไม่พัง)', () => {
  const { ctx } = load({ GEMINI_API_KEY: KEY }, () => [429, gerr(429, 'Resource exhausted', 'RESOURCE_EXHAUSTED')]);
  return has(ocr(ctx).error, 'โควต้า');
});
t('9 ปุ่มทดสอบ: 200 → ok + ชื่อรุ่น', () => {
  const { ctx } = load({ GEMINI_API_KEY: KEY }, () => [200, { candidates: [] }]);
  const r = ctx.tsocrPing_();
  return (r.ok === true && r.model === 'gemini-3.5-flash') || JSON.stringify(r);
});
t('10 ปุ่มทดสอบ: 403 denied → error บอกโปรเจกต์ถูกระงับ', () => {
  const { ctx } = load({ GEMINI_API_KEY: KEY }, () => [403, gerr(403, 'Your project has been denied access.', 'PERMISSION_DENIED')]);
  const r = ctx.tsocrPing_();
  return (r.ok === false && /ระงับ/.test(r.error)) || JSON.stringify(r);
});
t('11 ปุ่มทดสอบ: ไม่มีคีย์ → บอกให้ตั้ง และไม่ยิงเน็ต', () => {
  const { ctx, calls } = load({}, () => [200, {}]);
  const r = ctx.tsocrPing_();
  return (r.ok === false && /GEMINI_API_KEY/.test(r.error) && calls.length === 0) || JSON.stringify(r);
});
t('12 ปุ่มทดสอบ: UrlFetch โยน error (ยังไม่อนุญาตสิทธิ์) → บอกให้ Run authorizeUrlFetch · ไม่หลุดคีย์', () => {
  const { ctx, logs } = load({ GEMINI_API_KEY: KEY }, () => new Error('no permission ' + KEY));
  const r = ctx.tsocrPing_(), lg = logs.join('\n');
  return (r.ok === false && /authorizeUrlFetch/.test(r.error) && r.error.indexOf(KEY) < 0 && lg && lg.indexOf(KEY) < 0) || JSON.stringify(r) + ' | log: ' + lg;
});
t('13 apiTsOcrReady(pin) ไม่ทดสอบ → ไม่ยิงเน็ต · apiTsOcrReady(pin,true) → ผลจาก ping', () => {
  const { ctx, calls } = load({ GEMINI_API_KEY: KEY }, () => [200, {}]);
  const a = ctx.apiTsOcrReady('');
  if (calls.length !== 0 || a.ready !== true || 'ok' in a) return 'ไม่ทดสอบแต่ได้ ' + JSON.stringify(a) + ' calls=' + calls.length;
  const b = ctx.apiTsOcrReady('', true);
  return (b.ok === true && b.model === 'gemini-3.5-flash' && calls.length === 1) || JSON.stringify(b);
});
t('14 ปุ่มทดสอบกดรัว → ครั้งที่ 2 ใน 30 วิ ไม่ยิงเน็ต', () => {
  const { ctx, calls } = load({ GEMINI_API_KEY: KEY }, () => [200, {}]);
  const a = ctx.tsocrPing_(), b = ctx.tsocrPing_();
  return (a.ok === true && b.ok === false && /รอ 30 วินาที/.test(b.error) && calls.length === 1) || JSON.stringify([a, b, calls.length]);
});
t('15 หลายคีย์: คีย์แรกโปรเจกต์ถูกระงับ → ใช้คีย์ที่สองอ่านได้', () => {
  const K2 = 'AIzaSySECONDKEY000000000000000000000000';
  const { ctx, calls } = load({ GEMINI_API_KEY: KEY + ',' + K2 }, (m, n, opt) => (opt.headers['x-goog-api-key'] === KEY ? [403, gerr(403, 'Your project has been denied access.', 'PERMISSION_DENIED')] : [200, okBody]));
  const r = ocr(ctx);
  return (r.ok === true && calls[calls.length - 1].key === K2) || JSON.stringify(r);
});
t('16 ปุ่มทดสอบหลายคีย์: คีย์แรก 429 → สลับคีย์ที่สอง', () => {
  const K2 = 'AIzaSySECONDKEY000000000000000000000000';
  const { ctx, calls } = load({ GEMINI_API_KEY: KEY + ',' + K2 }, (m, n, opt) => (opt.headers['x-goog-api-key'] === KEY ? [429, gerr(429, 'exhausted', 'RESOURCE_EXHAUSTED')] : [200, {}]));
  const r = ctx.tsocrPing_();
  return (r.ok === true && calls.length === 2 && calls[1].key === K2) || JSON.stringify([r, calls]);
});
t('17 ตั้ง GEMINI_MODEL=2.5 ไว้ แล้ว 2.5 ตอบ 403 (เฉพาะรุ่น) → ถอยไป 3.5 อ่านได้', () => {
  const { ctx, calls } = load({ GEMINI_API_KEY: KEY, GEMINI_MODEL: 'gemini-2.5-flash' }, (m) => (m === 'gemini-2.5-flash' ? [403, gerr(403, 'Model access restricted', 'PERMISSION_DENIED')] : [200, okBody]));
  const r = ocr(ctx);
  return (r.ok === true && r.model === 'gemini-3.5-flash' && calls[0].model === 'gemini-2.5-flash') || JSON.stringify(r);
});
t('18 ทุกรุ่น 403 (ไม่ใช่ระงับโปรเจกต์) → บอกไม่มีสิทธิ์ + เหตุจาก Google', () => {
  const { ctx, calls } = load({ GEMINI_API_KEY: KEY }, () => [403, gerr(403, 'Method doesn\'t allow unregistered callers', 'PERMISSION_DENIED')]);
  const e = ocr(ctx).error;
  return (calls.length === 2 && /ไม่มีสิทธิ์/.test(e) && /unregistered callers/.test(e)) || 'calls=' + calls.length + ' ' + e;
});
t('19 รุ่นแรก 404 รุ่นสองตอบว่าง → ข้อความชี้รุ่นสอง (เหตุจริง) ไม่ใช่ 404', () => {
  const { ctx } = load({ GEMINI_API_KEY: KEY }, (m) => (m === 'gemini-3.5-flash' ? [404, gerr(404, 'not found', 'NOT_FOUND')] : [200, { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }]));
  const e = ocr(ctx).error;
  return (/gemini-2\.5-flash: ไม่มีผลลัพธ์ \(SAFETY\)/.test(e) && !/404/.test(e)) || 'ได้: ' + e;
});

console.log(`\nผล: PASS ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
