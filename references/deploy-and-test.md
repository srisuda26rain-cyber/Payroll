# Deploy ด้วย clasp + ทดสอบของจริง

## ตั้งโปรเจกต์ใหม่ / โคลนให้ลูกค้าอีกราย
1. **สร้างโปรเจกต์ Apps Script ใหม่เสมอ** ห้ามวางทับโปรเจกต์เดิม (Script Properties จำ ID ชีต/โฟลเดอร์/โลโก้ของโปรเจกต์นั้น)
   · เทมเพลตสร้างโฟลเดอร์ใหม่ให้ทุกโปรเจกต์ ไม่ค้นด้วยชื่อ — ติดตั้งหลายบริษัทในบัญชีเดียวกันได้
2. ถามผู้ใช้ก่อนว่าจะให้ **บัญชี Google ไหนเป็นเจ้าของ** (ข้อมูลเงินเดือนจะอยู่ในไดรฟ์บัญชีนั้น)
3. หลายบัญชีบนเครื่องเดียว: `npx clasp login --user <ชื่อ>` แล้วทุกคำสั่งใส่ `npx clasp -u <ชื่อ> ...`
   - **กับดัก**: เบราว์เซอร์เลือกบัญชีที่ล็อกอินค้างไว้ให้เอง → credential ผิดบัญชี → เปิดลิงก์ login ในหน้าต่างไม่ระบุตัวตน
   - เช็คบัญชี: `npx clasp show-authorized-user`
4. **กับดัก**: `clasp create-script` **เขียนทับ `appsscript.json` ในเครื่องด้วย manifest เปล่า** (หาย webapp/oauthScopes)
   → สำรองไฟล์ก่อน แล้วคืนก่อน push
5. push → deploy ครั้งแรก → **เจ้าของต้องเปิดเอดิเตอร์ Run `setup` แล้วกดอนุญาตสิทธิ์**
   ก่อนหน้านั้น GET /exec แบบไม่ล็อกอิน = 403 "การเข้าถึงถูกปฏิเสธ"

## .claspignore (whitelist)
```
**/**
!appsscript.json
!Code.gs
!TimesheetOcr.gs
!Index.html
```
กันไฟล์ preview/สคริปต์เทส/ข้อมูลในโฟลเดอร์ไม่ให้ขึ้น Google

## อัปเดตเว็บเดิม (URL /exec ต้องไม่เปลี่ยน)
```bash
npx clasp push -f                                   # ดูบรรทัด "Pushed N files" ให้ครบทุกไฟล์ก่อนไปต่อ
npx clasp deploy -i <deploymentId เดิม> -d "อธิบายสั้นๆ"   # redeploy ทับ = URL เดิม เลขเวอร์ชัน @N+1
```
- `clasp deploy` **ไม่ใส่ `-i`** = สร้าง URL ใหม่ → ผู้ใช้/บอทยังชี้ URL เก่า
- **กับดักร้ายแรง**: `clasp pull` ได้ไฟล์ server เป็น `Code.js` แต่ `.claspignore` อนุญาตแค่ `.gs`
  → `push -f` ขึ้นไปแค่ appsscript.json + Index.html และ **push แทนที่ทั้งโปรเจกต์ = โค้ดฝั่งเซิร์ฟเวอร์หายจาก Google**
  เว็บพังทันที (เกิดจริง) → เปลี่ยน .js → .gs ก่อน push และนับ "Pushed N files" ทุกครั้ง ไม่ครบ = ห้าม deploy
- เทียบโค้ดเครื่องกับคลาวด์ก่อน push: `clasp pull` ลงโฟลเดอร์ temp ที่มี `.clasp.json` ชี้ scriptId เดียวกัน แล้ว diff
- `clasp run` ใช้ไม่ได้ถ้าไม่ได้ deploy เป็น API executable

## ทดสอบหน้าเว็บ (ไม่ต้องขึ้น Google)
`node scripts/check-template-ui.js [โฟลเดอร์ template]` — Playwright 24 จุด (ติดตั้งใหม่→หน้าตั้งค่า, ตั้งชื่อ, อัปโลโก้, ขึ้นใบลงเวลา/สลิป, ลบโลโก้, ไม่มีชื่อแบรนด์อื่นค้าง, ไม่มี JS error)
ตั้ง env `PLAYWRIGHT_CORE` / `CHROME` ถ้า playwright-core ไม่ได้ติดตั้งปกติ · ภาพ shot-*.png ต้องเปิดดูด้วยตา

## ทดสอบสูตร (ไม่ต้องขึ้น Google)
`node scripts/test-core.js [path/Code.gs]` — 24 เคส (ชั่วโมง/OT/ขั้นต่ำ OT/อัตรา/รวมงวด/อนุมัติ/วันที่ไทย/เบอร์โทร)
ใช้เป็น regression ทุกครั้งที่แก้สูตร

## ทดสอบของจริงบน /exec (อ่านอย่างเดียว ไม่แตะข้อมูล)
หน้าเว็บ Apps Script อยู่ใน iframe ซ้อน → Playwright เปิด /exec → หา frame ที่มี `google.script.run` → `evaluate` เรียก api ตรง
```js
const frame = page.frames().find(f => f.url().includes('googleusercontent'));   // หรือวนหา frame ที่ typeof google.script.run !== 'undefined'
const out = await frame.evaluate(() => new Promise((res, rej) =>
  google.script.run.withSuccessHandler(res).withFailureHandler(rej).apiAttendance('', {})));   // พารามิเตอร์แรกทุก api = pin (ว่างได้)
```
- `apiBootstrap` คืน **JSON string** → ต้อง `JSON.parse` ก่อน ไม่งั้นอ่าน `.settings` ได้ undefined หลอกว่าค่าหาย
- คำสั่งเขียน/ลบบนของจริง = ขออนุญาตผู้ใช้ก่อน และใช้ข้อมูลที่ติดป้ายทดสอบลบได้
- ชีตที่แชร์ให้บัญชีที่ต่อ Google Drive connector ไว้ → อ่านทุกแท็บตรงได้ ไม่ต้องเปิด endpoint

## Preview ในเครื่อง
`node tools/make-preview.js` → `preview.html` + mock ของ `google.script.run` จาก `tools/preview-mock.json` (ข้อมูลสมมติทั้งหมด)
**เพิ่ม API หรือ field ใหม่ต้องเติม mock ด้วย** ไม่งั้น preview TypeError หน้าขาว / โชว์ "-"
