# Afion ERP — Step-by-step Operating Flow

Everything below is in the order the factory works: setup → masters → sampling → order → materials → production → quality → packing → dispatch → payment. Each step names the **page**, the **button**, the **form fields** (with the choices offered) and **what happens** after you save. Fields marked ★ are mandatory. "Extra fields" means any inputs the admin added under Settings → Form Fields; they appear in an *Additional details* block at the bottom of that form.

---

## 0. Logins and basics

| Login | Role | Modules on the sidebar |
|---|---|---|
| `vikram` | Admin | everything, plus Users & Roles and Settings |
| `saurav` | Merchandising Head | Dashboard, Sample Development, Orders, Material Planning, TNA, Patterns, Reports |
| `neha` | Sampling Incharge | Sample Development, Patterns (buyer names masked) |
| `meena` | Store Manager | Dashboard, Stock & Inventory, Purchase Orders, Accessories, Gate Entry |
| `ravi.gate` | Gate Man | Gate Entry only (simple big-button screen) |
| `amit` | Production Manager | Dashboard, Production Floor, Job Work, Vendors & Suppliers, Packing, Quality, TNA |
| `sunita` | Accounts | Dashboard, Dispatch, Payments, Compliance, Reports |

Password for all seeded users: `Afion@123`. First login of a new user forces a password change.

Every signed-in user also gets **My Work** and **Alert Center** in the sidebar, the bell icon (live alerts) and the search box (`Ctrl K`: order, style, vendor, material).

Numbering issued by the server: samples `SMP-###`, orders `AFI-####`, buyers `B-##`, vendors `V-##`, purchase orders `PO-####`, gate entries `GE-####` / `GRN-####`, job-work challans `JW-####`, patterns `PT-####`, inspections `FI-####` / `QI-####`, export invoices `AFI/EXP/FY/####`, compliance docs `CD-####`, tracking codes `XXXX-XXXX`.

---

## 1. Setup (Admin)

### 1.1 Settings → Company tab
- Legal Name ★ · IEC · GSTIN · Base Currency · Financial Year · Registered Address · Phone · Email
- Letterhead: Upload PNG / JPG / PDF (printed on spec sheets, challans, invoices)
- Numbering card is read-only (shows the series above)

### 1.2 Settings → Stores & Procurement tab
- PO approval limit (₹): POs above this wait for a user with the *Approve purchase orders* flag. `0` switches approval off.
- Default port of loading
- Godowns / store locations: one per line (offered at Gate Entry and stock adjustments)

### 1.3 Settings → Production tab
- Lines / sections: one per line (offered when logging production)
- Daily target per line (pcs): line efficiency = output ÷ target

### 1.4 Settings → TNA · Quality · Alerts tab
- Pipeline stages: read-only preview, link to TNA page to manage
- Amber window (days before due) · Auto-apply TNA to new orders: Yes / No
- DHU limit (%) · Fabric points / 100 sq m · AQL level: 2.5 / 4.0
- Sample with buyer → alert after (days) · Escalate red alerts after (hours) · Compliance reminders (days before expiry, comma separated)
- Defect master: `code | name | Major/Minor` per line (empty = built-in list of 12 defects)

### 1.5 Settings → Export & Portal tab
- Invoice prefix (invoice = prefix / FY / number) · Default port of discharge
- Buyer portal base URL (links become `<base>/track/CODE`; empty = this frontend) · Link validity (days)

### 1.6 Settings → Form Fields tab
Pick any of the 17 forms on the left (Sample Request, Order, Buyer, Pattern, Material, Purchase Order, Gate Entry, Supplier, Job Work Vendor, Job Work Challan, Production Log, three Quality inspections, Export Invoice, Compliance Document, User).
- **Built-in fields**: Edit → Label, Placeholder, Help text, Field type (plain text fields can become Long text / Dropdown / E-mail / Phone / Web link), Required. Remove takes the field off the form (Restore brings it back). Locked fields drive system logic and stay.
- **Extra fields**: Add field → Label ★, Type (Short text, Long text, Number, Amount ₹, Percent, Date, Date & time, Time, Dropdown, Choice buttons, Multi-select, Yes/No, Rating, E-mail, Phone, Web link, Colour, File upload), Options (for choice types), Placeholder, Help text, Required. Reorder with the arrows. A live Preview shows the block.
- Click **Save Changes** at the top to apply.

### 1.7 Users & Roles → Add User
- Full Name ★ · User ID (login) ★ · Password ★ (or Generate) · Role: Admin / Merchandising Head / Store Manager / Production Manager / Gate Man / Accounts / Sampling Incharge / Custom · Status: Active / Inactive · Phone
- Module Access: tick boxes (the role pre-fills them) — dashboard, samples, orders, stock, planning, po, accessory, vendors, jobwork, production, gate, packing, dispatch, payments, reports, users, settings, tna, pattern, quality, compliance
- Confidential Access flags: See buyer identity & commercial terms · See vendor identity, rates & bank · See FOB / material rates · Financial reports · Approve purchase orders above the limit · Approve cutting patterns · Add / renew compliance documents · See confidential compliance documents · Replan TNA dates and priorities
- Extra fields (if any)
- After save: the user must change the password on first login. Edit / Deactivate from the list.

### 1.8 TNA → Stages (Admin or *Replan TNA* flag)
- Rows: Stage name ★ (max 30 chars, unique), Buyer portal: Shown / Hidden, move up / down, Remove, Add stage
- Renaming carries the stage's activities along. Removing asks *move its activities to …* (choose another stage). Reset to the standard 9 stages is available.
- Default pipeline: Samples → Materials → Cutting → Stitching → Finishing → Packing → Inspection → Dispatch → Payment (Payment hidden from the buyer)

### 1.9 TNA → Templates → New Template (full page `/tna/templates/new`, edit `/tna/templates/:id`)
- Name ★ · Buyer (optional: Any buyer / a buyer) · Product type · Default template for new orders (tick)
- Activities table, one row each: Activity ★ · Stage (from the pipeline) · Owner role (Merchandising Head / Sampling Incharge / Store Manager / Production Manager / Accounts / Admin) · Anchor: `order` (days after order date) or `exf` (days before / after ex-factory, negative = before) · Offset days · Duration days · Add activity / ✕
- The seeded default has 19 activities (order confirmation, spec sheet, PP sample, pattern, fabric PO, fabric in, trims in, PP meeting, cutting start/complete, stitching start/complete, finishing, packing, final AQL, ex-factory, dispatch, docs to bank, payment due).

---

## 2. Masters

### 2.1 Buyers → Add Buyer (needs *See buyer identity* flag; others see only `B-##`)
- Brand / Trading Name ★ · Legal Entity · Country · Currency (default USD) · Payment Terms · Primary Contact · Contact Role · Contact Email · Contact Phone · Address · Notes · Extra fields
- List actions: Edit · Portal (buyer-wise tracking link, see 12.2) · Deactivate / Activate

### 2.2 Vendors & Suppliers
**Add Supplier** (material suppliers, used on POs): Supplier Name ★ · Category: Fabric / Accessory / Packing / Mixed · Location · GSTIN · Payment Terms · Lead Time (days) · Contact Person · Phone · Extra fields

**Add Vendor** (job-work vendors): Vendor Name ★ · Process Category: Dyeing / Printing / Softening / Washing / Embroidery / Cutting / Stitching / Finishing / Other · Location · GSTIN · Rate (e.g. ₹34 / kg) · Daily Capacity · On-Time % · Rating (0–5) · Contact Person · Phone · Extra fields. Without the *See vendor identity* flag users see only `V-##`.

