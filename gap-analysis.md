# Afion International — Document analysis & software gap list

Source: 8 photographed working documents (Japanese buyer spec sheets, sample comment sheet, purchase note, YARRA order sheet, internal order/cutting sheets, tax invoice, packing list) and 10 Excel formats from `D:\Afion international` (AFN/10, 11, 13, 14, 17, 21, 22, Shipping Track, Style-wise Material Requirement, TNA-WIP). Reviewed on 2026-09-17 against the ERP as built.

---

## 1. What the documents say about how Afion actually works

### 1.1 The buyers are Japanese trading houses, not European retailers
- Buyers seen: **Adventure Group / CAPRI Co. Ltd** (brand M.M.O., Fukuoka), **F.I.O. Limited** (Osaka), **YARRA / Unlimi Inc.**, **H&B**, **AD**. Contacts: Mr. Yokoyama, Mr. Myokai. Afion side: Mr. Abhishek, Mr. Vipin.
- Real company identity: **AFION INTERNATIONAL, Plot 357-1, Sector 37, Pace City-2, Khandsa, Gurgaon, Haryana 122004** · GSTIN `06AGAPJ5731F1ZS` · AD code `0510005` · invoice format `AFN/019/26-27`. (Our seed says Noida — change the demo company profile.)
- Style numbering comes from the buyer: `CLF8392`, `CLF8354`, `1631-318`, `TWS806477`, `W1NINA110`. Afion's own sample numbers are `AFN-001 … AFN-005`. The same garment therefore has **buyer style no + Afion sample no + buyer PO no + buyer "No." (purchase-note number 20002115-1)**.
- Everything is priced in **US dollars** (unit price $2.70, $7.50 … $12.50). INR appears only on the tax invoice via an exchange rate (94.80).

### 1.2 Sampling is a long, multi-round, measurement-driven conversation
- The **Sample Comment sheet** (CLF8392 ①②) is a measurement table: per point of measure (POM, letters A–Z, a'–h', Japanese labels 総丈 / 前丈 / 前身幅 … ) with columns **Size Spec · 1st Sample (measured) · 1st Inst(ruction) · 2nd Sample · 2nd Inst …**, plus "AMEND / CHANGE" comment boxes and a checklist (revised samples, salesman samples, fit sample for LL–3L).
- The **Specification Sheets** are the buyer's tech pack: composition, lining yes/no, article, quantity, time of shipment, the same POM table with size spec (60, 65, 54(ex64) …), sketches with construction notes (button 10 mm × 7 + 1 spare, hem 1 cm 3-fold, gather 18(ex36), back piping by bias, tag loop), label placements. Handwritten fabric consumption "3PC – 2.82, 1PC – 0.94" and price options "2.70 / 2.75 / 2.65".
- Sample kinds in use: **proto, fit, revised fit, size set, PP, exhibition sample (1 pc/colour), salesman sample (4 pcs/colour), photoshoot samples, "1st of bulk" SMS, bulk samples, TOP samples** (from TNA-WIP Sampling OSR + T&A sheets). Each has *sent date · actual sent date · AWB · comments received date*.
- Approvals tracked separately from samples: **lab dip, embroidery mock-up, print strike-off, wash strike-off, shade bands, trim card, fabric (ordered / in-house), trims (ordered / in-house)** — each with received-from-factory / submitted-to-buyer / approved dates.
- Special sizes (LL–3L) are negotiated per order with MOQ per colour (30 pcs/colour, 150 total).

