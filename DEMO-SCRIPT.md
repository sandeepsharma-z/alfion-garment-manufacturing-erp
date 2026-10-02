# Afion ERP — Client Demo Script (full chain, ≈ 85 min)

Ek hi order ki kahani, shuru se end tak: **sample → spec → buyer order → BOM → PO → gate → fabric check → cutting → stitching (line + vendor) → finishing → packing → AQL → invoice → shipment → payment → close.**
Har step pe: **Kya hai** (client ko 1 line) · **Kahan** · **Kya bharna** · **Kya hota hai**.

Demo order: **AF-3001 Men Polo T-Shirt · Zara D · 3,000 pcs** (Navy 1,800 + White 1,200). Sab kuch `vikram` (Admin) se karo; password `Afion@123`.

## Demo se pehle (5 min)
- Backend + frontend chal rahe hon, browser `Ctrl+Shift+R`.
- Ek polo/t-shirt ki photo desktop pe.
- Settings → Company: GSTIN / IEC / AD code bhare hon (invoice pe chhapta hai). Settings → Production: lines (Line 1–5, Cutting Table 1–2, Packing Hall) already hain.
- Phone / doosra tab: `ravi.gate` login (Gate Man simple screen dikhane ke liye).

---

## 1 · Dashboard (1 min)
**Kya hai:** ghar — orders, floor, material, paisa ek screen pe, har minute refresh.
Dikhao: hero stats · 14-day production chart · Shipping next · Needs your attention · Reports cards. Kuch bharna nahi.

## 2 · Stock & Inventory → Add Material (3 min)
**Kya hai:** material master — har fabric / trim / packing item ka code, unit, rate, reorder level, supplier. Stock sirf Gate se badhta hai.
Do fabrics banao (polo ke liye):

| Field | Fabric 1 | Fabric 2 |
|---|---|---|
| Code | FAB-0190 | FAB-0191 |
| Material Name | Cotton Pique 220 gsm Navy | Cotton Pique 220 gsm White |
| Category / Item type | Fabric / Main fabric (FAB-A) | Fabric / Main fabric (FAB-A) |
| UOM | mtr | mtr |
| Rate (₹) | 210 | 205 |
| Reorder level | 500 | 500 |
| MOQ / Lead days | 500 / 7 | 500 / 7 |
| Godown | Rack A | Rack A |
| Supplier | Vardhman Textiles | Vardhman Textiles |
| Spec | 220 gsm, 72" tubular | 220 gsm, 72" tubular |
| Opening qty | 0 | 0 |

> "Free = physical − reserved. Stock kabhi haath se nahi badhta — sirf gate entry se."

## 3 · Sample Development → New Sample Request — 5-step wizard (8 min)
**Kya hai:** system ka entry point. Yahan jo bhi bharoge — pieces, photos, measurement spec, costing, buyer ki dates — wahi aage order, BOM aur inspection mein apne aap chala jaata hai. Sab ek page pe (5 steps), koi popup nahi.

**Step 1 · Request**
| Field | Value |
|---|---|
| Buyer | Zara D |
| Style No | AF-3001 |
| Sample Type | Proto Sample |
| Product Description | Men Polo T-Shirt |
| Size Range | S – XL |
| Target Send Date | aaj + 7 |
| Priority | High |
| Accessories | 3 × Poly Button 18L, woven brand label, care & size label, hang tag + string |
| Buyer comments / tech-pack notes | Rib collar & cuff, side slit 4 cm, twin-needle hem |
| *What the buyer sent* | Buyer article no `ZD-4471` · Factory `Unit 1` · Processes `Print` · CC material `received` · Colour & qty received aaj−5 · BOM received aaj−4 · Tech pack received aaj−4 · Artwork received aaj−3 |
| Specification sheet | buyer ka tech pack PDF (optional) |
| Courier | DHL Express · Receiver `Marta Ruiz, Barcelona` |

**Step 2 · Pieces & photos** — ek piece ke **kai photos** (front / back / detail) drop karo; pehli photo cover banti hai (★ se badlo).
| Piece | Value |
|---|---|
| Piece 1 | photos: 2–3 · Description `Polo, 3-button placket, rib collar` · Fabric `Cotton Pique 220 gsm` · Qty 2 · Colour `Navy` · Sizes M, L |
| Piece 2 | photo 1 · Description `Same polo, white` · Fabric `Cotton Pique 220 gsm` · Qty 1 · Colour `White` · Sizes L |

