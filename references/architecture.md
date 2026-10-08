# โครงระบบ Payroll บน Google Apps Script

## ภาพรวม
```
พนักงาน ─ถ่ายใบลงเวลา─▶ บอท LINE (Railway/Node) ─OCR Gemini─▶ POST /exec (doPost)
                                                              │
หน้าเว็บ (/exec, doGet → Index.html) ◀── google.script.run ──▶ Code.gs ──▶ Google Sheet (Payroll_Master)
   ├ อัปรูปใบลงเวลาในเว็บ → TimesheetOcr.gs (Gemini ผ่าน UrlFetchApp)            └▶ Drive (รูป/สลิป/รายงาน)
   ├ ตรวจ/อนุมัติเวลา → คำนวณเงิน → สลิป PDF (สร้างในเบราว์เซอร์) → apiSaveReportPdf → 05_Payslips
   └ ทะเบียนพนักงาน/ตำแหน่ง/ตั้งค่า/ปรับเงิน
```
บอท LINE ไม่บังคับ — เริ่มจากหน้าเว็บกรอกเวลาเองก่อนได้ แล้วค่อยต่อบอท

## ไฟล์ในโปรเจกต์ Apps Script
| ไฟล์ | หน้าที่ |
|---|---|
| `appsscript.json` | timeZone `Asia/Bangkok`, runtime V8, `webapp.executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`, oauthScopes: spreadsheets, drive, script.external_request |
| `Code.gs` | ชีต/Drive/API/doPost/คำนวณ/โลโก้ (`assets/template/Code.gs`) |
| `TimesheetOcr.gs` | (ถ้ามี) AI อ่านรูปใบลงเวลา — global ทุกตัวขึ้นต้น `tsocr` กันชนกับ Code.gs เพราะแชร์ scope เดียวกัน, ไม่มี top-level const/let |
| `Index.html` | หน้าเว็บทั้งหมดไฟล์เดียว (SPA) |

## ชีต (สร้างอัตโนมัติจาก `SHEETS`)
| ชีต | คอลัมน์หลัก | หมายเหตุ |
|---|---|---|
| Attendance | id, work_date, check_in, check_out, break_minutes, normal_hours, ot_hours, status, source_file_url | status: `รอตรวจสอบ` → `อนุมัติแล้ว` |
| Employees | employee_id, employee_name, hourly_rate, ot_rate, position, phone, national_id, bank_name, bank_account | เบอร์/เลขบัตร/บัญชีเขียนเป็นข้อความ (`txt_`) |
| Positions | position_id, position_name, department, hourly_rate, ot_rate | ค่าแรงตั้งต้นของตำแหน่ง |
| Schedule | employee_id, weekday, shift_start, shift_end | ตารางกะ |
| Adjustments | employee_id, period_from, period_to, addition, bonus, deduction, diligence, wht | 1 แถว / คน / งวด (key = id\|from\|to) |
| Import_Log | imported_at, line_user_id, file_url, status, note | log ทุกครั้งที่บอทส่ง |
| Settings | key, value | ot_multiplier, standard_day_hours, default_break_minutes, ot_min_minutes, company_*, slip_* |

**ชื่อบริษัท / โลโก้ (ผู้ใช้ตั้งเอง)**
- ชื่อ ที่อยู่ เลขภาษี ฯลฯ อยู่ในชีต Settings (`company_name`, `company_name_en`, …) ค่าตั้งต้นว่าง → หน้าเว็บพาไปหน้าตั้งค่าตอนเปิดครั้งแรก
- โลโก้: หน้าเว็บย่อรูปด้านยาว ≤ 600px → `apiSaveLogo(pin, dataUri)` ตรวจ magic bytes PNG/JPEG/WEBP ≤ 1 MB → เก็บไฟล์ใน root folder
  จำ `LOGO_FILE_ID` ใน Script Properties (ไฟล์เก่าลงถังขยะ) · `getLogo_()` คืน data URI + แคช CacheService 6 ชม. (≤ 95KB)
- ยังไม่มีโลโก้ → ซ่อนกล่องโลโก้บนแถบเมนู + กล่องโปรไฟล์ใช้อักษรย่อ · เอกสารซ่อนช่องโลโก้