### 1.3 Orders are multi-style, colour-wise, USD, with partial shipments
- A buyer **Order Sheet / Purchase Note** carries several styles at once (YARRA: 1631-317 … 321, five styles, 2,500 pcs) or one style with a **colour grid** (CLF8354: 01 Grey×White 2,250 · 02 White×Black 2,650 · 03 Off×Charcoal 2,850 · 07 Black×Off 2,850 = 10,600). Colours have **buyer colour codes** (01, 50, 60, 81, 85, 99).
- Quantities get **revised** (10,000 → 10,600; 2,500 → 2,850) and the sheet is re-issued ("REVISED ORDER SHEET 2026/6/25").
- Dates per order: **latest shipment**, **delivery date**, **sales month**, plus sample deadlines (exhibition sample 2026/JAN/5, salesman sample JAN/END).
- Shipments are **split into lots by style and date** ("7/27 by air 1631-317/318/319 · 8/10 by air 320/321"). The Shipping Track sheet keeps **Qty Ship-1 … 6, Invoice No-1 … 6, AWB-1 … 6, short-shipped / cancellation qty and value, balance value** per style-colour row, plus 1st price vs final price, target vs contracted delivery, HS code, preference criterion.
- Terms seen: irrevocable **L/C at sight** (L/C no. + date on invoice), **CFR Japan**, HAKATA by ship / FUKUOKA by air, Osaka by air.
- Buyer's accessory list per piece is part of the PO: hang tag 1, washing label 1, demerit tag 1, care label 1, merit tag 2, LOX 1, interleaf paper 1, spare button, silica gel — with packing method (1 pc poly bag, 30 pcs master poly bag, 100 pcs/carton, JAN code on 4 sides).

### 1.4 Material planning is colour-wise and size-wise, with several fabrics per style
- Internal **order sheets** (CLF-8392, TWS806477): per colour (or per size for kids 2-3Y … 9-10Y) → **ORDER qty · CUT qty (order + ~5 %) · FAB-A / FAB-B / FAB-C consumption** (avg incl. wastage 0.66, 2.2, 1.5, 1.1) → totals (order 10,600 · cut 11,132 · fabric 7,349 m).
- **Style-wise Material Requirement format**: 47 line items in categories Fabric (main, fabric 2, lining, rib, moon, fusing, pocket, embroidery backing), Threads, Trims, Buttons & Closures, Labels, Packing, Washes; columns *consumption/pc · wastage % · average consumption · order qty · final required · available stock · shortage · supplier MOQ · final order qty · supplier · required date · remarks*; sign-offs Merchant / Production Head / Store / Approved by.
- **Fabric WIP** (TNA-WIP): per colourway — lab dip card no, option approved, body fabric qty required (kg for knits), ordered date, in-house date, **dyeing lots in-house (lot no · qty · date)**, rejected fabric by lot, closure date, standard vs planned vs actual lead time.

### 1.5 Floor control is lot-wise and hourly, with safety registers
- **AFN/11 Daily Cutting Report**: date, fabric type, style, colour, **lot no, no. of thans, width, total metres, order qty, cut sizes S/M/L/LL/3L/F, consumed metres, today total cut pcs, end pcs**.
- **AFN/14 Stitching Production Report**: per line/style/colour: cutting received today (A), total received (B), **on machine today / total (C, D), off machine today / total (E, F), difference = WIP on line, cutting in stock = B − loaded, dispatch (to finishing)**; second layout per line with manpower. **AFN/40**: hourly output 9:30–21:00 per line with break windows.
- **Loading plan** (TNA-WIP): date × line target vs actual for cutting, stitching (line 1, 2 with machine count), embroidery, printing, washing, finishing.
- **AFN/13 Broken Blade Register**: date, received qty, issue qty, broken, balance. **AFN/17 Broken Needle Record**: date, operator, machine no, needle size, needle no, supervisor, broken needle part (all parts recovered — a buyer-audit requirement).

### 1.6 Quality has three formats
- **AFN/10 4-point** (already in the ERP) — but the paper form also records **on-tag vs actual length and width, defect size buckets 0–3" / 3–6" / 6–9" / >9" per category, GSM, check-in date, per lot rows**, points per 100 sq yards.
- **AFN/21 Final inspection** (already in the ERP) — adds PO qty, PO date, shipped qty, ref no, total found vs total allowed.
- **AFN/22 Measurement inspection** — NOT in the ERP: 22 standard POMs (body length, chest, front/back waist, bottom, neck width, shoulder, sleeve length, cuff, armhole …) × up to 3 sizes × 5 measured pieces against spec with a tolerance column.

### 1.7 Export documents are multi-style with Japanese specifics
- **Tax Invoice AFN/019/26-27**: exporter, buyer's order no (FW 26), consignee F.I.O., pre-carriage by air, place of receipt IGIA New Delhi, port of loading, port of discharge Osaka, place of delivery Japan, **CFR** terms, **L/C no. + date, at sight**, **HS code 6110.20**, lines = *sample no + style no + description + qty + USD price + USD→INR rate + taxable value INR + IGST 5 % + total*, totals in USD and INR, amount in words, "GST on reverse charge", authorised signature, format no AFN/019.
- **Packing List AFN/019/26-27**: box no × style × description × **colour columns with codes** (Off White 01, Blue 50, Brown 60, Light Grey 81, Charcoal Grey 85, Black 99) × pcs; total cartons 12, gross 245 kg, net 227 kg, carton size 60×40×30.