**Step 3 · Measurement spec (POM)** — size-wise spec + tolerance; sirf M bharo aur **Auto-grade** dabao.
| Code | Point of measure | S | M | L | XL | Tol ± |
|---|---|---|---|---|---|---|
| A | Chest 1" below armhole | 50 | 53 | 56 | 59 | 1.0 |
| B | Body length HPS | 68 | 70 | 72 | 74 | 1.0 |
| C | Sleeve length | 21 | 22 | 23 | 24 | 0.5 |
| D | Shoulder across | 43 | 45 | 47 | 49 | 0.5 |

**Step 4 · Costing** (client ka costing format — ek piece ka cost)
| Block | Value |
|---|---|
| Currency · Exchange rate · Buyer target | USD · 83.50 · 6.00 |
| FABRIC-A | description `Pique 220 gsm 72"` · yardage `0.55` · shrink % `5` · rate `210` · party `Vardhman` |
| Trims | ACCESSORIES qty 3 rate 2.5 · LACE-1 blank |
| Processes | STITCHING 70 · FINISHING 25 · WASHING 10 · LABEL / TAGS 8 · INSPECTION 12 · OVERHEAD 30 |
| Charges | C&F SENDING 20 |
| Wastage % · Profit % | 5 · 25 |
→ neeche totals: material + process → wastage → charges → profit = **final ₹ / pc** aur **USD / pc** (target se compare; over ho toh laal).

**Step 4a · Material sheet** — ek piece ko kya-kya lagta hai (BOM isi se banega)
| Category | Item | Description | Unit | Cons/pc | Waste % | Stock item | MOQ |
|---|---|---|---|---|---|---|---|
| Fabric | Main Fabric | Cotton pique 220 gsm | mtr | 0.55 | 4 | FAB-0190 | 500 |
| Yarn / Thread | Sewing Thread | 40/2 white | cone | 0.02 | 0 | ACC-0240 | — |
| Labels | Main Label | woven brand label | pcs | 1 | 2 | ACC-0214 | — |
| Buttons & Closures | Button | 18L pearl | pcs | 3 | 2 | *(blank — banega apne aap)* | 2000 |
Order quantity `3000` · Garment type `Polo T-shirt` · Colour `Navy / White` · Size ratio `S1:M2:L2:XL1`.
> "Consumption × wastage × order qty = kitna chahiye. Yehi sheet aage BOM ban jaati hai — dobara nahi likhna."

**Step 5 · Review & save** → sample ban gaya, sample page khul jaata hai.
> "Ek hi jagah: photo, naap, cost, buyer ki dates. Aage kisi form mein dobara nahi bharna."

## 4 · Sample page — tabs (3 min)
**Kya hai:** ek sample ka sab kuch ek page pe — koi popup nahi. Tabs: **Overview · Pieces · POM spec · Measurements · Costing · Approvals · Tech pack · Tracking**.
Dikhao: Overview (pieces, details, rounds, costing summary), Pieces (saari photos), Tracking (buyer dates + round-by-round AWB/comment dates).

## 5 · Sample page → Mark Sent (1 min)
**Kya hai:** round 1 buyer ko gaya — courier, AWB, date; TNA "sample sent" auto-tick.

| Field | Value |
|---|---|
| Courier | DHL Express |
| AWB / tracking no | DHL 778812345 |
| Sent On | aaj |
| Pcs per colour | Navy 2 · White 1 |

## 6 · Measurements tab (3 min)
**Kya hai:** buyer/QA ne sample naap ke jo bheja — spec ke against deviation, buyer instruction, revised spec. Comment sheet print (saare sizes).
Round 1 · Size measured `M` · Actual sent on aaj · Comments received aaj + 5:

| POM | Measured | Buyer instruction |
|---|---|---|
| A Chest | 53.8 | — |
| B Body length | 71.5 | reduce 1 cm |
| C Sleeve | 22.2 | — |
| D Shoulder | 45.4 | — |

Tick **Save updated spec to the style POM** → Save → **Print comment sheet** (saare sizes ek saath).
> "Deviation laal dikhta hai, revised spec style mein chala jaata hai — bulk isi pe katega."

## 7 · Log Buyer Feedback (1 min)
**Kya hai:** buyer ka jawab — approved / changes; changes ho toh agla round auto-open.
Buyer Comment `Approved with length correction` → **Approved**.

