# Afion International ERP — Phases 0 – 7 (complete)

Monorepo: `frontend/` (React + Vite + TS + Tailwind + shadcn-style UI, Mingcute Fill icons)
and `backend/` (Node + Express + MongoDB, NestJS-style module structure & logging).

## Phase 0 — Foundation (done)
- **Auth** — login (User ID + password), JWT access (15 min) + refresh rotation (7 d),
  up to 5 signed-in devices per user, lockout after 5 failed attempts, change password, logout.
- **Users & Roles** — add/edit/disable users, 8 role templates, per-user module access (17 modules),
  **confidential-access flags** (buyer identity, vendor identity, rates, financial reports, PO approval).
- **RBAC everywhere** — sidebar and routes show only ticked modules; API guards every route and flag.
- **Audit log**, **file service** (upload/stream, 25 MB, PDF/DOC/XLS/images/DXF/PLT), NestJS-style logging.

## Phase 1 — Core Trade (done)
| Page | What it does |
|---|---|
| **Buyers** | Buyer master. Without the `buyer.confidential` flag users see only the alias (`B-06 · Germany`). |
| **Vendors & Suppliers** | Job-work vendors by process (masked without `vendor.confidential`) + material suppliers. |
| **Sample Development** | Sample request with **one photo card per piece** (live preview, fabric / colour / sizes / qty per piece — the sample's fabric, colour and piece count are derived from them), the buyer's **spec sheet or tech pack uploaded on the form** (becomes version 1), **courier details** (method, AWB, receiver) and **admin-defined extra fields** (Settings → Sample Request Form: text, long text, number, date, dropdown, yes/no, required flag). Then mark sent (courier + AWB) → buyer feedback (approved / changes → next round / rejected) → **specification sheet** (generated on the letterhead with the piece photos and extra fields, or buyer's PDF, versioned) → **Convert to Order**. |
| **Orders** | List + order detail with the 12-gate **Control Tower**, size grid, source sample & spec, activity. |
| **Material Planning** | BOM per style (versioned) and live requirement: `required = ceil(perPc × qty × (1 + waste%))`. |
| **Settings** | Tabbed: Company (profile, letterhead, numbering) · Stores & Procurement · Production · TNA / Quality / Alerts · Export & Portal · **Form Fields** — every form's built-in inputs are listed and can be renamed, given a placeholder or help text, made required, or hidden (fields the system needs stay locked); the admin also adds, edits, reorders and deletes extra inputs in 18 types (short/long text, number, amount, percent, date, date-time, time, dropdown, choice buttons, multi-select, yes/no, rating, e-mail, phone, web link, colour, file upload) on any of the 17 forms in the system (samples, orders, buyers, patterns, materials, POs, gate entry, suppliers, vendors, job work, production log, the three quality inspections, export invoice, compliance, users). Every dialog shows them in an “Additional details” block, the server validates values against the definitions, and stored values survive when a field is removed. |

## Phase 2 — Material Truth (done)
| Page | What it does |
|---|---|
| **Stock & Inventory** | Physical · reserved · **free = physical − reserved** · **on order** (Σ open PO remaining, *not* in stock). Balances change only through the **append-only stock ledger** (gate receipts, reservations, audited adjustments with a mandatory reason). Per-material **movement ledger** dialog. |
| **Purchase Orders** | One material per PO: ordered / received / remaining, receiving history (every installment = a GRN), supplier **rate history**, In Transit, cancel. **Approval flow**: POs above the limit in Settings wait for a user with the `po.approve` flag. **One-click POs** from a plan or an order's shortage lines, grouped by the material's supplier. |
| **Gate Entry** | The only path by which stock increases. Awaiting-verification table, gate form (vehicle, driver, challan, invoice, inspection, store location, photo), **live math** `total = previous + current`, `remaining = ordered − total`, and the hard block **`current ≤ remaining`** (also enforced server-side, atomically, and idempotent on a client UUID). Confirm = GRN + PO received/remaining/status + ledger row + order activity in one go. Gate register below. **Simple screen** (large controls) is the default for the Gate Man role. |
| **Accessories** | Accessory stock (free / reserved / on order) and **requirement by open order** from the BOM: Available · On Order · Not Ordered, with per-line detail and Raise POs. |
| **Order detail** | **Order Stock** table: required · reserved for this order · free · on order · shortage · to order · status; **Reserve Free Stock / Release**; **Raise N POs**; POs for the order; **Material Movement** timeline from the ledger. Control Tower gates 4 (Material) and 5 (Procurement) are now derived from reservations and POs. |

Rules (SRS Part 9), all server-side: `available = reservedForOrder + free`, `shortage = max(required − available, 0)`,
`toOrder = max(shortage − onOrder, 0)`, `PO remaining = ordered − Σ receipts`, `receipt ≤ remaining`.

## Phase 3 — Outside & Floor (done)
| Page | What it does |
|---|---|
| **Job Work** | GST non-sale challans (`JW-####`) per order, process and vendor; **Other** = free-text process. A stock material issued leaves physical stock (and the order's reservation) on the ledger; panels / garments are tracked by quantity. **Location engine**, never stored: 0 back = `OUTSOURCED`, some back = `PARTIALLY IN-HOUSE` (*8,000 in-house / 4,000 at V-05*), all back = `IN-HOUSE`. `Vendor pending = sent − Σ returns`; returns come **only through Gate Entry**, over-return blocked server-side. Return history with running balance, printable challan, cancel (ledger reversal), vendor on-time % recomputed from history. Vendor identity masked without `vendor.confidential`. |
| **Gate Entry** | Now receives job-work returns too: same GRN series, labels switch to Sent / Previously Returned / Current Return / With Vendor, location after the entry shown live. A return for Cutting / Stitching / Finishing auto-appends a production log and advances the operation. |
| **Production Floor** | Four operations per open order (Cutting, Stitching, Finishing, Packing), each **In-house** (line) or **Outsourced** (vendor). Kanban with planned / done / pending and current location, operation register, line-wise table (efficiency = output ÷ daily target from Settings), daily log dialog, plan dialog (execution type, vendor/line, planned qty, block with reason). Order progress = Σ done ÷ Σ planned; the stage only moves forward. |
| **Packing & Cartons** | Packing material check: required = BOM packing lines × quantity still to pack; negative balance = **Reorder Now** and **Packing = Blocked** on the Control Tower. Carton plan per order (pack ratio, pcs per carton, cartons), printable packing list. |
| **Order detail** | Production Operations and Job Work cards; Control Tower gates 6 (Job Work), 7 (Production) and 9 (Packing) are derived. |
| **Stock** | **At Vendor** column (Σ pending on open challans that carry a material code). |

Role note: the Production Manager template now includes Packing.

## Phase 4 — Client's new modules (done)
| Page | What it does |
|---|---|
| **TNA — Time & Action** | **Templates** (19 standard activities with offsets from the order date or ex-factory; per buyer / product type; one default) generate **tasks per order** with owner, department, planned dates and priority. **Actuals auto-fill** from module events: order confirmation, spec sheet, PP sample, pattern approval, fabric PO, fabric / trims in-house (gate), cutting / stitching / finishing / packing start and complete (production logs and gate returns), final inspection (AQL). RAG from the dates (amber window in Settings); order health = worst open task. **Replan** = change a date or priority with a mandatory reason, kept forever and flagged ↻. Views: **buyer board** (buyers → orders → stage grid with sample photo, live stage state, stage click → page), **order live page** (`/tna/order/:id`: photos, pipeline, gates, briefs, full plan — no popup), tasks, week/month calendar, order tab. Every order number in the software shows a **hover card** (sample photo · style · buyer · qty · stage). |
| **Patterns** | `PT-####` per style: maker, base size, range, grading, marker efficiency, linked sample round. **Versioned files** (DXF / PLT / PDF / images with change notes), Draft → In Review → Approved → Superseded (a new approval supersedes the old one). Approval needs the `pattern.approve` flag and completes the TNA “pattern approval” task. **Issue log**: who took which version to cutting for which order. |
| **Quality** | **Fabric 4-point** (client format AFN/10: points × 3937 ÷ (metres × width″), 20 pts/100 sq m accepted) — a failed lot goes on **quality hold** and leaves free stock until released with a reason. **Inline / end-line** per line per day with the defect master and auto DHU. **Mid / Final AQL** (format AFN/21: sample size and Ac/Re from the AQL 2.5 / 4.0 table, general checking, hold reason, report upload) — a failed or held Final **blocks dispatch** (Control Tower gate 8); a passed Final completes the TNA task. **Rejection analysis** by type / line / order / vendor. |
| **Alert Center** | Computed only — never typed: material shortage, PO overdue / partial / awaiting approval, gate due, job-work overdue, TNA amber / red, quality fail / DHU / hold ageing, production blocked, packing blocked, sample waiting on buyer, pattern review / overdue. Each alert deep-links to its record, is assigned by role or ownership, **auto-resolves** when the condition clears, and red alerts unacknowledged past the limit **escalate to admin**. Bell with live count, per-module alert strips, admin “everyone's alerts”. Re-evaluated every 10 minutes and on demand. |
| **My Work** | Per-user queue across modules: TNA tasks, alerts, PO / pattern approvals, final inspections due — ordered Urgent → overdue → today → this week, with inline complete / replan / acknowledge. Sidebar badge. Admin **workload heatmap**. |
| **Settings** | TNA amber window and auto-apply, DHU limit, fabric points limit, AQL level, sample-wait days, escalation hours, defect master. |

New module keys `tna`, `pattern`, `quality` (Merchandising Head: tna + pattern · Production Manager: quality + tna · Sampling Incharge: pattern). My Work and Alert Center are available to every signed-in user.

### TNA pipeline is configurable
The stages every order moves through (default Samples → Materials → Cutting → Stitching → Finishing → Packing → Inspection → Dispatch → Payment) are defined under **TNA → Stages** (Admin or the `tna.edit` flag). Rename, reorder, add, remove and mark each stage **shown / hidden on the buyer portal**. Renaming carries the stage's tasks and template activities along; removing a stage asks where its activities should go. The Buyer Board draws each live order as a numbered left-to-right **pipeline** (done stages ticked, the current stage tagged "now", overdue / due-soon rings), the order page shows the same strip, and the portal shows only the buyer-visible stages. API: `GET /tna/stages`, `PUT /tna/stages {stages, renames, moves}`.

## Phase 5 — Outward & Money (done)
| Page | What it does |
|---|---|
| **Dispatch & Export Documents** | Export invoice per shipment (`AFI/EXP/FY/####`) with mode, ports, incoterm, cartons, weights, value (rates-gated). **Server-generated documents** printed from the app — commercial invoice, packing list, delivery challan, certificate of origin (draft), e-way bill data sheet — plus uploads and reference numbers for the carrier document (B/L or AWB) and authority-issued numbers. **Document checklist** and **Air / Sea tracking timeline** (stuffing → customs → on board → transit → delivered); status is derived. Shipping on board marks the TNA ex-factory / dispatch tasks and moves the order to Dispatch. **A failed or held final AQL blocks invoice creation.** |
| **Payments (LC / T-T)** | One tracker per invoice, opened automatically. `pending = invoice − Σ receipts`; receipts carry FX rate, bank, BRC / FIRC reference and charges; over-receipt is blocked. **LC milestones** (received → amendment → shipped & docs → negotiated → credited) and T/T milestones; realisation days; receipts-by-method; a fully realised invoice completes the TNA payment task and moves the order to Payment. Amounts need `rates.view` or `reports.financial`. |
| **Compliance** | Repository with categories (company licences, insurance, certifications, buyer audits, bank / IEC / GST, **formats & templates**, other): authority, number, issue and expiry dates, responsible user, versioned files, confidential flag (`compliance.confidential` to see, `compliance.manage` to add / renew). **Reminder engine**: alerts at 60 / 30 / 15 / 7 / 1 days (Settings) to the owner and compliance managers, repeating until renewed (new version with a new expiry) or **dismissed with a reason** for a period; every reminder is recorded on the document. Dashboard (expired / expiring / renewal in progress) and a printable **expiry register**. In-app only — email / WhatsApp delivery is not configured. |
| **Reports & Analytics** | KPIs (on-time delivery, capacity, fabric wastage, gross margin), dispatch vs realisation trend, buyer-wise value, process-cost donut, and **11 runnable reports** (order status, material consumption vs standard, job-work pending, production efficiency & DHU, stock ageing & reorder, export realisation, buyer profitability, TNA delay, quality / DHU trend, compliance expiry register, priority ageing) with **CSV (Excel) export and print-to-PDF**. Financial reports need `reports.financial`. |
| **Order detail** | Dispatch and Payment cards; Control Tower gates 10 (Dispatch) and 11 (Payment) are derived — all 12 gates are live. |

New module key `compliance` (Accounts template). Alert rules added: compliance expiry, payment overdue, shipment documents pending near the ship date.

## Phase 6 — Buyer Tracking Portal (done)
| Where | What it does |
|---|---|
| **Order detail → Buyer Tracking Link** | Anyone with the `orders` module issues a **tracking code** (`AB7K-93XQ`, no 0/O/1/I) for the order — optional 4–6 digit **PIN**, validity in days (default from Settings), copy / open / **revoke** (stops working immediately), view count, last opened, and the **access log** (time, IP, browser, refused attempts). Sharing is written to the order's activity and the audit log. |
| **Buyers → Portal** (`buyer.confidential`) | One **buyer-wise master link** that lists every live order of that buyer; the switch on the buyer turns master links off (order-wise links still work). |
| **`/track/CODE`** (public, no login) | Mobile-first Afion-branded page: buyer PO no + style, description, colour, quantity, ship date, order stage and health, **% complete**, the **stage board** (Samples → Dispatch: planned vs actual, completed / in progress / delayed), the **shipment card** once on board (mode, ports, vessel or flight, B/L or AWB number, ETA, milestones) and the merchandiser's contact. Wrong PIN → prompt; revoked / expired → clear message. |

The public API (`GET /public/track/:token`, PIN via `x-pin` header or `?pin=`) is **rate-limited (120 / 15 min per IP)** and returns a **field whitelist** built server-side — prices, rates, vendors, suppliers, stock, payments, remarks and the buyer's legal identity are never in the payload (the e2e suite asserts this). The style image is served only through the token (`/public/track/:token/image`). Settings: **Buyer portal base URL** (links become `<base>/track/CODE`; empty = first CORS origin) and **link validity (days)**.

## Phase 7 — Hardening & go-live (done)
- **Security** — Mongo operator-injection guard on body / query / params (`$`-keys and dotted keys dropped, operator objects removed); login brute-force limit (30 / 15 min in production); server **refuses to start in production with placeholder JWT secrets**; helmet, CORS allow-list, refresh-token rotation with 5-device cap were already in place. New flag `tna.edit` (FR-17.2): replanning TNA dates / priorities needs the TNA module or this flag.
- **Performance** — compound indexes on the hot list / filter paths (orders by status + ship date, buyer + status, stage; POs by status and supplier; job work by status and vendor; samples; dispatch; payments due; compliance expiry; patterns; gate register; production logs; AQL by order + stage; materials by category).
- **Backup & restore** — `npm run backup` writes every collection as JSON plus the `uploads/` folder to `backups/<timestamp>/`; `npm run restore -- --dir backups/<timestamp> --yes` puts it back (refuses without `--yes`). No `mongodump` needed.
- **Clean slate** — `npm run reset -- --yes` wipes all working data but keeps the Admin user, Settings and the default TNA template (run `npm run backup` first); `npm run seed:users` recreates the seven team logins with their roles and flags, `npm run seed:vendors` the suppliers and job-work vendors, `npm run seed:materials` the 14 materials with opening stock (Step 7); `test-data.md` has realistic values to enter step by step.
- **Data migration** — `npm run import -- materials file.csv` (also `suppliers`, `vendors`, `buyers`); `npm run import -- --columns` prints the accepted headers. Existing records are updated by code / name / brand; a material's `openingQty` posts an opening ledger row.
- **Single-origin deployment** — `SERVE_FRONTEND=true` makes the API serve `frontend/dist` (with SPA fallback, so `/track/CODE` works) on one port behind your reverse proxy.
- **End-to-end tests** — `npm run test:e2e` boots an in-memory MongoDB, seeds it, starts the API on port 5099 and runs the six smoke suites in `backend/test/` (≈ 330 checks across P2–P7: stock ledger rules, gate gates, job work, production, packing, TNA, patterns, quality, alerts, my work, dispatch, payments, compliance, reports, portal, hardening). Needs Python 3 on PATH (standard library only).

## Phase 8 — Client document formats (done)
Built from the client's real working documents (purchase notes, sample status sheets, POM spec sheets, BOM / material requirement sheets, AFN/10-11-13-14-17-19-21-22-40 formats, invoices, packing lists, shipping tracker):
- **Buyer orders** — `/buyer-orders`: the buyer's purchase note as a header (PO no, date, season, currency, exchange rate, terms, incoterm, latest shipment, delivery date, sales month, revisions) with many style lines (each line = an AFI order). **Shipping track** tab: ship-1 … n per line with invoice / AWB, shipped, cancelled, balance, on-time.
- **Orders** — colour × size matrix with buyer colour codes and JAN barcodes, configurable **size sets** (Settings), cut qty = qty + extra %, **USD pricing** (unit price, first vs final price, exchange rate → ₹ FOB derived; users without `rates.view` see no price), buyer target / delivery date / sales month, **revisions** with reason + change log (planned production qty follows), cancelled / short-shipped qty, partial shipments.
- **Sampling** — 10 sample kinds; per style **POM measurement spec** (size-wise + tolerance, auto-grade), per round **measurements vs spec + buyer instruction** (printable comment sheet), **approvals board** (lab dip, strike-offs, shade band, trim card, FPT / GPT, sample kinds — due / received / submitted / AWB / approved / comments; Approved fires the TNA activity), **tech pack** (composition, lining, article, construction, label placement, packing method, accessory list) printed on the spec sheet. The TNA template gained fit-sample, size-set, lab-dip, strike-off, trim-card and TOP activities (25).
- **Materials** — material **item type** (the client's 47-category list), MOQ, lead days; BOM lines with part (FAB-A/B/C), colour, per-size consumption, MOQ, required-by date; requirement on the cutting qty, colour- and size-wise; to-order = max(shortage, MOQ). Gate entry **fabric lots** (lot no, thans, on-tag vs actual length / width, GSM). Order page **Fabric WIP** (dyeing lots per fabric line).
- **Floor** — **daily cutting report** (AFN/11 → Cutting log + fabric issue from stock), production log with colour / loaded / hourly grid, **Stitching WIP** (AFN/14), **loading plan** (date × line, target vs actual).
- **Quality** — 4-point with on-tag vs actual, thans, points per 100 sq m or sq yd; **measurement inspection** (AFN/22, 5 pcs vs POM ± tolerance); **broken needle** (AFN/17) and **blade** (AFN/13) registers; final AQL with PO qty / date, shipped qty, ref no, found vs allowed.
- **Export** — **multi-line commercial invoice** (many style lines of one buyer, HS code, USD price / amount, INR taxable at the exchange rate, IGST %, totals, amount in words in both currencies, buyer's order no, consignee, notify party, pre-carriage, place of receipt, final destination, L/C no + date, reverse charge, AD code; incoterms + CFR / CPT / DAP / DDP), **box-wise packing list** (carton × style × colour code × size × pcs, gross / net, dims — auto from the colour grid or by hand), **carton marks** with Code 128 / JAN barcodes, **format numbers** on every printed document (Settings → Export).
- Tests: `test/smoke_p8_gaps.py` (≈ 95 checks) — nine suites, ≈ 550 checks in total. `KEEP=1 npm run test:e2e` keeps the seeded test API alive for browser checks.

### Go-live checklist
1. **MongoDB Atlas** — create the production cluster, add the office / server public IP under *Network Access*, put the URI in `backend/.env`.
2. **Secrets** — set long random `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`, `NODE_ENV=production`, `CORS_ORIGINS=https://erp.<your-domain>`, `SERVE_FRONTEND=true`.
3. **Build & run** — `cd frontend && npm run build`, then `cd backend && npm start` (use pm2 / a Windows service to keep it up); put nginx / IIS with HTTPS in front.
4. **Masters** — `npm run import -- buyers|suppliers|vendors|materials <csv>`; create the real users in *Users* (start from the role templates, tick flags per person); set *Settings* (company profile, letterhead, IEC / GSTIN, PO approval limit, godowns, lines, portal base URL).
5. **Do not seed production** — `npm run seed` is for demo data only.
6. **Backups** — schedule `npm run backup` nightly (Task Scheduler / cron) and copy `backups/` off the server; test `npm run restore` once on a staging DB.
7. **UAT** — walk each role through its screens with the quick guide below, then switch the team over.

### Per-role quick guide
| Role | Daily screens |
|---|---|
| Merchandising Head | My Work → TNA board (replan with a reason) → Samples (POM, measurements, approvals, tech pack) / Buyer Orders / Orders (colour grid, revisions, Control Tower, buyer tracking link) → Patterns → Reports |
| Store Manager | Stock (ledger, adjustments with reason) → Purchase Orders (raise from shortages) → Accessories → Gate Entry |
| Gate Man | Gate Entry only (simple screen): pick the PO / challan, enter the quantity, confirm |
| Production Manager | Production board (cutting report, stitching WIP, loading plan) → Job Work challans → Packing plan → Quality (fabric 4-point, inline DHU, AQL, measurement, needle / blade) → TNA |
| Accounts | Dispatch (multi-line invoice, box-wise packing, carton marks, tracking) → Buyer Orders → Shipping track → Payments (receipts, LC milestones) → Compliance (renewals) → Reports |
| Sampling Incharge | Samples (rounds, spec sheets) → Patterns |
| Admin | Users & roles, Settings, Alert Center (all), audit log |

## Run it (two terminals)

```bash
# 1 — backend
cd backend
npm install
# edit .env → set MONGODB_URI to your MongoDB/Atlas connection string
npm run seed        # demo data: team, masters, styles + BOM, samples, order AFI-1043 with POs / job work / TNA / QC / invoice, tracking code DEMO-2451
npm run dev         # http://localhost:5000  (health: /api/v1/health)
npm run test:e2e    # optional: in-memory Mongo + seed + ~330 API checks (needs python 3)

# 2 — frontend
cd frontend
npm install
npm run dev         # http://localhost:5173
```

Log in with **vikram / Afion@123** (admin). All seeded users share that password.
Try **meena** (Store Manager — stock, PO, accessories, gate; cannot approve big POs), **ravi.gate** (Gate Man —
simplified gate screen only), **neha** (Sampling Incharge — buyers masked) or **saurav** (Merchandising Head — full buyer identity + rates).

> `.env` ships with **dummy credentials** for the JWT secrets. Replace `JWT_ACCESS_SECRET`,
> `JWT_REFRESH_SECRET` before any real use. Without a reachable MongoDB the API still boots —
> calls return a clear `503 Database is not reachable` and keep retrying the connection.

## Structure
```
frontend/src
├── app/          # shell: layout (sidebar/topbar), nav map (module + phase per item)
├── components/   # ui/ shadcn-style primitives · shared.tsx (PageHeader, KpiTile, Toolbar, Field…)
├── features/     # ONE FOLDER PER MODULE — auth, dashboard, users, buyers, vendors, stock,
│                 #   samples, orders, planning, settings, po, gate, accessory, jobwork, production, packing,
│                 #   tna, pattern, quality, alerts, mywork, dispatch, payments, compliance, reports, portal
├── icons/        # generated Mingcute Fill set (scripts/gen-icons.mjs)
├── lib/          # axios client (deduped silent refresh), crud hooks, formatters
└── styles/       # brand tokens (light + dark) mapped to shadcn variables

backend/src
├── config/       # env, db (retry + fail-fast)
├── common/       # logger, middleware (auth, rbac, flags, request-logger, errors),
│                 #   utils (crud factory, crud-routes, counters, mask)
├── modules/      # ONE FOLDER PER MODULE — auth, users, audit, files, settings, buyers, vendors,
│                 #   suppliers, materials, styles, bom, samples, orders, stock, po, gate, accessory,
│                 #   jobwork, production, packing, tna, pattern, quality, alerts, mywork,
│                 #   dispatch, payments, compliance, reports, portal
└── seed/         # demo data seeder (idempotent)
backend/scripts   # backup.js · restore.js · import-masters.js
backend/test      # run.js (e2e harness) · smoke_p2…p6.py
```

## API quick reference (all under `/api/v1`)
```
POST /auth/login {uid,password} · POST /auth/refresh · POST /auth/logout {refreshToken?} · GET /auth/me
GET|POST /users · PATCH /users/:id · POST /users/:id/toggle-status · GET /users/meta · GET /audit
POST /files/upload (multipart "file") · GET /files/:id[?download=1] · GET /files/:id/meta
GET|PUT /settings/company                       (poApprovalLimit, godowns, company profile)
GET|POST /buyers · /vendors · /suppliers · /materials · /styles  (+ PATCH /:id, POST /:id/toggle)
GET /bom/:styleId · PUT /bom/:styleId {lines} · POST /bom/calc {styleId, qty}
GET|POST /samples · POST /samples/:id/round · POST /samples/:id/spec · POST /samples/:id/convert
GET /orders · GET /orders/:id → {order, tower, material, pos, movements, shipping, buyerOrder} · PATCH /orders/:id (colours / sizeSet / unitPrice / fxRate / dates / cancelledQty + revisionReason → revision) · GET /orders/meta (size sets, currencies) · GET /orders/shipping-track · GET /orders/:id/fabric-wip
GET|POST /buyer-orders · GET /buyer-orders/:id/detail · PATCH /buyer-orders/:id
PUT /styles/:id/pom · PUT /styles/:id/techpack · GET|PUT /styles/:id/approvals · PUT /samples/:id/measurements · GET /materials/meta (item types)
POST /orders/:id/activity · POST /orders/:id/close · POST /orders/:id/reserve · POST /orders/:id/release
GET /stock/summary · GET /stock/ledger?materialId=|orderId= · POST /stock/adjust {materialId, qty, reason}
GET /po · GET /po/:id · POST /po · PATCH /po/:id (eta, notes, priority, In Transit) · POST /po/:id/approve (po.approve)
POST /po/:id/cancel · POST /po/from-plan {styleId, qty | orderId} · GET /po/summary · GET /po/rate-history?materialId=
GET /gate/pending · GET /gate (register) · GET /gate/summary · POST /gate {clientUuid, kind:'po', refId, receivedQty, …}
GET /accessories/overview
GET /jobwork · GET /jobwork/:id · POST /jobwork/issue · PATCH /jobwork/:id · POST /jobwork/:id/cancel
GET /jobwork/summary · GET /jobwork/:id/challan-data · GET /jobwork/meta
POST /gate {kind:'jw', refId: <challan id>, receivedQty, …}         (job-work return)
GET /production/board · GET /production/logs · POST /production/logs (colour, loaded, hourly) · PATCH /production/ops/:id · GET|POST /production/cutting · GET /production/wip · GET|POST|DELETE /production/loading-plan
GET /packing/overview · PUT /packing/plan/:orderId · GET /packing/list-data/:orderId
GET /tna/tasks?mine=1|orderId=|open=1|rag= · PATCH /tna/tasks/:id {dates, priority, ownerUid, reason} · POST /tna/tasks/:id/complete|reopen
GET /tna/orders/:orderId · POST /tna/orders/:orderId/apply {templateId?, force?} · GET /tna/board · GET /tna/summary · GET|POST|PATCH /tna/templates
GET|POST /patterns · PATCH /patterns/:id · POST /patterns/:id/version|submit|approve|reject|issue · GET /patterns/summary
GET /quality/meta · GET /quality/summary · GET /quality/rejections · GET /quality/aql/plan?lotSize=
GET|POST /quality/fabric · POST /quality/fabric/:id/release · GET|POST /quality/inline · GET|POST /quality/aql · GET|POST /quality/measurements · GET|POST /quality/needles · GET|POST /quality/blades
GET /alerts[?module=&all=1] · GET /alerts/summary · POST /alerts/:id/ack · POST /alerts/recompute (admin)
GET /mywork · GET /mywork/count · GET /mywork/all (admin)
GET|POST /dispatch · GET /dispatch/:id · PATCH /dispatch/:id · GET /dispatch/:id/doc-data/:type · POST /dispatch/:id/docs/:type/generate|upload|number · POST /dispatch/:id/track · PUT /dispatch/:id/boxes · POST /dispatch/:id/boxes/auto · GET /dispatch/summary
GET /payments · PATCH /payments/:id · POST /payments/:id/receipt · POST /payments/:id/milestone · GET /payments/summary
GET|POST /compliance · PATCH /compliance/:id · POST /compliance/:id/version|dismiss · GET /compliance/summary · GET /compliance/register
GET /reports/register · GET /reports/run/:key · GET /reports/kpis · GET /reports/trend · GET /reports/buyers · GET /reports/process-cost
GET /tracking?orderId=|buyerId= · POST /tracking {kind:'order'|'buyer', orderId|buyerId, pin?, expiresInDays?, label?} · POST /tracking/:id/revoke
GET /public/track/:token [x-pin] · GET /public/track/:token/image[?order=]        (no auth, rate-limited, field-whitelisted)
```
Confidential fields (buyer/vendor identity, rates, PO values) are stripped server-side, never just hidden in the UI.

All eight SRS phases (P0–P7) are implemented. Reminders and portal links are in-app / URL only — e-mail or WhatsApp delivery is not configured (add an SMTP or WhatsApp provider in a follow-up if needed).