### 2.3 Stock & Inventory → Add Material
- Code ★ (e.g. FAB-0180) · Material Name ★ · Category: Fabric / Accessory / Packing · UOM: mtr / kg / pcs / set / roll / cone · Rate (₹ / UOM, needs *See rates* flag) · Opening Qty (only on create; posts the first ledger row) · Reorder Level · Godown / Location (from Settings) · Supplier (from suppliers, or none) · Specification · Extra fields
- List columns: Physical · Reserved · Free (= physical − reserved) · On Order (open POs) · At Vendor (job work) · state Healthy / Low / Out
- Row actions: ledger icon (movement history) · adjust icon → **Post Adjustment**: quantity ± and Reason ★ (min 4 chars) · Raise PO (pre-fills the material and the reorder shortfall) · Edit · Deactivate

---

## 3. Sampling (Merchandising / Sampling)

### 3.1 Sample Development → New Sample Request
Section 1 · Request
- Buyer ★ (dropdown) · Style No ★ (a style master is created from it) · Sample Type: Proto Sample / Fit Sample / Size Set / PP Sample · Product Description ★ · Size Range (default S – 3XL) · Target Send Date · Priority: Urgent / High / Normal / Low

Section 2 · Pieces you are sending (one card per piece, at least one)
- Drop photos (JPG / PNG / WEBP, up to 25 MB each; one card appears per photo) or *Piece without photo*
- Per card: Piece / description ★ · Fabric type · Qty (pcs) · Colour · Sizes (chips XS, S, M, L, XL, 2XL, 3XL, **F** = free size, or type your own) · Notes for this piece · Add photo / delete
- The sample's fabric, colour and piece count are worked out from the cards.

Section 3 · Trims & notes: Accessories · Buyer Comments / Tech Pack Notes

Section 4 · Specification sheet / tech pack: upload PDF / DOC / DOCX / XLS / XLSX / image (becomes version 1)

Section 5 · Additional details: extra fields (only if configured)

Section 6 · Courier: Courier method (DHL Express / FedEx / UPS / Blue Dart / Aramex / DTDC / India Post EMS / Hand carry / Other) · AWB / tracking no · Receiver at buyer · Courier notes

Save → status **In Sampling**, number `SMP-###`, round 1.

### 3.2 Sample card actions (status flow: In Sampling → Sent → Client Review → Revision → … → Approved / Rejected)
- **Mark Sent to Buyer**: Sent On (date) · Courier / AWB No → status Sent / Client Review
- **Log Buyer Feedback**: Buyer Comment, then one of
  - **Approved** → status Approved (unlocks Spec Sheet and Convert)
  - **Changes → Round n+1** with *next round sample type* (Proto / Fit / Size Set / PP) → status Revision, round + 1
  - **Rejected** → status Rejected (a *Reopen* button brings it back to sampling)
- **Edit** (pencil): same form as 3.1; a newer spec sheet becomes the next version
- Filter chips on the page: All · In Sampling · Client Review · Revision · Approved · Rejected

### 3.3 Spec Sheet (approved samples only)
- **Generate & Print**: builds the sheet on the letterhead with style, fabric, colour, trims, piece photos, sampling history and extra fields → save as PDF from the print dialog. Recorded as a *generated* version.
- **Upload Buyer's Sheet**: PDF / DOC / DOCX → next version. Versions list with view / download. The latest version travels with the order.

### 3.4 Convert to Order (approved samples only)
- Carried, locked: buyer, style, sample number, revision, product, fabric, colour, size range, accessories
- Order Quantity (pcs) ★ · Cutting Quantity (pcs) · Buyer PO No · FOB Price / pc (₹, needs *See rates*) · Ship Date · Payment Terms: Letter of Credit (LC) — 60 days / LC at sight / LC — 90 days / T/T — 30% advance / T/T — 100% against documents · Shipment Mode: Sea / Air · Priority · Size Breakdown % (S, M, L, XL, 2XL, 3XL; must total 100) · Special Instructions · Extra fields
- Save → order `AFI-####`, stage **Order Confirmed**; the TNA is generated from the template (if auto-apply is on) and the order, PP sample and spec activities are marked done. You land on the order page.

---