## 8 · Approvals tab (3 min)
**Kya hai:** bulk se pehle buyer se jo-jo approve hona hai (lab dip, strike-off, trim card, PP sample…) — ek click = aaj ki date; approved row TNA activity complete karta hai. Sirf record kiye rows dikhte hain.
Tick **Show all approval kinds** → in rows pe click:

| Row | Click | Details (optional) |
|---|---|---|
| Lab dip | Received → Sent to buyer → Approved | Due date aaj + 3 · comment `Navy 19-3933 TPX OK` |
| Trim card | Sent to buyer → Approved | AWB `DHL 778812346` |
| PP Sample | Sent to buyer → Approved | pcs 2 |
| Fit Sample | Sent to buyer | (pending rakho) |

Save board.

## 9 · Tech pack tab (2 min)
**Kya hai:** spec sheet ka technical page — composition, construction, labels, packing. Specification sheet pe print hota hai.

| Field | Value |
|---|---|
| Composition | 100% Cotton Pique 220 gsm |
| Article / buyer item no | ZD-4471 |
| Construction notes | Rib collar 1×1, 3-button placket, twin-needle hem, side slit 4 cm |
| Label placement | Brand label at back neck, care label left side seam 10 cm from hem |
| Packing method | Fold 30×25, poly bag each, size sticker on bag |
| Accessory list | Button 18L ×3, brand label, care label, hang tag + string |

## 10 · Sample sheet (PDF) + Spec sheet (2 min)
**Kya hai:** header ka **Sample sheet** button — ek document mein sab: request, buyer dates, pieces **photos ke saath**, POM, rounds, approvals, tech pack aur **costing**. Yehi buyer ko bhejte ho. (Print dialog se "Save as PDF".)
Overview → Specification sheets → **New version** se AFN wala spec sheet bhi banta hai.

## 11 · Buyer Orders & Shipping → New Buyer Order (2 min)
**Kya hai:** buyer ka purchase note / PO header — currency, terms, dates. Ek buyer order ke neeche kai styles ho sakte hain; revisions history ke saath.

| Field | Value |
|---|---|
| Buyer | Zara D |
| Buyer PO / purchase-note no | ZD-PO-9001 |
| Order date | aaj |
| Season | SS-27 |
| Currency / Exchange rate | USD / 83.50 |
| Payment terms | T/T 30% advance, 70% against documents |
| Incoterm | FOB |
| Latest shipment | aaj + 60 |
| Delivery date | aaj + 75 |
| Sales month | 3 mahine baad |

## 12 · Sample page → Convert to Order (3 min)
**Kya hai:** approved sample se bulk order — colour × size grid, USD price (costing sheet se **apne aap bhara** aata hai), cut extra %, ship date. Order number, TNA calendar, 4 floor operations, control tower — sab auto.

| Field | Value |
|---|---|
| Buyer order (purchase note) | ZD-PO-9001 |
| Currency · Exchange rate | USD · 83.50 |
| Unit price / First quoted price | 6.20 / 6.50 |
| Size set | S – XL |
| Colour 1 | code `NV-01` Navy · S 300 · M 600 · L 600 · XL 300 = 1,800 |
| Colour 2 | code `WH-02` White · S 200 · M 400 · L 400 · XL 200 = 1,200 |
| Cutting extra % | 5 (cut qty 3,150 auto) |
| Ship Date (contracted) · Buyer target | aaj + 60 · aaj + 60 |
| Shipment Mode | Sea |
| Special Instructions | Poly bag each pc, 20 pcs/carton solid size solid colour |

→ **AFI-1045**. Order page kholo: Control Tower 12 gates, colour × size matrix (JAN barcodes), TNA plan 25 activities.
> "Order bante hi kaun-kab-kya ka calendar aur floor ki 4 operations ban gayi."

## 13 · Materials tab → Stock analysis → **Create / update BOM** (4 min)
**Kya hai:** sample ki material sheet pe stock check — green = stock mein hai, amber = thoda kam, red = kharidna hai / master mein hi nahi. Ek button se BOM ban jaata hai aur missing items stock master mein khud create ho jaate hain.
Sample page → **Materials** tab → neeche **Stock analysis** dikhao (required / available / shortage / MOQ / final order qty) → **Create / update BOM** → toast "BOM v1 built from the sample · 4 lines · 1 new stock item".
Phir **Material Planning** kholo (ya sample se "Open planning") — wahi lines, coverage bars ke saath; header pe **Build from SMP-xxx** button se kabhi bhi dobara sync kar sakte ho.
> "Merchant ne sirf sample mein likha tha — BOM, requirement aur purchase list apne aap ban gayi."