**กฎโครงชีต**
- เพิ่มคอลัมน์ใหม่ **ต่อท้ายเสมอ** + ขยับ `SCHEMA_V` → `apiBootstrap` เรียก `migrate_()` เติมหัวคอลัมน์ให้เอง 1 ครั้ง
- อ่านด้วย `readSheet_` (map ตามหัวคอลัมน์) · เขียนแถวใหม่ตามลำดับ `SHEETS` — ถ้าแทรกคอลัมน์กลาง ข้อมูลจะเหลื่อม
- ID ของ Spreadsheet/โฟลเดอร์เก็บใน Script Properties (`SPREADSHEET_ID`, `ROOT_FOLDER_ID`) ไม่ฮาร์ดโค้ด
  · เทมเพลต `getRoot_` **สร้างโฟลเดอร์ใหม่** ไม่ค้นด้วยชื่อ (ต้นฉบับค้นด้วยชื่อ → ติดตั้ง 2 ระบบในบัญชีเดียวกันเคยเสี่ยงใช้โฟลเดอร์ร่วมกัน)
  → โคลนโปรเจกต์ใหม่ = รัน `setup()` แล้วได้ชีต/โฟลเดอร์ใหม่ของตัวเอง

## Drive
`<FOLDER_ROOT>/01_Inbox` (รูปใบลงเวลา) · `02_Processing` · `03_Completed` · `04_Error` · `05_Payslips` (สลิป PDF) · `06_Reports` (ทะเบียน/รายงาน)
ชื่อไฟล์สลิป: `Payslip_<employee_id>_<from>.pdf`, รวมทุกคน `Payslips_ALL_<from>_<to>.pdf` — หน้า "ประวัติสลิป" แยกรหัส/งวดจากชื่อไฟล์

## รูปแบบ API ฝั่งเว็บ
- ฟังก์ชันที่ชื่อ **ไม่มี `_` ท้าย** = หน้าเว็บเรียกได้ผ่าน `google.script.run` → เว็บเปิด anonymous แปลว่า **ใครมีลิงก์ก็เรียกได้ทุกตัว**
- ฟังก์ชันภายในลงท้าย `_` (เรียกจากเว็บไม่ได้)
- ผลลัพธ์ก้อนใหญ่ → `return JSON.stringify(...)` แล้วฝั่งเว็บ `JSON.parse` (ดูกับดัก Date→null)
- ระบบจริงเคยมี PIN (`guard_(pin)` เป็นพารามิเตอร์แรกทุก api) แล้วผู้ใช้สั่งถอดล็อก → คง `guard_` เป็น no-op ไว้ไม่ต้องแก้ลายเซ็น

## ความเร็ว (สำคัญ — ผู้ใช้บ่น "ระบบหน่วง" มาแล้ว)
ค่าไปกลับของ `google.script.run` ขั้นต่ำ ~1.3–2 วินาที **ลดด้วยโค้ดไม่ได้** อ่านชีตแผ่นละ 0.2–0.4 วิ
1. **แคชต่อคำขอฝั่งเซิร์ฟเวอร์**: `SS_CACHE_` (openById ครั้งเดียว) + `SETTINGS_CACHE_` (ล้างเมื่อบันทึกตั้งค่า)
   — ก่อนแก้ `calcRowHours_` อ่าน Settings ใหม่ทุกแถว: หน้าบันทึกเวลา 10–14 วิ → 2.8–3.1 วิ
2. **แคชฝั่งเว็บใน `run()`**: แบ่งคำสั่ง 3 กลุ่ม
   - `API_READ` (หน้ารายการ) → คืนจากแคชทันที + ดึงใหม่เบื้องหลัง วาดใหม่ถ้าข้อมูลเปลี่ยนและผู้ใช้ไม่ได้กำลังพิมพ์
   - `API_FRESH` (bootstrap/คำนวณเงิน/รายงาน/ไฟล์) → ไม่แคช
   - นอกนั้น = คำสั่งเขียน → ล้างแคชก่อน+หลัง
   - **เพิ่ม API อ่านใหม่ต้องใส่ลง API_READ หรือ API_FRESH** ไม่งั้นถูกนับเป็นคำสั่งเขียน ล้างแคชทุกครั้ง
   - เทียบแคชด้วย JSON ที่ **เรียงชื่อ key** — Google ส่งลำดับ key สลับทุกครั้ง ถ้าเทียบตรงๆ จะวาดหน้าซ้ำเปล่าๆ
3. **บันทึก+อ่านในรอบเดียว** `apiDo(fn, args, fresh)` — whitelist คำสั่งเขียน (`API_DO_WRITE_`) และคำสั่งอ่านที่ตามมา (`API_DO_READ_`)
   เดิมกดบันทึก = ไป Google 2 รอบ ~5–8 วิ → 3–6 วิ · ใส่แถบโหลด + toast "กำลังบันทึก…" ทันทีที่กด
4. prefetch หน้าที่น่าจะเปิดต่อหลังเข้าหน้าแรก → เปิดซ้ำ 0.005–0.06 วิ