## 3a. Dashboard (home)
- Hero: greeting, date, live badge, **quick actions** (Log production · Gate entry · New sample · Raise PO · Inspection · Invoice — only the modules you have), four live stats (My work, Alerts, Live orders, Today's output).
- KPI tiles: open order book (pcs, FOB value with the rates flag), output last 7 days with a 14-day sparkline, TNA overdue / due soon ring, materials needing attention with a stock-health bar.
- Charts: production last 14 days (per-day bars, hover for pcs / rejected; stage totals below), orders by stage donut + pieces by buyer, **Shipping next** (sample photo, `NOW · stage`, floor completion, days to ship), **Needs your attention** (your queue + unacknowledged alerts), dispatched vs realised 12-month line (₹ only with the flag), material & procurement (stock-health donut, open POs, at vendors, category tiles), sampling funnel, T&A workload by owner, AQL results + inline DHU sparkline.
- Reports cards run a register directly (`/reports?run=<key>`); the modules grid stays at the bottom. Everything refreshes every 60 s.

## 3b. Sample Development (the entry point)
- **List**: one card per sample — photo, style, description, sample no + buyer, target date, status, round chips. Everything else is on the sample page.
- **New Sample Request** (`/samples/new`) is a 5-step wizard: **1 Request** (buyer, style, type, description, size range, target date, priority, accessories, notes + *what the buyer sent*: article no, factory, processes, CC material and the colour/qty, BOM, tech-pack, artwork dates + spec-sheet upload + courier) · **2 Pieces & photos** (drop photos — **many per piece**, first is the cover; description, fabric, colour, sizes, qty, notes) · **3 Measurement spec** (POM per size with tolerance and auto-grade) · **4 Costing** (fabric yardage × shrinkage × rate, trims, process costs, sending charges, wastage %, profit % → cost per piece in ₹ and in the buyer's currency against their target) · **5 Review & save**. Editing an existing sample opens the same wizard.
- **Sample page** (`/samples/:id`) — tabs, no popups: *Overview* (pieces, details, courier, spec sheets, rounds, costing and approvals summaries) · *Pieces* (all photos) · *POM spec* · *Measurements* (round vs spec + comment sheet) · *Costing* · *Approvals* · *Tech pack* · *Tracking* (buyer dates + round-by-round send-out / AWB / comment dates).
- **Materials tab** = the client's *style wise material requirement* sheet: one line per thing a piece eats (category from the 16-group catalog → item → description → unit → consumption per piece → wastage % → stock item → MOQ → supplier → required date → remarks). Below it the **stock analysis** recalculates live: average consumption, final required on the order quantity, free stock, shortage, quantity already on order, MOQ and the **final order quantity** — green = enough in stock, amber = partly short, red = buy it / not in the stock master. **Converting the sample to an order builds the BOM by itself** from this sheet (missing stock items are created as FAB-9xxx / ACC-9xxx and the order timeline says so); the **Create / update BOM** button does the same on demand (also from Material Planning → *Build from SMP-xxx*), so Material Planning, reservations, POs and the gate all work off the same numbers. Each short line has a **PO** button (quantity pre-filled, editable).
- **Sample sheet** button prints the whole dossier — request, buyer dates, pieces with photos, POM, rounds, approvals, tech pack and the costing sheet — the document you send the buyer before the order.
- What is typed here flows on: pieces → order photos, POM → measurement inspection, **material sheet → BOM → requirement → purchase orders**, costing → the order's unit price on **Convert to Order**, dates → TNA.

## 4. The order page (Orders → click an order)

Top: order number, buyer, style, quantity, ship date, priority, stage (Admin can override the stage from a dropdown), **Close Order**.

**Control Tower**: 12 gates, all derived — Order, Sample, Spec Sheet, Material (reservation), Procurement (POs), Job Work, Cutting, Stitching, Finishing, Packing, Dispatch, Payment. Each shows ok / warning / pending with a one-line reason.

**Order Stock** (needs a BOM, see 5.1): per material — per piece + waste %, Required, Reserved for this order, Free, On Order, Shortage, To Order, Status.
- **Reserve Free Stock** → locks free stock to this order (ledger `reserve` rows) · **Release Reservation** reverses it
- **Raise N POs** → one PO per shortage line, grouped by the material's supplier (see 5.2)

**Time & Action Plan** card: compact pipeline strip + task table (edit pencil → replan, see 10.2) · Generate TNA / Regenerate

**Buyer Tracking Link** card (see 12.1)

**Dispatch & Export Documents** and **Payment** cards appear once an invoice exists.

**Production Operations** card: Cutting / Stitching / Finishing / Packing with execution type, planned / done / pending, location (Factory / vendor) · **Log** · **Plan**

**Job Work** card: challans for this order · **New Challan** · row click → challan detail

**Purchase Orders** and **Material Movement** (ledger timeline) tables · **Activity** notes (add a note).

---

## 5. Materials

### 5.1 Material Planning → Define BOM / Edit BOM (per style)
- Style (dropdown) · quantity to plan
- Lines: Material ★ (from stock) · Per pc ★ · Waste % (default 5) · Note · Add Line / ✕ → **Save BOM** (versioned)
- The page shows Required (= ceil(perPc × qty × (1 + waste %))), Free, Shortage per line and **Raise N POs**.

### 5.2 Purchase Orders → New Purchase Order (one material per PO)
- Material ★ (dropdown; picking it pre-fills the usual supplier and rate) · Quantity ★ · Supplier ★ · Rate (₹ / UOM, rates flag) · Against Order (an open order, or *stock replenishment*) · Expected Delivery (date) · Payment Terms (default 30 days credit) · Delivery At (default Unit 1 — Noida) · Priority: Urgent / High / Normal / Low · Specification & Notes · Extra fields
- Save → `PO-####`, status **Ordered**, or **Pending Approval** when the value exceeds the limit in Settings.
- PO detail dialog: ETA edit · **Approve** (needs the *Approve purchase orders* flag) · **Mark In Transit** · **Cancel PO** · receipts history · **GRN** (jumps to Gate Entry with this PO selected) · rate history for the material
- Statuses: Pending Approval → Ordered → In Transit → Partially Received → Fully Received; or Cancelled.

### 5.3 Accessories
- Accessory stock (free / reserved / on order) and **requirement by open order** from the BOMs: Available / On Order / Not Ordered per line · **Raise POs** per order · **Reorder** per material.

---

## 6. Gate Entry (Store Manager or Gate Man) — the only way stock increases

- **Awaiting verification** table: every open PO and every open job-work challan · **Receive** selects it (or arrive from a PO / challan with it pre-selected)
- Form: Document (PO / challan) ★ · Current Received Qty ★ (or *Current Return Qty* for job work) · Rejected / Short · Vehicle Number · Driver Name · Delivery Challan No (or *Vendor Challan No*) · Supplier Invoice No (or *Vendor Invoice / Job Bill No*) · Date · Received By · Inspection Result: Passed 4-point / Passed with deviation / Rejected · Store Location (material's usual godown or a Settings godown) · Remarks · Extra fields · Photo of challan / vehicle (camera on phones)
- Live math under the form: total = previous + current, remaining = ordered − total, status after. **Current > remaining is blocked.**
- **Confirm Gate Entry** → `GE-####` + `GRN-####`, stock rises (ledger `receipt` row), PO becomes Partially / Fully Received, order activity updated; for a job-work return the challan's pending falls and the production stage advances.
- Gate register below. *Simple screen* toggle (large controls) is the default for the Gate Man.

---

## 7. Patterns (Sampling / Merchandising)

### 7.1 Patterns → New Pattern
- Style ★ · Linked sample round · Pattern maker (user) · Base size · Size range · Grading: Not started / In progress / Graded · Marker efficiency % · Priority · Approval due (TNA) · Remarks · Extra fields → `PT-####`, status **Draft**

### 7.2 Pattern detail
- **Add version**: upload the pattern file (DXF / PLT / PDF / image) → v1, v2 …
- **Submit for Review** → In Review · **Approve** (needs *Approve cutting patterns* flag; marks the TNA pattern activity) → Approved · Reject with a reason → Draft
- **Issue v*n***: Order (optional) · Issued to (name) → issue log
- Filter chips: All · Draft · In Review · Approved · Overdue

---

## 8. Job Work (Production Manager)

### 8.1 Job Work → New Job Work Challan
- Against Order ★ (open orders) · Process ★: Dyeing / Printing / Softening / Washing / Embroidery / Cutting / Stitching / Finishing / Other (+ *Describe the process* when Other) · Vendor ★ (vendors of that process) · Rate (₹ / unit, vendor flag) · Material Issued (from stock; optional — panels / garments are tracked by quantity only) · UOM · Item Description ★ · Issue Quantity ★ · Issue Date · Expected Return · Priority · Process Instructions · Extra fields
- Save → `JW-####`, status **Sent to Vendor**. Issuing a stock material posts a ledger `issue_jw` row (stock leaves the store and the order's reservation). Cutting / Stitching / Finishing challans link to the production operation as *Outsourced*.

### 8.2 Challan detail
- Location engine (never typed): OUTSOURCED (nothing back) · PARTIALLY IN-HOUSE (some back, e.g. *8,000 in-house / 4,000 at V-05*) · IN-HOUSE (all back)
- **Print Challan** (GST non-sale challan on the letterhead) · **Receive at Gate** (returns come only through Gate Entry, over-return blocked) · **Cancel Challan** (ledger reversal) · return history with running balance
- Vendor on-time % is recomputed from returns.

---

## 9. Production Floor (Production Manager)

- Board: today's output, rejected, DHU, manpower, idle lines, outsourced operations, pending at vendors; a card per order × operation.
- **Floor board** (default tab): a **floor pulse** header (today's output, workers, lines running, DHU, pcs at vendors, 7-day output bars, today by stage, line status chips); one row per open order (hover the order number for the sample photo) with a `NOW · stage` badge, and a **progress ring per operation** (click → that stage's tab filtered to the order; **Plan** / **Log** / **Challans** inside the card); **Lines today** tiles (efficiency ring vs the daily target); **Live activity** feed (latest logs incl. gate returns). Refreshes every 30 s.
- **Order-aware forms**: picking an order in the Cutting report, Log Production, Loading plan, Job Work challan or Fabric inspection form shows an **order facts strip** (style, qty, colours, BOM fabrics, done-so-far / balance of that operation) and fills what sampling / the order already defined — Cutting: fabric list = the style's BOM fabrics (auto-picked when there is one), gate **lots** of that fabric (lot → thans, width), size boxes show **plan / cut so far / balance** per size with *Fill balance*; Log Production: colour dropdown shows done / planned per colour and the output is prefilled with the balance, line = the operation's line; Loading plan: target placeholder = balance; Job Work: quantity = pending pieces of that operation, description prefilled, BOM materials starred first; Fabric inspection: optional order → BOM fabrics only + GRN/lot pick that fills GRN, lot, colour, width, thans.
- **Log Production** (or **Log** on a card): Order ★ · Stage ★: Cutting / Stitching / Finishing / Packing · Line / Section (from Settings) · Date · Output Quantity (pcs) ★ · Rejection / Alter · Manpower · Supervisor · Extra fields → order progress and stage move forward (forward only); TNA start / complete activities auto-fill.
- **Plan** on a card: Execution: In-house / Outsourced (+ Vendor) · Line · Planned qty · Blocked (tick) + reason → a blocked stage stops logging and raises an alert.
- **Daily Report**: print the day's floor summary.

---

## 10. TNA — Time & Action

### 10.1 Buyer Board
- Header buttons: **How it works** (6-step guide) · **Stages** (see 1.8) · tabs Buyer Board / Tasks / Calendar / Templates
- KPIs: Overdue Tasks · Due Soon · On Track · My Tasks
- Flow strip (numbered stages) and, per buyer, one row per live order: summary panel (order, **sample photo**, description, style, qty, ship date, `NOW · stage` badge, progress ring, overdue / due-soon, health, **Live status →** / **Plan**) and the stage pipeline (cards: number, name, state Done / Now / Blocked / Upcoming from the real floor data, next activity + date, mini progress bar; **click a stage → its page**, e.g. Stitching → Production Floor stitching tab filtered to the order). **Generate TNA** appears on orders without a plan.
- **Click the order panel → order live page** (`/tna/order/:id`, no popup): sample photos, order facts, live pipeline, the 12 control-tower gates, material / production / dispatch-payment briefs, next activities and the **full T&A plan table** inline (edit / replan / done). Refreshes every 20 s.
- **Hover any order number** anywhere in the software (floor board, quality, dispatch, PO, payments, packing, job work…) → a small card with the sample photo, style, buyer, qty, ship date and stage.

### 10.2 Tasks tab (also on every order page)
- Chips: Open · All · Done · Red · Amber · Green; optional order filter
- Row pencil → **task dialog**: Planned start · Planned end · Priority · Owner (user) · Status: Pending / In Progress · Remark · **Reason ★ when a date or priority changes** (replan; history is kept and written to the order timeline) · **Mark Done** (actual end date) · **Reopen**
- Colours: green = on track, amber = within the amber window, red = planned end passed.

### 10.3 Calendar tab: month view of planned ends by day.

### 10.4 What fills automatically (no manual tick needed)
order confirmed, spec sheet, PP sample (from conversion) · pattern (pattern approval) · fabric PO (first fabric PO) · fabric / trims in-house (PO fully received) · cutting / stitching / finishing / packing start & complete (production logs or job-work returns) · final inspection (Final AQL pass) · ex-factory & dispatch (shipped on board) · payment (invoice fully realised).

---

## 11. Quality (Production Manager)

### 11.1 Fabric 4-point tab → Log Inspection
- Fabric ★ (fabric material) · GRN (optional link) · Lot no · Metres inspected ★ · Width (inches) · Colour · GSM · Defect points grid: categories Weaving / Patta-selvedge / Print-dye defect / Hole / Hard stain × point values 1, 2, 3, 4 · Inspector · Date · Remarks · Extra fields
- Live: total points and points / 100 sq m against the Settings limit → Pass / Fail. A Fail puts the free stock of that material **on hold** (ledger reserve). **Release** (with a reason) lifts the hold.

### 11.2 Inline & DHU tab → Log Inspection
- Order ★ · Line · Type: Inline / End-line · Stage: Cutting / Stitching / Finishing / Packing · Pieces checked ★ · Defect counts (defect master: BS Broken stitch, SS Skip stitch, OS Open seam, UH Uneven hem, ST Stain / oil mark, SV Shade variation, MO Measurement out, ML Missing / wrong label, HO Hole / damage, PK Puckering, UT Untrimmed thread, WS Wrong size / assortment — or your own list from Settings) · Date · Inspector · Remarks · Extra fields
- DHU % = defects ÷ pieces × 100; above the limit raises an alert.

### 11.3 Mid / Final AQL tab → Inspect Lot
- Order ★ · Stage: Mid / Final · AQL level: 2.5 / 4.0 · Lot size (pcs) ★ → Sample size, Accept / Reject numbers shown automatically · Sampling: Reduced / Normal / Reinforced · Inspector · Inspector type: Internal / Buyer QA / Third party · Merchandiser · Date · Cartons opened / total · Colour · Site · Defect counts (major / minor) · Workmanship checks: colour, fabric, outlook, packaging, PCL, assortment, marking → OK / Not OK / N/A · Result: auto Pass / Fail, or **Hold** with a hold reason · Attach report / photos · Extra fields
- **Post Result** → `QI-####`. A Final **Pass** completes the TNA final-inspection activity. A Final **Fail or Hold blocks the export invoice** until a later Pass.

### 11.4 Rejection analysis tab: defect Pareto and line-wise DHU trend.

---

## 12. Buyer tracking portal

### 12.1 Order page → Buyer Tracking Link → New link
- PIN (optional, 4–6 digits) · valid for (days, default from Settings)
- The link (`<base>/track/CODE`) is copied to the clipboard. Row actions: **Copy** · **Open** · **Log** (view count, last opened, IP / browser, refused PINs) · revoke (power icon) — a revoked link stops immediately.
- The buyer sees, without logging in: buyer PO + style, description, colour, quantity, ship date, order stage, % complete, the stage board (only stages marked *Shown* in Stages), the shipment card once on board, and the merchandiser's contact. Never prices, vendors, stock, payments or remarks.

### 12.2 Buyers → Portal
- Switch *Buyer-wise master link* on / off; one master link lists every live order of that buyer.

---

## 12a. Vendors & Suppliers — money out
- Header strip: **still to pay job-work vendors** and **material suppliers** (billed − paid), overdue (>30 days) in red, plus a *waiting for money* list — click a name to open its account.
- Each row: what work was given (challans / POs, quantity done, last document), **billed · paid**, and **still to pay** (red chip = pending, green = settled).
- Clicking a row opens the **account**: every challan / PO with quantity, rate, billed, paid and balance; every payment voucher (date, method, UTR / cheque, what it settled, who recorded it); **Record payment** (the oldest bills are pre-filled, each line editable, over-payment refused; an extra amount becomes an on-account advance) and a printable **statement**.
- Job work is billed on the quantity that came **back** (returned × rate) and a purchase order on the quantity **received** at the gate (received × rate), so nothing is payable before the goods are in.
- The same numbers appear on **Job Work**: work value and still-to-pay per challan with a **Pay** button, and the page KPI shows the total owed to vendors.

## 13. Packing (Production Manager)

- Packing & Cartons: one panel per open order (plan tiles — pack ratio, pcs/carton, cartons built — packed progress bar, short lines, **Set plan / Log packing / Packing list**) and, below, the packing material check (free, required, coverage bar, balance, on order, Reorder / PO)
- Row pencil → **Set plan**: Pcs per carton ★ · Pack ratio (text, e.g. *Ratio pack 1-2-2-1*) → **Save Plan**; cartons = ceil(qty ÷ pcs per carton)
- **List**: printable packing list (per-carton breakdown) · **Order Packing Material** / **Reorder** → PO dialog pre-filled
- Statuses: Queued · Blocked (packing material short) · In Progress · Completed (from packing logs on the floor).

---

## 14. Dispatch & Documents (Accounts)

### 14.1 Dispatch → Create Export Invoice
- Order ★ (open orders; picking it fills qty, cartons, mode, payment method) · Invoice date · Shipment mode: Sea / Air · Port of loading · Port of discharge · Incoterm: FOB / CIF / CNF / EXW · Quantity (pcs) · Cartons ★ · Gross weight (kg) · Net weight (kg) · Invoice value (₹, rates flag; default FOB × qty) · Payment method: LC / T/T / Advance · Transporter / CHA · Documents to prepare (chips): Commercial Invoice, Packing List, E-Way Bill, Delivery Challan, Certificate of Origin, GSP Form A; the carrier document (Bill of Lading for Sea, Airway Bill for Air) is added automatically · Extra fields
- **Generate Invoice** → `AFI/EXP/FY/####`, a payment tracker opens automatically. Refused while the order's Final AQL is failed or on hold.

### 14.2 Shipment detail
- Documents checklist: **Generate** (server-built print for Commercial Invoice, Packing List, Delivery Challan, Certificate of Origin, E-Way Bill) · **Upload** a file · **Number** (authority-issued number)
- Shipment fields: Vessel / flight · Container no · Seal no · Shipping bill no · Transporter · ETA → Save
- Tracking timeline → **Record event**: Factory stuffing · Customs clearance · Shipped on board (needs the invoice and packing list ready; moves the order to Dispatch and completes the ex-factory / dispatch activities) · In transit · Delivered — each with date and detail
- Status is derived: Docs In Progress → Ready to Ship → Shipped On Board → In Transit → Delivered.

---

## 15. Payments (Accounts)

- One tracker per invoice: method LC / T/T / Advance, bank, terms, reference (LC number), due date, amount (rates / financial flag), pending = invoice − Σ receipts
- **Milestones → Mark done** (date + detail): LC — LC received & checked · Amendment (if any) · Goods shipped & documents prepared · Documents negotiated at bank · Payment credited; T/T — Advance received · Goods shipped & documents sent · Balance remitted · Payment credited
- **Record Receipt**: Date · Amount ★ (over-receipt blocked) · FX rate · Bank · BRC / FIRC reference · Charges · Note → status Awaited → Partial → Received. Full realisation completes the TNA payment activity and moves the order to Payment.
- **Voucher**: printable receipt voucher. KPIs: realisation days, receipts by method, overdue.

---

## 16. Compliance (Accounts, *Add / renew* flag to write)

- **Add Document**: Title ★ · Category ★: Company licence / Insurance / Certification / Buyer audit / Bank · IEC · GST / Format · Template / Other · Issuing authority · Number · Responsible user · Issue date · Expiry / renewal date (empty for permanent documents and formats) · Confidential (tick; only the *See confidential* flag can open it) · Notes · Extra fields → `CD-####`
- Document detail: **Upload file & renew** (new version; a new expiry resets reminders) · versions list · *Renewal in progress* tick · **Dismiss** a reminder for N days with a reason · reminder log
- Reminders fire at the Settings offsets (default 60 / 30 / 15 / 7 / 1 days) to the owner and compliance managers, in-app. **Expiry Register** prints the full list.

---

## 17. Reports & Analytics (Merchandising / Accounts; *Financial reports* flag for money)

- KPIs: on-time delivery, capacity, fabric wastage, gross margin · dispatch vs realisation trend · buyer-wise value · process-cost donut · **Print Dashboard**
- Runnable reports (**Run** → table → **CSV (Excel)** / **Print / PDF**): Order Status Summary · Material Consumption vs Standard · Job Work Pending Register · Production Efficiency & DHU · Stock Ageing & Reorder · Export Realisation (LC / T-T) · Buyer Profitability · TNA Delay Report · Quality / DHU Trend · Compliance Expiry Register · Priority Ageing Report

---

## 18. Daily routine (everyone)

- **My Work**: your queue in buckets Overdue / Today / This week / Later — TNA activities (**Replan**, **Done**), alerts (**Acknowledge**), approvals waiting for you (POs, patterns), inspections due. Admin sees a team heat-map.
- **Alert Center**: all open alerts with module filter, **Acknowledge**, Admin **Re-evaluate now**. Rules: material shortage, packing blocked, PO overdue / partial / awaiting approval, gate pending, job work overdue, TNA red / amber, quality final fail / DHU / hold, production blocked, sample waiting with buyer, pattern review / overdue, compliance expiry, payment overdue, dispatch documents pending. Red alerts escalate to Admin after the hours set in Settings.
- **Dashboard**: role-specific KPIs and the live module list.

---

## 19. Admin utilities (backend folder)

- `npm run seed` — demo data (idempotent; never on production)
- `npm run backup` → `backups/<timestamp>/` (every collection as JSON + uploads) · `npm run restore -- --dir backups/<timestamp> --yes`
- `npm run import -- materials|suppliers|vendors|buyers file.csv` (`--columns` prints the accepted headers)
- `npm run test:e2e` — in-memory MongoDB, seed, ~400 API checks across every module
- `.env`: `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`, `SERVE_FRONTEND=true` to serve the built frontend from the API on one port

---

## 20. Order status and stage reference

- Order status: Open → Closed (Close Order on the order page)
- Order stage (derived, forward-only): Order Confirmed → Material Sourcing → Job Work → Cutting → Stitching → Finishing → Packing → Dispatch → Payment → Closed
- Sample status: In Sampling → Sent → Client Review → Revision (next round) → Approved / Rejected
- PO status: Pending Approval → Ordered → In Transit → Partially Received → Fully Received / Cancelled
- Job work status: Sent to Vendor → Partially Received → Received / Cancelled; location Outsourced / Partially In-house / In-house
- Pattern status: Draft → In Review → Approved → Superseded (when a newer version is approved)
- Shipment status: Docs In Progress → Ready to Ship → Shipped On Board → In Transit → Delivered
- Payment status: Awaited → Partial → Received
- TNA activity: Pending → In Progress → Done; colour green / amber / red


---
---

# Quick Start (Hinglish) — ek order ko shuru se end tak khud chalao

Upar wala section reference hai (har form ka har field). Yeh section **sirf order** hai: pehle kya, phir kya. Ek hi order ko in steps se le jao, har step 2–5 minute ka hai. Jahan login likha hai wahan user badal lo (password sabka `Afion@123`).

> Shortcut: `npm run seed` chala do to Part A–B ka demo data pehle se aa jayega (buyers, vendors, materials, ek approved sample, order AFI-1043). Phir bhi ek baar khud banana ho to niche se chalo.

## Part A — Setup (sirf ek baar) · login: `vikram`

**Step 1 · Company set karo**
Settings → Company tab → Legal Name, IEC, GSTIN, Address, Phone, Email bharo → Letterhead upload karo (PNG/JPG/PDF) → upar **Save Changes**.

**Step 2 · Godown aur lines batao**
Settings → Stores & Procurement → PO approval limit (₹) likho (jaise 500000), Godowns ek line mein ek → Production tab → Lines ek line mein ek, daily target → **Save Changes**.

**Step 3 · Pipeline ke steps decide karo**
TNA → **Stages** button → jo steps chahiye rakho (rename / add / remove / order) → Buyer portal pe kaunsa dikhana hai tick → **Save pipeline**. (Default 9 steps already hain; abhi change na karna ho to skip.)

**Step 4 · Team banao**
Users & Roles → **Add User** → Name, User ID, Password (Generate), Role choose karo (Merchandising Head / Store Manager / Production Manager / Gate Man / Accounts / Sampling Incharge) → modules auto tick ho jayenge → zaroorat ho to flags tick karo (buyer identity, vendor identity, rates, PO approve, pattern approve, compliance, TNA replan) → Save.
Seed ke users already hain: saurav, neha, meena, ravi.gate, amit, sunita.

## Part B — Masters (ek baar, phir sirf naye aane pe) · login: `saurav` (buyers), `amit` (vendors), `meena` (materials)

**Step 5 · Buyer add karo** (saurav)
Buyers → **Add Buyer** → Brand ★, Legal Entity, Country, Currency, Payment Terms, Contact → **Create Buyer**. Alias `B-##` apne aap milega.

**Step 6 · Supplier aur Vendor add karo** (amit)
Vendors & Suppliers → **Add Supplier** (fabric/trims dene wala: Name ★, Category Fabric/Accessory/Packing/Mixed, Lead time) → Save.
**Add Vendor** (job work karne wala: Name ★, Process Category — Dyeing/Printing/Washing/Embroidery/Cutting/Stitching/Finishing/Other, Rate, Capacity) → Save.

**Step 7 · Material add karo** (meena)
Stock & Inventory → **Add Material** → Code ★ (FAB-0180), Name ★, Category (Fabric/Accessory/Packing), UOM (mtr/kg/pcs/set/roll/cone), Rate, **Opening Qty** (jo stock abhi godown mein hai), Reorder Level, Godown, Supplier → Save. Fabric, buttons, labels, poly bag, carton — sab material yahin banate hain.

## Part C — Sampling → Order · login: `saurav`

**Step 8 · Sample request banao**
Sample Development → **New Sample Request** → Buyer ★, Style No ★ (AF-2480), Sample Type (Proto), Product Description ★, Size Range, Target Send Date, Priority.
Section 2: sample piece ki **photo drop karo** (har photo ka ek card) ya *Piece without photo* → har card mein Piece/description ★, Fabric type, Qty, Colour, Sizes (S M L … ya **F** free size), notes.
Section 3: Accessories, Buyer comments. Section 4: tech pack PDF upload (optional). Section 6: Courier method, AWB → **Create Sample Request**. Status: *In Sampling*, number SMP-###.

**Step 9 · Sample buyer ko bhejo**
Sample card → **Mark Sent to Buyer** → Sent On date, Courier / AWB → Save. Status: *Client Review*.

**Step 10 · Buyer ka jawab log karo**
Sample card → **Log Buyer Feedback** → comment likho → **Approved** dabao.
(Agar buyer ne change maanga: **Changes → Round 2** + next sample type → Step 9 dobara. Reject hua: **Rejected**.)

**Step 11 · Spec sheet banao**
Approved sample → **Spec Sheet** → **Generate & Print** (letterhead pe ban jayegi, print dialog se PDF save karo) ya **Upload Buyer's Sheet**.

**Step 12 · Order banao**
Approved sample → **Convert to Order** → Order Quantity ★ (12000), Cutting Qty, Buyer PO No, FOB price, Ship Date, Payment Terms (LC 60 days / LC at sight / LC 90 / T/T 30% / T/T 100%), Mode Sea/Air, Priority, Size % (total 100) → **Create Order**.
Order AFI-#### ban gaya, TNA plan apne aap ban gaya, order page khul gaya. Yahan **Control Tower** ke 12 gates dekho — abhi zyada pending honge, aage ke steps se ek ek green honge.

## Part D — Material · login: `saurav` (BOM), `meena` (PO, gate)

**Step 13 · BOM banao** (saurav)
Material Planning → style choose karo → **Define BOM** → har line: Material, Per pc (1 shirt mein kitna), Waste % → **Save BOM**.
Ab order page ka **Order Stock** table bharega: Required · Reserved · Free · On Order · Shortage · To Order.

**Step 14 · Jo stock hai use lock karo** (saurav ya meena)
Order page → Order Stock → **Reserve Free Stock**. Free stock is order ke naam ho gaya (Control Tower gate 4 green).

**Step 15 · Shortage ka PO banao** (meena)
Order page → **Raise N POs** (shortage lines ka PO supplier-wise ban jayega) ya Purchase Orders → **New Purchase Order** (Material ★, Quantity ★, Supplier ★, Rate, Against Order, Expected Delivery) → **Raise PO**.
Agar value approval limit se upar hai to status *Pending Approval*: `vikram` (ya PO approve flag wala) PO khol ke **Approve** kare. Supplier ne bhej diya to **Mark In Transit** (optional).

**Step 16 · Maal gate pe receive karo** (meena ya ravi.gate)
Gate Entry → list mein PO pe **Receive** → Current Received Qty ★, Rejected, Vehicle, Driver, Challan No, Invoice No, Inspection Result (Passed 4-point / with deviation / Rejected), Store Location, photo → **Confirm Gate Entry**.
GRN ban gaya, stock badh gaya, PO *Partially / Fully Received*. Pending se zyada daaloge to block hoga — yahi rule hai.
(Order page → Order Stock mein On Order kam, Free zyada dikhega. Fabric aaya to TNA ka "fabric in-house" auto done.)

## Part E — Production · login: `neha`/`saurav` (pattern), `amit` (baaki sab)

**Step 17 · Pattern** (neha banaye, saurav approve kare)
Patterns → **New Pattern** → Style ★, base size, size range, due date → Save → detail kholo → **Add version** (DXF/PDF) → **Submit for Review** → saurav login: **Approve** → **Issue v1** (order + kisko diya).

**Step 18 · Job work bhejo (agar bahar kaam hai)** (amit)
Job Work → **New Job Work Challan** → Against Order ★, Process (Printing/Embroidery/…) ★, Vendor ★, Material Issued (stock se) ya sirf pieces, Item Description ★, Issue Quantity ★, Expected Return → **Issue Challan** → **Print Challan**.
Stock "At Vendor" dikhega, order location *OUTSOURCED*.

**Step 19 · Job work wapas lo** (meena/ravi.gate)
Gate Entry → list mein challan JW-#### pe **Receive** → Current Return Qty → **Confirm**. Aadha aaya to *PARTIALLY IN-HOUSE*, pura aaya to *IN-HOUSE*. Cutting/Stitching/Finishing ka challan tha to production stage apne aap aage badhega.

**Step 20 · Floor pe production log karo** (amit)
Production Floor → **Log Production** → Order ★, Stage (Cutting → Stitching → Finishing → Packing, isi order mein) ★, Line, Date, Output Qty ★, Rejected, Manpower → **Log Production**.
Har din ka output yahin daalo. Order ka progress % aur stage apne aap aage jaata hai; TNA ke cutting/stitching/finishing/packing activities auto done.
(Kisi stage ko outsourced/blocked karna ho: card pe **Plan**.)

**Step 21 · Quality check karo** (amit)
Quality → tab **Fabric 4-point** → **Log Inspection** (fabric aate hi: metres, width, defect points → pass/fail; fail = stock hold).
Tab **Inline & DHU** → **Log Inspection** (line pe daily: pieces checked, defect counts → DHU %).
Tab **Mid / Final AQL** → **Inspect Lot** → Order ★, Stage **Final**, Lot size ★ (sample size/accept auto), defects, checks → **Post Result**. **Final Pass hona zaroori hai**, warna invoice nahi banega.

**Step 22 · Packing plan** (amit)
Packing & Cartons → order row pencil → Pcs per carton ★, Pack ratio → **Save Plan** → **List** (packing list print). Packing material short ho to **Reorder** se PO.

## Part F — Dispatch → Payment · login: `sunita`

**Step 23 · Export invoice banao**
Dispatch → **Create Export Invoice** → Order ★, Invoice date, Mode Sea/Air, Port of loading, Port of discharge, Incoterm (FOB/CIF/CNF/EXW), Quantity, Cartons ★, Gross/Net weight, Invoice value, Payment method (LC / T/T / Advance), Transporter/CHA, Documents to prepare (chips) → **Generate Invoice**.
Invoice AFI/EXP/FY/#### ban gaya, Payments mein tracker apne aap khul gaya.

**Step 24 · Documents complete karo**
Invoice kholo → har document pe **Generate** (Commercial Invoice, Packing List, Delivery Challan, COO, E-Way Bill — system banata hai, print/PDF) ya **Upload** (B/L, AWB, GSP) ya **Number** (authority number). Vessel/flight, container, seal, shipping bill, ETA bhar ke Save.

**Step 25 · Shipment track karo**
Usi dialog mein **Record event** in order: Factory stuffing → Customs clearance → **Shipped on board** (invoice + packing list ready hona chahiye; order stage *Dispatch* ho jayega, buyer portal pe shipment card dikhega) → In transit → Delivered.

**Step 26 · Payment**
Payments → invoice row kholo → **Milestones** mark karo (LC received → Amendment → Shipped & docs → Negotiated → Credited; T/T ke liye Advance → Shipped → Balance → Credited) → paisa aaya to **Record Receipt** → Date, Amount ★, FX rate, Bank, BRC/FIRC ref → Save.
Pura amount aa gaya = status *Received*, order stage *Payment*, TNA ka payment activity done.

**Step 27 · Order band karo** (saurav/vikram)
Order page → **Close Order**. Control Tower ke 12 gates green — order complete.

## Part G — Roz ka kaam (har user) · buyer ko dikhana

**Step 28 · Buyer ko tracking link do** (saurav, Step 12 ke baad kabhi bhi)
Order page → **Buyer Tracking Link** → PIN (optional), days → **New link** → link copy ho gaya → buyer ko WhatsApp/email karo. Buyer bina login ke `/track/CODE` pe stage board, dates, shipment dekhega. **Log** mein dikhega kab khola. Band karna ho: power button (revoke).

**Step 29 · Roz subah**
Har user: **My Work** kholo → Overdue / Today mein jo hai use **Done** ya **Replan** (reason likhna zaroori) → **Alert Center** ke alerts **Acknowledge**.
Merchandiser: **TNA → Buyer Board** — har order ki pipeline ek nazar mein (Now / Overdue / Due soon).
Accounts: **Compliance** — expiring licences ke reminders, **Upload file & renew**.
Management: **Reports** → koi bhi report **Run** → CSV / Print.

## Ek line mein poora flow

Settings → Users → Buyer / Supplier / Vendor / Material → **Sample Request → Sent → Approved → Spec Sheet → Convert to Order** → BOM → Reserve → PO → Approve → **Gate Entry (GRN)** → Pattern → Job Work challan → Gate return → **Production log** (Cutting → Stitching → Finishing → Packing) → Quality (Fabric / DHU / **Final AQL pass**) → Packing plan → **Export Invoice** → Documents → **Shipped on board** → Payment receipt → **Close Order**. Beech mein: TNA board, My Work, Alerts, buyer tracking link.

---

# Part H — Client formats update (Sept 2026) · Hinglish

Upar ke Parts A–G waise ke waise chalte hain. Yeh part sirf **naye** forms/buttons batata hai jo client ke asli documents (purchase note, sample status sheet, POM spec, BOM sheet, AFN/10-11-13-14-17-19-21-22-40 formats, invoice, packing list, shipping track) se aaye hain. Jahan Step number likha hai woh upar ke Quick Start ka step hai jiske **saath** yeh karna hai.

## H1 — Settings (ek baar) · login: `vikram`
**Settings → Company:** address (Gurgaon) check karo, **GSTIN**, **IEC**, **AD code** (bank ka) bharo — invoice pe print hote hain.
**Settings → Production:** **Cutting extra %** (default 5), **Size sets** (ek line = `Naam: S, M, L, XL` — Japan M–3L, Free size, Kids… pehle se hain, apne add karo), **Approvals board rows** (lab dip, strike-off, trim card… ki default list).
**Settings → Export & Portal:** **Order / invoice currency** (USD), **Exchange rate** (₹ per USD, naye order/invoice pe default), **IGST %** (5; LUT ho to 0), **Format numbers** (AFN/10 = 4-point, AFN/11 = cutting, AFN/13 = blade, AFN/14 = stitching WIP, AFN/17 = needle, AFN/19 = invoice, AFN/21 = final inspection, AFN/22 = measurement…) — har print ke header pe "Format No." aata hai.

## H2 — Sample ke saath (Step 7–9 ke beech) · login: `saurav` / `neha`
Sample card ke neeche 4 buttons hain — style ke liye ek baar:
1. **POM** → size set choose karo → har row = point of measure (code A, B, C…, naam, tolerance ±) → har size ka spec cm mein → **Auto-grade** (2 sizes bharo, baaki khud) → **Save spec**.
2. **Measure** (har round pe) → round + jo size napi (e.g. L) → har POM ka **measured** value (spec se zyada farak = red) + **buyer instruction** ("reduce 1 cm") → plan columns: due date, pcs per colour, actual sent, comments received → **Save** · **Print comment sheet** (spec vs R1/R2/R3 measured + instructions ek table mein).
3. **Approvals** → board pehle se bhara hai (Proto, Fit, Size Set, Lab dip, Print strike-off, Embroidery mock-up, Wash strike-off, Shade band, Trim card, FPT, GPT, PP, Exhibition, Salesman, Photoshoot, SMS, TOP) → har row: due, pcs/col, received (factory se), submitted (buyer ko), AWB, approved, comments on, **status** (Pending / Received / Submitted / Approved / Rejected / Resubmit), comment → **Save board**. Status **Approved** karte hi us style ke open order ki TNA activity (lab dip / strike-off / trim card / fit / size set / PP / TOP) apne aap Done. **Print** = buyer ka "sample status" sheet.
4. **Tech pack** → composition, lining, article, construction notes, label placement, packing method, **accessory list per piece** (main label 1, button 7…) → **Save**. Spec Sheet print pe "Tech Pack" + "Measurement Spec" sections apne aap aa jaate hain.
Sample type ab 10 hain: Proto / Fit / Revised Fit / Size Set / PP / Exhibition / Salesman / Photoshoot / SMS (1st of bulk) / TOP.

## H3 — Buyer order + Convert (Step 11–12 ki jagah) · login: `saurav`
**Step 11a · Buyer Order banao (optional, par Japanese buyers ke multi-style PO ke liye sahi):** sidebar **Buyer Orders & Shipping** → **New Buyer Order** → buyer, **PO / purchase-note no**, date, season (AW-26), currency USD, exchange rate, payment terms (LC at sight…), incoterm, **latest shipment**, delivery date, sales month → Create. Baad mein **Edit header** + reason = header revision (Rev 1, 2…).
**Step 12 · Convert to Order (naya form):**
- **Buyer order** dropdown se PO choose karo (PO no, currency, terms, dates apne aap bhar jaate hain) ya "None".
- **Currency / Unit price / First quoted price / Exchange rate** — USD mein daalo, ₹ FOB apne aap (`rates.view` flag wale hi dekh sakte hain).
- **Ship date (contracted)**, **Buyer target (latest shipment)**, **Delivery date**, **Sales month**.
- **Colour-wise quantity:** cutting extra % → **Size set** choose karo (ya custom sizes comma se) → **Add colour** → colour code (B-01), colour name, har size ki qty (JAN barcode bhi cell ke neeche daal sakte ho — Revise dialog mein) → total aur cut qty khud. Colour rows na daalo to purana "total qty + size %" chalta hai.
Order page pe ab: **Colour × Size Breakdown** card (code, colour, sizes, qty, cut), Order Value tile USD + ₹, buyer target / delivery / sales month, **Order Revisions** card.
**Step 12a · Revise (jab buyer PN revise kare):** order page → **Revise** → grid / price / dates / cancelled qty badlo → **reason** likho → Save revision → Rev 1, 2… history + activity; production ka planned qty apne aap. Sirf note / instruction badalna revision nahi hai.

## H4 — Material (Step 13–17 ke saath) · login: `saurav` (BOM), `meena` (material, gate)
**Material master (Step 6 mein):** **Item type** (client ki 47-item list — Main fabric FAB-A, Lining, Sewing thread, Main label, Zipper, Poly bag, Carton…), **Supplier MOQ**, **Lead time**.
**BOM (Step 13):** har line ke neeche extra row — **Part** (FAB-A/B/C), **Colour** (blank = sab colours; ya order ka colour code / naam), **MOQ**, **Required by**, **Per size** (S 1.1, M 1.2… — per pc ko override). Order page ka requirement ab **cutting qty** pe, colour aur size-wise; **To order = max(shortage, MOQ)** (Planning page pe "order 25,000 (MOQ …)" dikhega). Planning page ko order page se kholo to order ka colour grid use hota hai.
**Gate Entry (Step 17) — fabric:** **Fabric lots** section → **Add lot** → lot no, colour, thans, on-tag length / actual length, on-tag width / actual width, GSM → received qty = Σ actual (short on tag alag dikhta hai).
**Order page → Fabric WIP — Dyeing Lots:** har fabric line: required → ordered (PO) → received (lot-wise, row pe click karke lots dekho) → rejected / hold (4-point fail) → balance.

## H5 — Production (Step 21–22 ke saath) · login: `amit`
Production Floor pe 4 tabs: **Floor board · Cutting report · Stitching WIP · Loading plan**.
**Cutting report (AFN/11):** **Cutting report** button → order, colour, fabric (stock se) + lot no, thans, width, layers, fabric issued / **consumed** (m), end bits, **size-wise cut pcs**, table, cutter → Save → `CUT-0001`; Cutting stage apne aap +pcs, fabric stock se issue (ledger `issue_prod`), avg m/pc. **Print AFN/11**.
**Log Production:** naye fields — **Colour**, **Loaded on line** (Stitching input), **Hourly output** grid (09-10, 10-11… — bharo to output khud jud jata hai).
**Stitching WIP (AFN/14):** order × colour: cut · loaded · output · rejected · **WIP on line** (loaded − output) · **cutting in stock** (cut − loaded) · balance · lines. "As on" date + **Print**.
**Loading plan:** 7 din × lines ka grid → cell pe click → order, colour, process, **target** → actual us din ke logs se (67% jaisa). **Print**.

## H6 — Quality (Step 23–25 ke saath) · login: `amit`
**Fabric 4-point (AFN/10):** naye fields — thans, on-tag length, on-tag width, check-in date, **points per 100 sq m ya sq yd**; buckets 0–3" = 1 pt, 3–6" = 2, 6–9" = 3, >9" / hole = 4.
**Mid / Final AQL (AFN/21):** PO qty, PO date, already shipped, reference no; list mein **found / allowed** (majors vs Ac).
**Measurement tab (AFN/22):** **Measurement inspection** → order, stage (Inline / Pre-final / Final), **size**, colour → POM table apne aap (spec + tolerance) → 5 pieces ke values → red = out → **Save** → MI-0001 Pass / Fail → **Print**. (POM spec H2 mein pehle banana zaroori.)
**Needle & blade tab:** **Record** (AFN/17) → line, machine, operator, needle type / size, **parts recovered** (point / shank / eye / middle), detector check, new issued — koi part missing = red warning. **Entry** (AFN/13) → kind (cutting blade, band knife…), received / issued / broken / returned → running **balance** (store se zyada issue nahi hota). Dono ka **Print**.

## H7 — Invoice, packing list, carton marks (Step 26–27 ki jagah) · login: `sunita`
**Create Export Invoice (naya):** **Buyer** choose karo → uske open style lines list mein → **tick** karo jo is shipment mein ja rahi hain → **Ship qty** (default balance; partial allowed), **unit price** (USD, order se), **HS code** → neeche total USD, ₹ (exchange rate), IGST, grand total. Baaki: ports, **final destination**, incoterm (FOB / CFR / CIF / CPT / DAP / DDP / EXW), pre-carriage, place of receipt, payment method, **L/C no + date**, exchange rate, **IGST %**, cartons, weights, transporter, **consignee** (blank = buyer ka legal name), notify party, reverse charge → Generate Invoice. Ek invoice = ek buyer; dusre buyer ka order tick nahi hoga.
**Invoice ke andar:** **Invoice lines** table (USD / ₹ / IGST / amount in words) · **Box-wise packing**: pcs/ctn, gross, net, dims bharo → **Auto boxes** (order ke colour × size grid se solid-colour-solid-size cartons, partial qty scale hoke) ya **Add row** haath se → **Save packing** → cartons / weights apne aap. **Carton marks** button = har carton ka label (buyer, PO, style, colour, size × qty, C/No, weight, **barcode** — order grid mein JAN dala ho to wahi, warna style-colour-size).
**Documents:** Commercial Invoice ab multi-line hai (HS code, USD rate / amount, ₹ amount, IGST, grand total, words dono currency mein, buyer's order no, consignee, notify, pre-carriage, place of receipt, final destination, L/C, exchange rate, reverse charge, AD code, Format No.). Packing List = box matrix (carton no × style × colour code × size × pcs, gross / net, dims, totals, shipping marks).
**Shipped on board** → sab line orders Dispatch stage.
**Buyer Orders & Shipping → Shipping track** tab: har line — order qty, contracted vs target date, **Ship 1 … 6** (qty + invoice no + AWB), shipped, cancelled, balance (+ value), on time / late. Buyer order detail pe bhi yahi lines + totals.
**Partial shipment:** dusri baar Create Invoice → wahi line tick → qty default = balance. Short-ship / cancel ho to order **Revise** → cancelled qty.

## Ek line mein naya flow

Settings (AD code, size sets, currency / FX / IGST, format nos) → Sample → **POM / Measure / Approvals / Tech pack** → **Buyer Order** → **Convert (USD price, colour × size grid)** → BOM (part / colour / per-size / MOQ) → PO → **Gate (fabric lots)** → **Cutting report** → Log (loaded, hourly) → **Stitching WIP / Loading plan** → Quality (4-point yd, **Measurement**, **Needle / blade**, AQL) → **Invoice (multi-line, USD + ₹ + IGST)** → **Boxes → Packing list / Carton marks** → Shipped → **Shipping track** → Payment → Close.