## 13a · Material Planning → BOM haath se badalna (optional, 2 min)
**Kya hai:** style ka bill of material — per-piece consumption, waste %, colour-wise fabric, part (FAB-A/B), MOQ, required-by date. Requirement cutting qty pe colour × size wise nikalta hai.
Style `AF-3001` → lines:

| Material | Part | Colour | Per pc | Waste % | Note |
|---|---|---|---|---|---|
| FAB-0190 Cotton Pique Navy | FAB-A | NV-01 | 0.55 m | 4 | body |
| FAB-0191 Cotton Pique White | FAB-A | WH-02 | 0.55 m | 4 | body |
| ACC-0208 Poly Button 18L | — | — | 3 pcs | 1 | placket |
| ACC-0214 Woven Brand Label | — | — | 1 | 0 | |
| ACC-0219 Care & Size Label Set | — | — | 1 | 0 | |
| ACC-0223 Hang Tag + String | — | — | 1 | 0 | |
| ACC-0240 Sewing Thread 40/2 White | — | — | 0.02 cone | 0 | |
| PKG-0305 Poly Bag 12x16 | — | — | 1 | 0 | |
| PKG-0301 Export Carton 60x40x40 | — | — | 0.05 | 0 | 20 pcs/ctn |
| PKG-0310 Carton Sticker | — | — | 0.05 | 0 | |

Save BOM → Order Quantity `3150` → **Requirement table**: fabric lines **Short** (lal), baaki Available.

## 14 · Requirement table → Raise PO (2 min)
**Kya hai:** shortage minus on-order, MOQ apply, supplier compare (rate / lead days) — ek line ya bulk. Doosri baar same line pe PO nahi banta.
FAB-0190 row → **Raise PO** → supplier `Vardhman Textiles` · qty **1,100** (MOQ/round) · rate 210 · Expected delivery aaj + 7 → Raise. FAB-0191 → qty **750** · rate 205.
Order page → **Reserve Free Stock** (buttons/labels/poly bags order ke naam reserve).
> "Reserve hone ke baad doosra order ye stock nahi kha sakta."

## 15 · Purchase Orders (1 min)
**Kya hai:** PO register — approval limit (Settings) ke upar wale Pending Approval; print format; status open → partial → received (gate se).
PO row → **Print** (Purchase Order format) · agar Pending Approval hai toh Approve.

## 16 · Gate Entry (3 min) — phone / `ravi.gate` tab
**Kya hai:** goods aaye — 3 tap: kya aaya (PO list) → kitna → confirm. Stock, PO, order, alerts sab auto. Fabric ke liye lot-wise entry.
Simple screen: PO FAB-0190 → Quantity **1,100** → More: Vehicle `HR26DK4471`, Challan `VT/CH/2210` → Lots: `LOT-NV-01` · colour Navy · thans 12 · tag length 1,100 · actual 1,098 · width 72 · gsm 220 → Confirm → GRN number.
Doosra: FAB-0191 → **750** → lot `LOT-WH-01` · thans 8.
Full screen (Admin): Store Location `Rack A`, Inspection Result `Passed 4-point`, Received By.
> "Gateman ko sirf 3 tap; galti se do baar dabaye toh duplicate nahi banta."

## 17 · Quality → Fabric inspection (4-point) (2 min)
**Kya hai:** roll-wise 4-point check (AFN/10) — points per 100 sq m/yd, tag vs actual length/width, GSM; fail → lot **hold** (free stock se bahar) jab tak release na ho.
New → For order `AFI-1045` → GRN · lot `LOT-NV-01` (GRN, lot, width, thans auto) → Metres inspected 1,098 · defects: Slub 4 pts, Shade bar 4 pts → Post → **Pass** (pts/100 sq m < 20) → Print AFN/10.

## 18 · Patterns (1 min, optional)
**Kya hai:** pattern versions (DXF/PDF), grading, marker efficiency, approval (pattern.approve flag) — TNA activity complete.
New: Style AF-3001 · Pattern maker `Neha Gupta` · Base size M · Size range S–XL · Marker efficiency 84 → Submit → Approve.

