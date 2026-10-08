#!/usr/bin/env node
/**
 * ตรวจสูตรใน assets/template/Code.gs บน Node (ไม่ต้องขึ้น Google)
 * ใช้: node scripts/test-core.js [path/to/Code.gs]
 * จำลองชีตด้วยข้อมูลในไฟล์นี้ แล้วเทียบผล calcRowHours_ / calcPayroll_ / cellVal_ / normDate_ / phoneTxt_
 * แก้สูตรในโปรเจกต์จริงแล้ว ชี้ไฟล์ Code.gs ของโปรเจกต์มารันซ้ำได้ (ฟังก์ชันต้องไม่รับ pin เป็นอาร์กิวเมนต์แรก)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = process.argv[2] || path.join(__dirname, '..', 'assets', 'template', 'Code.gs');
const src = fs.readFileSync(file, 'utf8');

const ctx = { console, Object, JSON, Math, String, Date, parseInt, parseFloat, isNaN };
vm.createContext(ctx);
vm.runInContext(src, ctx);

// ---- ชีตจำลอง ----
const SHEET_DATA = {
  Settings: [
    { key: 'ot_multiplier', value: '1.5' }, { key: 'standard_day_hours', value: '8' },
    { key: 'default_break_minutes', value: '60' }, { key: 'ot_min_minutes', value: '0' },
  ],
  Employees: [
    { employee_id: 'EMP001', employee_name: 'สมชาย ตัวอย่าง', hourly_rate: 80, ot_rate: '', position: 'PT001' },
    { employee_id: 'EMP002', employee_name: 'สมหญิง ตัวอย่าง', hourly_rate: 100, ot_rate: 160, position: 'PT001' },
  ],
  Positions: [{ position_id: 'PT001', position_name: 'พนักงานฝ่ายผลิต', department: 'Production' }],
  Adjustments: [
    { employee_id: 'EMP001', period_from: '2026-09-01', period_to: '2026-09-15', addition: 0, bonus: 200, deduction: 50, diligence: 300, wht: 0 },
  ],
  Attendance: [
    { employee_id: 'EMP001', work_date: '2026-09-01', check_in: '09:00', check_out: '18:30', status: 'อนุมัติแล้ว' },  // 8.5 ชม. → OT 0.5
    { employee_id: 'EMP001', work_date: '2026-09-02', check_in: '9:00', check_out: '18:00', status: 'อนุมัติแล้ว' },   // 8 ชม. พอดี
    { employee_id: 'EMP001', work_date: '2026-09-20', check_in: '09:00', check_out: '18:00', status: 'อนุมัติแล้ว' },  // นอกงวด
    { employee_id: 'EMP002', work_date: '2026-09-03', check_in: '08:00', check_out: '13:00', status: 'รอตรวจสอบ' },     // 5−พัก1 = 4 ชม.
    { employee_id: 'EMP002', work_date: '2026-09-04', normal_hours: 8, ot_hours: 2, status: 'อนุมัติแล้ว' },           // กรอกชั่วโมงมาเอง
  ],
};
vm.runInContext('readSheet_ = function (n) { return JSON.parse(JSON.stringify(__DATA[n] || [])); }; SETTINGS_CACHE_ = null;', Object.assign(ctx, { __DATA: SHEET_DATA }));

let pass = 0, fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n       got  ' + g + '\n       want ' + w); }
}
const run = (code) => vm.runInContext(code, ctx);
const setSetting = (k, v) => { SHEET_DATA.Settings.find((s) => s.key === k).value = v; run('SETTINGS_CACHE_ = null'); };

console.log('calcRowHours_');
eq('09:00-18:30 พัก 60 → ปกติ 8 OT 0.5', run(`calcRowHours_({check_in:'09:00',check_out:'18:30'})`), { normal: 8, ot: 0.5 });
eq('เวลาไม่มี 0 หน้า 9:00', run(`calcRowHours_({check_in:'9:00',check_out:'18:00'})`), { normal: 8, ot: 0 });
eq('จุดคั่น 9.00', run(`calcRowHours_({check_in:'9.00',check_out:'14.00'})`), { normal: 4, ot: 0 });
// กับดัก: พัก 0 = "ไม่ได้กรอก" → ใช้ default_break_minutes (doPost เขียนช่องว่างเป็น 0 จึงแยกไม่ได้)
eq('กับดัก: break_minutes 0 ยังหักพัก 60', run(`calcRowHours_({check_in:'08:00',check_out:'12:00',break_minutes:0})`), { normal: 3, ot: 0 });
eq('ครึ่งวันไม่หักพัก → กรอก normal_hours เอง', run(`calcRowHours_({check_in:'08:00',check_out:'12:00',normal_hours:4})`), { normal: 4, ot: 0 });
eq('ออก ≤ เข้า → 0', run(`calcRowHours_({check_in:'22:00',check_out:'06:00'})`), { normal: 0, ot: 0 });
eq('กรอกชั่วโมงเอง = เชื่อตามนั้น', run(`calcRowHours_({normal_hours:7,ot_hours:1,check_in:'09:00',check_out:'20:00'})`), { normal: 7, ot: 1 });
setSetting('ot_min_minutes', '30');
eq('ขั้นต่ำ OT 30 นาที เกินมา 30 พอดี → ยังนับ (30 ≥ 30)', run(`calcRowHours_({check_in:'09:00',check_out:'18:30'})`), { normal: 8, ot: 0.5 });
setSetting('ot_min_minutes', '60');
eq('ขั้นต่ำ OT 60 นาที เกินมา 30 → ไม่นับ', run(`calcRowHours_({check_in:'09:00',check_out:'18:30'})`), { normal: 8, ot: 0 });
setSetting('ot_min_minutes', '0');

console.log('otRate_');
eq('ไม่ตั้ง ot_rate → ค่าแรง × 1.5', run(`otRate_({hourly_rate:80,ot_rate:''})`), 120);
eq('ตั้ง ot_rate เอง → ใช้ค่านั้น', run(`otRate_({hourly_rate:100,ot_rate:160})`), 160);

console.log('calcPayroll_ งวด 1–15 ก.ย. 2026');
const rows = run(`calcPayroll_({from:'2026-09-01',to:'2026-09-15'})`);
const e1 = rows.find((r) => r.employee_id === 'EMP001');
const e2 = rows.find((r) => r.employee_id === 'EMP002');
eq('EMP001 ชม.ปกติ/OT/วัน', [e1.normal_hours, e1.ot_hours, e1.days], [16, 0.5, 2]);
eq('EMP001 ค่าแรง 16×80 + OT 0.5×120', [e1.normal_pay, e1.ot_pay], [1280, 60]);
eq('EMP001 gross = 1280+60+เบี้ยขยัน300+โบนัส200', e1.gross, 1840);
eq('EMP001 net = gross − หัก 50', e1.net, 1790);
eq('EMP001 เวลาทำงานบนสลิป', e1.work_time, '09:00 – 18:30 (ส่วนใหญ่ 1/2 วัน)');
eq('EMP002 รวมทั้งแถวที่ยังไม่อนุมัติ', [e2.normal_hours, e2.ot_hours, e2.gross], [12, 2, 1520]);
const approved = run(`calcPayroll_({from:'2026-09-01',to:'2026-09-15',onlyApproved:true})`);
eq('onlyApproved ตัดแถวรอตรวจสอบ', approved.find((r) => r.employee_id === 'EMP002').normal_hours, 8);

console.log('cellVal_ / normDate_ / phoneTxt_');
eq('เวลาอย่างเดียว (1899-12-30) → HH:mm', run(`cellVal_(new Date(1899, 11, 30, 9, 5))`), '09:05');
eq('วันที่อย่างเดียว', run(`cellVal_(new Date(2026, 8, 17))`), '2026-09-17');
eq('พ.ศ. 2569 → ค.ศ.', run(`normDate_('17/09/2569')`), '2026-09-17');
eq('yyyy-m-d', run(`normDate_('2026-9-7')`), '2026-09-07');
eq('เบอร์ 0 หาย → เติมคืน + บังคับข้อความ', run(`phoneTxt_(812345678)`), "'0812345678");
eq('เบอร์ปกติ', run(`phoneTxt_('0812345678')`), "'0812345678");

console.log(`\nRUN ${pass + fail} · PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