---

## 2. Gap list — what the ERP must change

Priority: **P1** = blocks daily use for these buyers · **P2** = important within the first month · **P3** = nice to have.

### P1 · Order structure
| # | Change | Why (document) |
|---|---|---|
| 1 | **Buyer order sheet (PO) as a header with many style lines.** New entity *Buyer Order* (buyer PO no / purchase-note no, date, revision no, currency, terms, latest shipment, delivery date, sales month) containing one line per style-colour. Today's *Order* becomes one style line under it. | YARRA sheet (5 styles), CLF8354 purchase note, Shipping Track rows per style-colour |
| 2 | **Colour-wise quantities with buyer colour codes** on every order line (01 Grey×White 2,250 …), and size matrix per colour. Cut qty per colour/size = order + extra %. | Purchase note, order sheets, packing list, cutting report |
| 3 | **Configurable size sets** per buyer/style (S–3L, M–L, LL–3L, F, kids 2-3Y … 9-10Y) instead of the fixed S–3XL grid. | Cutting report sizes, kids order sheet, LL–3L special sizes |
| 4 | **USD pricing**: order currency, unit price in buyer currency, 1st price vs final price, exchange rate on invoice, INR value derived. FOB ₹ stays as an internal cost field. | Every buyer document, tax invoice |
| 5 | **Order revisions**: quantity/price/date changes with revision number and history (10,000 → 10,600). | "REVISED ORDER SHEET", struck-out quantities |
| 6 | **Partial shipments**: several invoices per order line (ship-1 … ship-n with invoice no + AWB/BL), short-shipped and cancelled qty, balance qty and value; target vs contracted delivery. | Shipping Track, YARRA lots 7/27 and 8/10 |

### P1 · Sampling
| # | Change | Why |
|---|---|---|
| 7 | **Measurement spec (POM table) on the style/sample**: rows = points of measure (code, name, Japanese label optional), columns = size spec per size + tolerance; per sample round record *measured* values and buyer *instruction* per POM; auto deviation. Print in the buyer's comment-sheet layout. | Sample comment sheet, spec sheets, AFN/22 |
| 8 | **More sample kinds and a sample plan**: proto, fit, revised fit, size set, PP, exhibition, salesman, photoshoot, 1st-of-bulk SMS, TOP; each with due date, pcs per colour, sent / actual sent / AWB / comments-received date. | TNA-WIP Sampling OSR, purchase note sample deadlines |
| 9 | **Approvals board per style**: lab dip (card no, option approved), print strike-off, embroidery mock-up, wash strike-off, shade band, trim card, FPT / GPT test reports — each with received-from-factory, submitted, approved, comments. These become TNA activities that auto-complete. | T&A sheet columns AC–AW, BB, BD |
| 10 | **Tech-pack fields on the style**: composition, lining yes/no, article type, construction notes, label placement, buyer accessory list per pc (hang tag 1, care label 1, merit tag 2 …), packing method text. | Spec sheets, purchase note right-hand block |

### P1 · Materials & cutting
| # | Change | Why |
|---|---|---|
| 11 | **Colour-wise (and size-wise) BOM consumption**: FAB-A/B/C per colour, consumption per size, average incl. wastage; requirement = Σ(cut qty × avg). Material categories expanded to the 47-item list (lining, rib, fusing, threads, trims, closures, labels, packing, washes). Add **supplier MOQ**, **required date**, "final order qty = max(shortage, MOQ)". | Order sheets, Style-wise Material Requirement format |
| 12 | **Fabric lots**: gate entry records lot no, no. of thans, on-tag vs actual length and width, GSM; stock and 4-point inspection are lot-wise; dyeing-lot in-house tracking per colourway with rejected fabric. | AFN/10, AFN/11, Fabric WIP |
| 13 | **Daily Cutting Report (AFN/11)** as a form: lot consumed, thans, metres, cut pcs per size, end pieces; drives cut qty vs order and actual consumption vs BOM. | AFN/11 |