## 19 · Production Floor → Cutting tab → Cutting report (3 min)
**Kya hai:** daily cutting report (AFN/11) — lot, thans, width, layers, fabric issued/consumed (stock se auto-issue), size-wise cut pieces; plan vs cut per size dikhta hai.
Order `AFI-1045` chunte hi facts strip. Colour `Navy` → Fabric auto FAB-0190 → Lot `LOT-NV-01` (thans/width auto):

| Field | Navy | White |
|---|---|---|
| Layers (plies) | 60 | 40 |
| Fabric issued / consumed (m) | 1,081 / 1,060 | 721 / 705 |
| End bits (m) | 8 | 6 |
| Cutting table · Cutter | Cutting Table 1 · Ramesh | Cutting Table 1 · Ramesh |
| Sizes (ya **Fill balance**) | S 315 · M 630 · L 630 · XL 315 = 1,890 | S 210 · M 420 · L 420 · XL 210 = 1,260 |

→ Cutting 3,150/3,150 Completed; fabric stock 1,060 + 705 m kam.

## 20 · Production Floor → Loading plan (1 min)
**Kya hai:** date × line × process plan — target vs actual (logs se) — weekly loading sheet.
Plan: Date aaj · Line 2 · Process Stitching · Order AFI-1045 · Colour Navy · Target `900` (placeholder = balance).

## 21 · Production Floor → Log Production — Stitching (2 min)
**Kya hai:** floor ki daily entry — line, colour (balance auto), loaded, output, rejection, manpower, hourly grid. Order progress, WIP, TNA, dashboard sab isse.

| Field | Value |
|---|---|
| Order · Stage | AFI-1045 · Stitching |
| Line / Section · Date | Line 2 · aaj |
| Colour | Navy (dropdown mein `0 / 1,800 done`) |
| Loaded on line | 1,000 |
| Hourly grid | 08-09 100 · 09-10 110 · 10-11 115 · 11-12 110 · 12-13 100 · 14-15 120 · 15-16 125 · 16-17 120 = **900** (output auto) |
| Rejection / Alter · Manpower · Supervisor | 6 · 28 · Amit Verma |

Stitching tab → **Stitching WIP** (loaded − output = 100 on line) → Print AFN/14.

## 22 · Job Work → New Job Work Challan (2 min)
**Kya hai:** balance kaam vendor se — GST non-sale challan; quantity = pending pieces auto; vendor category-wise; wapas gate se aata hai aur khud log hota hai.

| Field | Value |
|---|---|
| Against Order | AFI-1045 (facts strip: Stitching 900 of 3,000) |
| Process · Vendor | Stitching · Shree Ganesh Garments |
| Item Description | auto `Cut panels — AF-3001 Men Polo T-Shirt` |
| Issue Quantity | 2,100 (auto = pending) · UOM pcs |
| Rate (₹/unit) | 28 |
| Expected Return | aaj + 7 |
| Process Instructions | SPI 10–11, return in bundles of 20 by size |

Issue → Challan print. **Gate Entry** → pending list mein JW challan → Quantity **2,100** · Rejected 0 → Confirm → Stitching **3,000/3,000 Completed** (Outsourced).

## 23 · Quality → Inline / end-line inspection (1 min)
**Kya hai:** line-wise daily defect check — DHU % (defects × 100 ÷ checked); limit ke upar alert.
Order AFI-1045 · Line 2 · Type End-line · Stage Stitching · Pieces checked 200 · Broken stitch 3 · Skip stitch 2 · Stain 1 → DHU 3.0 %.

## 24 · Production Floor → Finishing tab → Log finishing (1 min)
**Kya hai:** thread trimming / pressing / final check ka output; rejected pieces DHU mein.
Order AFI-1045 · Stage Finishing · Line `Packing Hall` · Colour Navy → Output auto **1,800** → Log. White → **1,200** → Log. Finishing Completed.

## 25 · Quality → Measurement inspection (2 min)
**Kya hai:** 5 finished pcs ek size ke POM spec ± tolerance ke against (AFN/22) — out-of-tolerance lal.
Order AFI-1045 · Stage Final · Size M · Colour Navy · 5 pcs: A 53.2/53.0/53.5/52.8/53.1 · B 69.0/69.3/68.8/69.1/69.2 (revised spec 69) · C 22.1/22.0/22.3/21.9/22.0 → Result Pass → Print.

## 26 · Packing & Cartons (2 min)
**Kya hai:** carton plan (ratio, pcs/ctn → cartons), packing material check (BOM × qty to pack vs free stock — short ho toh Packing block), packing list.
AFI-1045 → **Set plan**: Pack ratio `Solid size, solid colour` · Pcs per carton **20** → 150 cartons. **Log packing** (Packing tab): Navy 1,800, White 1,200 → Packing Completed. **Packing list** print.

## 27 · Quality → AQL → Final inspection (2 min)
**Kya hai:** AQL 2.5 table se sample size & Ac/Re (AFN/21); general checks; Fail/Hold → invoice block, Pass → TNA complete.

| Field | Value |
|---|---|
| Order · Stage | AFI-1045 · Final |
| Site · Inspector type · Inspector | Unit 1 · Internal · Amit Verma |
| Colour · Sampling · AQL level | all · Normal · 2.5 |
| Lot size · Cartons opened / total | 3,000 (auto) · 8 / 150 |
| Checks | colour / fabric / outlook / packaging / assortment / marking = OK |
| Defects | Broken stitch 2 · Stain 1 (Ac 10 / Re 11 → Pass) |
| Result | Pass → Post Result → Print AFN/21 |

## 28 · Dispatch & Documents → Create Invoice (3 min)
**Kya hai:** multi-line commercial invoice (AFN/19) — USD price, INR at FX, IGST, amount in words; box-wise packing list; carton marks with barcode; document checklist.

| Field | Value |
|---|---|
| Buyer | Zara D · line: AFI-1045 · Ship qty 3,000 · Unit price 6.20 · HS 61051010 |
| Invoice date · Shipment mode | aaj · Sea |
| Port of loading · discharge · Final destination | Nhava Sheva (INNSA1) · Barcelona (ESBCN) · Barcelona |
| Incoterm · Payment method | FOB · T/T |
| Consignee | Zara D S.A., Av. Diputación, Arteixo, Spain |
| Cartons · Gross / Net weight | 150 · 1,650 / 1,450 kg |
| IGST % | 0 (LUT) — ya 5 dikhane ke liye |
| Transporter / CHA | Speedway Logistics |

Save → **Boxes → Auto** (20 pcs/ctn, 60×40×40, gross 11 / net 9.7) → **Carton marks** print (Code-128) → **Packing list** → Documents: Commercial Invoice, Packing List, Certificate of Origin, Bill of Lading, Carton Marks → har ek Ready.

## 29 · Dispatch → Track (1 min)
**Kya hai:** shipment events — on board / transit / delivered; order stage + buyer portal auto.
Event **Shipped On Board** · date aaj · vessel `MSC Ida` · B/L no `MSCUBL7781` · ETA aaj + 25. Phir **In Transit**.

## 30 · Payments (2 min)
**Kya hai:** invoice-wise realisation — advance / balance receipts, FX, bank charges, BRC/FIRC; overdue alerts; realisation report.
Invoice AFI-1045 → **Record receipt**: Method T/T · Amount received (₹) = invoice ka 30 % · Credit date aaj · Exchange rate 83.40 · Bank `HDFC` · Reference / BRC / FIRC no `FIRC-2201` → Partial. (Doosra receipt 70 % → **Received** → order stage Payment, TNA complete.)

## 31 · Order page → Close Order · Buyer Tracking Link (2 min)
**Kya hai:** shipped + paid order close (audit ke saath). Tracking link: buyer bina login ke stage board dekhta hai — PIN, expiry, revoke, access log.
Close Order → Buyer Tracking Link → PIN `1234` → New link → incognito tab mein kholo.

## 32 · Reports & Analytics · Settings (3 min)
- Dashboard → **Order Status Summary** → Run → CSV / Print. **Production Efficiency & DHU**, **Export Realisation**.
- Settings → **Form Fields**: kisi form mein extra field add karke dikhao (e.g. Sample → "Buyer merchandiser", text). Users & Roles: module tick / confidential flags. Alert Center: auto alerts.
> "Bina developer ke field, role, alert — aur har action audit log mein."

---

## Agar client puche
- **Language?** UI English; print formats client ke apne (AFN/10 · 11 · 13 · 14 · 17 · 19 · 21 · 22 · 40).
- **Mobile?** Gate Man ke liye phone screen; baaki responsive.
- **Data kahan?** MongoDB Atlas (cloud), daily backup, role-based access, audit log.
- **Custom fields / naya form?** Settings → Form Fields se aap khud.

## Demo ke baad
- AFI-1045 demo order rakhna ho toh rakho; warna Orders → Close Order (already closed hoga).
- Gadbad ho toh `Ctrl+Shift+R`; backend log terminal mein.