### P2 · Floor & quality
| # | Change | Why |
|---|---|---|
| 14 | **Stitching WIP (AFN/14)**: per line/style/colour — cutting received, loaded on machine, off machine, WIP on line, cutting in stock, sent to finishing; hourly output (AFN/40) optional. Replaces the simple "output" log. | AFN/14, AFN/40 |
| 15 | **Loading plan**: date × line target vs actual for each process (cutting, stitching lines, embroidery, printing, washing, finishing). | TNA-WIP Loading Plan |
| 16 | **Measurement inspection (AFN/22)**: pick POMs from the style spec, enter 5 pieces per size, tolerance check, pass/fail per POM; attach to mid/final AQL. | AFN/22 |
| 17 | **4-point form to match AFN/10**: lot rows, on-tag vs actual L/W, defect size buckets per category, GSM, points per 100 sq yards option. | AFN/10 |
| 18 | **Broken needle record (AFN/17)** and **broken blade register (AFN/13)** as simple daily registers under Compliance/Quality (buyer audit evidence). | AFN/13, AFN/17 |
| 19 | Final inspection (AFN/21): add PO qty, PO date, shipped qty, ref no, total found vs allowed. | AFN/21 |

### P2 · Export documents
| # | Change | Why |
|---|---|---|
| 20 | **Invoice with many lines** (several styles / sample nos of the same buyer order), each with HS code, USD price, qty, rate of exchange, INR taxable value, IGST % (0 or 5 with/without payment of tax), totals USD + INR, amount in words. Header: buyer's order no, consignee, pre-carriage, place of receipt, L/C no + date, "GST on reverse charge". Add **CFR** (and CPT/DAP) to incoterms. | Tax invoice AFN/019 |
| 21 | **Packing list = box-wise matrix** (box no × style × colour code × size × pcs), gross/net weight, carton dimensions, total cartons; generated from the packing plan and colour grid. | Packing list AFN/019 |
| 22 | Format numbers (AFN/019, AFN/10 …) printed on every generated document; the company profile must be Gurgaon with the real GSTIN / AD code. | All formats |

### P3 · Nice to have
| # | Change |
|---|---|
| 23 | Japanese labels on the POM table and portal (optional second language for buyer-facing prints). |
| 24 | Buyer colour master (code ↔ name) reused across orders, packing list and invoice. |
| 25 | JAN/barcode per style-colour-size for carton marking. |
| 26 | Preference criterion / certificate of origin fields per line (Shipping Track column AF). |

---

## 3. What already matches (keep as is)
- 4-point inspection formula (points × 3937 ÷ (metres × width), 20-point limit), DHU, AQL 2.5/4.0 with sample size/accept/reject, workmanship checks — same as AFN/10 and AFN/21.
- TNA with planned vs actual, RAG, replans; PP meeting, final inspection, ex-factory, mode of shipment exist. The T&A sheet's extra milestones map onto new TNA activities (item 9) rather than a new module.
- Job-work challans and location engine, gate-entry-only stock, Control Tower, buyer portal, alerts, reports, compliance register — nothing in the documents contradicts them.
- Material requirement math (consumption + wastage → required − stock = shortage) is the same as the Excel format; only MOQ, required date and category depth are missing.

---

## 3a. Status (17 Sept 2026)

**Implemented — items 1 to 22 and 25.** Details in `README.md` (Phase 8), `flow.md` Part H (Hinglish), `pipeline.md`, `test-data.md` Part H; verified by `backend/test/smoke_p8_gaps.py` (≈ 95 checks) plus the eight earlier suites.

**Deliberately not built (on the client's instruction):** 23 Japanese label / size-name printing, 24 buyer colour-code master, 26 preference / priority criterion.

## 4. Suggested build order
1. Order restructure (items 1–6) — everything downstream (BOM, cutting, packing list, invoice, shipping track) depends on colour-wise lines and partial shipments.
2. POM measurement spec + sample rounds (7, 8, 16) — the daily conversation with Japanese buyers.
3. Colour/size-wise BOM + fabric lots + cutting report (11–13).
4. Multi-line invoice + box-wise packing list (20–22).
5. Stitching WIP, loading plan, approvals board, registers (9, 14, 15, 17–19).
