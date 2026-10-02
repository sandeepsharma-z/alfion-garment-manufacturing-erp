# Afion ERP — Demo Script 2: "Meeting 1 ke baad kya badla" (≈ 45 min)

Pehli meeting me client ne jo maanga tha, wo sab ban gaya hai. Ye script **sirf naye changes** dikhati hai —
purana end-to-end flow `DEMO-SCRIPT.md` me hai (agar client naya banda laaye to wo chalao).

Login: `vikram` / `Afion@123` (Admin — sab kuch dikhta hai).
Har section me: **Client ne kya kaha** → **Ab kya hai** → **Kahan dikhana hai**.

---

## Demo se pehle — 5 min checklist

| Cheez | Value |
|---|---|
| Backend + frontend | chal rahe hon, browser `Ctrl+Shift+R` |
| Naya sample (jersey) | **SMP-323** · AF-30021 · Men Round Neck Jersey T-Shirt — Royal Blue · Viverano · Approved |
| Naya order | **AFI-1047** · 4,800 pcs · USD 4.60/pc · ₹18.33 L · stage Finishing (75%) |
| Shipment demo order | **AFI-1044** · invoice **AFI/EXP/2026-27/0183** · 360 cartons · USD 55,080 |
| Buyer link (buyer ko dikhane ke liye) | `/track/YF24-7B4S` · password `HM-4310-top` |
| Naya buyer | **B-03 Viverano Group** (shipping & document details bhare hue) |
| Tab 2 me khol ke rakho | Samples list, TNA board, Packing, Dispatch |

> Opening line: *"Pehli meeting me aapne kaha tha — data ek hi baar bhare, aage khud chale; popup nahi, poora page; aur sample development se hi sab shuru ho. Wahi dikhata hu."*

---

# 1 · Sample Development = single entry point (12 min) — **sabse bada change**

### 1.1 Sample cards ab saaf hain
**Client ne kaha:** card pe sirf photo, date, description, status aur rounds dikhe — baaki click par.
**Ab:** Sample Development list me har card pe **photo (+N badge agar zyada photos hain)**, style no, description, sample no · buyer, target date, status, round chips. Koi action button nahi — **card pe click → poora page**.
Approved + unconverted sample pe **"READY → CONVERT TO ORDER"** chip.
**Dikhao:** Sample Development → SMP-323 card (jersey photo + "+1").

### 1.2 Ek section me multiple images
**Client ne kaha:** ek piece section me kai photos add karne do.
**Ab:** "Pieces & photos" step me ek piece ki **jitni chahe photos** — front, back, detail. Pehli photo cover, ★ se koi bhi cover ban jaati hai, ✕ se hat jaati hai.
**Dikhao:** SMP-323 → Pieces tab → front + back dono images.

### 1.3 New Sample Request ab 6-step **page** wizard (popup nahi)
**Client ne kaha:** popup nahi, page view; aur details ek hi baar bhare.
**Ab:** `/samples/new` pe **6 steps**: `Request → Pieces & photos → Measurement spec (POM) → Material sheet → Costing → Review`.
Neeche "Step 3 of 6" aur Next/Back — beech me kabhi bhi save.
**Dikhao:** New Sample Request button → steps ki strip.

### 1.4 POM (measurement spec) usi form me
**Ab:** Step 3 me size-set (S–2XL) + POM points, tolerance, size-wise spec. SMP-323 me **10 points × 5 sizes** bhare hain (chest, body length, shoulder, sleeve, sleeve opening, neck width, neck rib, hem, armhole, hem fold).

### 1.5 **Naya costing form** (client ki Excel jaisa)
**Client ne kaha:** har cheez ki costing ka form do — jo bhi kharcha order pe aata hai.
**Ab:** Step 5 "Costing" — 4 blocks + formula:
- **Fabrics**: item, description, yardage, shrink %, **act. yard = yardage × (1+shrink%)**, rate, amount, party
- **Trims**: item, qty, unit, rate, amount, party
- **Processes**: cutting / stitching CM / printing / finishing / packing
- **Other charges**: QC, freight, testing
- **Wastage %**, **Profit %**, **exchange rate**, **target price**
- Totals: material + process → sub → +wastage → +charges → +profit → **final ₹/pc aur final USD/pc**
**SMP-323 ka asli data:** fabric ₹234.24 + trims ₹29.70 + process ₹50.50 → sub ₹314.44 · wastage 3% ₹9.43 · charges ₹5.50 · profit 12% ₹39.52 → **₹368.89 = USD 4.44/pc** (target 4.75).
**Dikhao:** SMP-323 → Costing tab.

### 1.6 Buyer ko bhejne se pehle **poori sheet download**
**Client ne kaha:** PDF me sample sheet download ho jisme ab tak ka sab data ho.
**Ab:** sample page pe **"Sample sheet"** button → ek printable sheet khulti hai: company header, request details, buyer tracking dates, **pieces ke photos**, POM spec table, rounds + measurements + comments, **costing**, approvals, tech pack. Browser ke print dialog me **Save as PDF** → buyer ko mail.
**Dikhao:** SMP-323 → Sample sheet → PDF.

### 1.7 Baaki sab bhi page view
**Ab popup ki jagah tabs:** `Overview · Pieces · POM spec · Measurements · Materials · Costing · Approvals · Tech pack · Tracking`.
Approvals me by default sirf **chhue hue** rows dikhte hain (pending ka dhher nahi).

### 1.8 Client ki Excel (sample tracker) ke columns kahan gaye
**Client ne kaha:** sample development complex hota hai, details zyada bharni padti hain — structure mat badlo, samjho.
**Ab mapping:**

| Excel column | Software me |
|---|---|
| S.No. / ARTCL NO. / CUSTOMER / FCTY | Sample no (auto) · Tracking → **Article no**, buyer, **Factory** |
| IMAGE | Pieces → multiple photos |
| FABRIC DETAIL / Processes / Color / Qty | Request step + Tracking → **Processes** |
| Color & Qty detail / BOM / Tech pack / Artwork received date | Tracking tab ki 4 dates |
| Proto send out / actual sent / AWB / comments-receive date / changes | **Rounds** — har round me type, due date, sent on, actual sent, courier + AWB, comments date, buyer comment, result |
| Print / Emb S/O received, sent to buyer, AWB, approval received | Approvals tab (Print strike-off, Embroidery mock-up, Lab dip, Trim card…) — date + status |
| Photoshoot / 1st of bulk SMS / Bulk samples | Round **type** (Photoshoot Sample, SMS 1st of bulk, Salesman, PP…) — har round apni dates + AWB ke saath |
| CC Material / Remarks | Tracking → CC material, Remarks |
| "For proto" / "in actual fabric" sub-columns | Round ke andar hi (round 1 proto, round 2 actual fabric) |

> Line: *"Aapki sheet ka ek row = yaha ek sample; sheet ke sub-blocks = rounds. Jo date aap Excel me likhte the, wahi yaha ek baar padti hai aur aage 25 activities me khud chali jaati hai."*

### 1.9 "Ek baar bharo, aage khud chale" — ye dikhana zaroori hai
Sample me bhara data aage **kahan-kahan bina type kiye** aata hai:

| Sample me bhara | Aage kaha use hota hai |
|---|---|
| Photos | Order page, Production floor hover, TNA board, buyer portal |
| Description / style / fabric / colour | Order, cutting form, packing list, invoice |
| POM spec | Measurement inspection, buyer comments, revised spec |
| Material sheet (per pc) | **BOM khud ban jaata hai**, material planning, PO, stock analysis |
| Costing final price | Order ka unit price prefill |
| Buyer dates (colour/BOM/tech pack/artwork) | TNA plan + tracking tab |
| Size ratio / colours | Order ka colour × size grid → cutting, packing, carton list |

---

# 2 · Material requirement → BOM → stock → PO (7 min)

**Client ne kaha:** per-piece material ka form bhi costing jaisa ho; stock me hai to **green**, nahi to **red**; PO prefilled aaye.
**Ab:**
1. Sample step 4 **Material sheet** — group (Fabric/Trims/Labels/Packing… 16 groups, **117 ready values**), item, description, unit, **per pc**, **waste %**, MOQ, required date. Horizontal scroll nahi — screen ke hisaab se cards.
2. Neeche **stock analysis**: average consumption = per pc × (1+waste%), **required = avg × qty**, available, **shortage**, on order, MOQ → **final order qty**; green = stock me hai, red = kharidna hai.
3. **Create / update BOM** ek click — aur **order me convert karte hi BOM khud ban jaata hai** (missing stock items bhi khud ban jaate hain).
4. Har red line se **PO prefilled** (supplier, qty, rate, ETA) — bas Save.

**AFI-1047 ka asli data:** BOM v1 · **11 lines** · required on 5,040 pcs → fabric 6,028 m, rib 318 m, thread 106 cone, labels 5,141 × 3, transfer sheets 10,484, poly bag/hangtag/tag pin 5,141 each, carton 255 → **11 PO (₹13.36 L)** raise + approve + **gate se receive** → stock me.
**Dikhao:** Material Planning → AFI-1047 (green/red), Purchase Orders list, Stock.

---

# 3 · Har form me order select karte hi prefill (3 min)

**Client ne kaha:** jo bhi form ho, order select karte hi sample ke time ki values apne aap aa jaayein.
**Ab:** Cutting, Accessories, Packing, Job work, Quality, Dispatch — order chunte hi fabric (ek se zyada ho to dropdown), colour, **size-wise planned vs already done** (e.g. "S: 1,200 me se 1,050 ho gaya"), pcs/carton, price — sab prefill; bas aaj ka number bharna hai.
**Dikhao:** Production Floor → Cutting form (AFI-1047 select karke).

---

# 4 · TNA — Time & Action (8 min)

| Client ne kaha | Ab kya hai | Kahan |
|---|---|---|
| Task list mix aa rahi hai, order ke hisaab se dikhe | Tasks tab **order-wise sections** — order no, buyer · style, overdue count, collapse/expand, per-order "Live status" + Excel | TNA → Tasks |
| Multiple template banao aur order pe badal sako | TNA → Templates (jitne chahe) + order page pe **"Template: … + Apply"** — done activities waise hi rehti hain | TNA → order → Time & Action plan |
| Poora plan Excel me download ho (dashboard + per order) | **"Excel — full plan"** (saare live orders) aur per-order Excel — buyer ki sheet jaisa layout: left block (sample no, style, description, processes, fabric, PO no, PO qty, colours, colour-wise qty, ship date) + stage-wise grouped columns + **Planned row aur Actual row**; green = time pe, red = late, `(auto)` = system ne bhara | TNA header / order header |
| Jaise step complete ho, khud "completed / approved" mention ho | **Actual column** me date + chip: `Completed · auto` / `Approved · auto` / `Marked done`. Order confirm, spec, PP sample, pattern, lab dip, strike-off, trim card, fabric PO, fabric & trims in-house, cutting/stitching/finishing/packing, final AQL, ex-factory, dispatch, docs, payment — sab auto | TNA → Tasks → chip "Done" |
| — (naya) | **Buyer ko password wala link**: "Share plan" → Full T&A plan / stage board, password, validity → link + access log + revoke | TNA → Share plan |

**Buyer link demo (ye client ko bahut pasand aata hai):** naye tab me `/track/YF24-7B4S` → password `HM-4310-top` → buyer dekhta hai: photos, order facts, stage board, **poora T&A plan (planned vs actual)**, colour × size breakup, floor progress, quality inspections, packing & shipment + documents, merchandiser contact. **Paisa, vendor, stock, cost kabhi nahi** jaata.

---

# 5 · Packing & Dispatch (8 min)

**Client ne kaha:** finishing ke baad packing production floor pe nahi honi chahiye; buyer ke format me packing list aur invoice chahiye; ek buyer ke kai orders ek invoice me jaate hain; details baar-baar na bharni pade.

**Ab:**
1. **Production Floor** pe Packing card sirf **numbers** dikhata hai; "Packing page" button → `/packing?order=…`. Header ka Packing tab bhi wahi le jaata hai.
2. **Packing & Cartons** page pe kaam: pack ratio + pcs/carton, **Log packing** (yahi se packed pieces), carton plan, packing material check, aur shipment ban jaane ke baad **buyer format Packing list** + shipment link.
3. **Buyer master me ek baar** (Buyers → *Shipping & documents*): consignee, buyer-if-other, pre-carriage, place of receipt, ports, place of delivery, mode, incoterm, payment method, default HS code, pcs/carton, carton size, gross/net kg per carton, marks & nos. → **har invoice/packing list me khud bhar jaata hai** (cartons aur weights bhi qty se calculate).
4. **Ek invoice, kai orders**: buyer chuno → jo orders ja rahe hain tick karo (partial qty allowed, balance open rehta hai).
5. **Cartons auto** (Auto boxes): colour × size grid + pcs/carton se box ranges ban jaate hain — AFI-1044 me **360 cartons** (white 1–270, black 271–360), gross 4,140 kg, net 3,780 kg, 60X40X30.
6. **Documents buyer ke format me** — PACKING LIST aur INVOICE bilkul unki sheet jaisi: Manufacturer & Exporter / Consignee / Buyer (if other) / Invoice no & date / Buyer's order no / AD code / GST IN / Performa invoice / Country of origin & final destination / Pre-carriage / Place of receipt / Vessel-Flight / Port of loading / Port of discharge / Place of delivery; phir Box Nos + Style # + description + **SIZES columns** + Quantity + Remarks, per-size total; footer: READY MADE GARMENT, Number of Carton, Total GW, Total NW, Measurements/Carton, FORMAT NO. Invoice me STYLE NO. / HS Code / Price / TOTAL AMOUNT + **TOTAL BOX**, **Less – Advance**, **Total**, amount in words, declaration, authorised sign.
**Dikhao:** Dispatch → AFI/EXP/2026-27/0183 → Generate "Packing List" aur "Commercial Invoice".

---

# 6 · Paisa — kisko dena hai, kisse lena hai (5 min)

| Client ne kaha | Ab kya hai | Kahan |
|---|---|---|
| Vendor/supplier ka kaam, rate, payment, pending sab dikhe | **Job Work page**: per challan **Work value** (returned × rate), **Still to pay** (red chip), Pay button, KPI "Still to Pay Vendors" (billed/paid/overdue) | Job Work |
| Vendors & Suppliers page pe paisa mat dikhao | Wo page ab saaf master hai (process, rate, capacity, on-time, rating) | Vendors & Suppliers |
| Buyer se kitna aana hai, advance kitna aaya | **Buyers page**: strip (still to receive / live order book / waiting for money), per-row live orders + order value + received + **still to receive**, row click pe **buyer account** — order-wise value/invoiced/received/balance + invoice-wise receipts + printable statement | Buyers |
| Challan/PO kholo to price calculate hoke dikhe | Challan detail me **Work value / Paid / Still to pay** + per-GRN value; PO detail me **Billed on received / Paid / Still to pay** + per-GRN value | Job Work → challan · PO → detail |

---

# 7 · Chhote par dikhne wale fixes (3 min)

- **Number field me zero ki problem** khatam (type karte hi aage zero nahi lagta, wheel se value nahi badalti).
- **Material list** (aapki "Possible Materials / Accessories" sheet): 16 groups, **117 values** — Stock master, Job work item, sample material sheet, sab jagah "type or pick"; group chunne se category, item type aur UOM khud set.
- **Compliance** me document upload (ek ya multiple) + delete.
- **Approvals** me default sirf chhue hue rows.
- **TNA stages** board (pipeline view theek), **template form page view**.
- **Stock & Inventory** page pe horizontal scroll nahi.
- Dashboard: graphs + reports cards, purple-admin theme sab jagah, Mingcute icons.
- Order ID pe hover → **sample ki photo** (production floor, job work, TNA, quality — jaha table me photo nahi daal sakte).

---

# 8 · 20-minute run sheet (agar time kam ho)

1. **Samples list** → card (photo + "+1", date, description, status, rounds) → *"card pe sirf yehi, baaki click pe"* — 1 min
2. **SMP-323** → Pieces (2 photos) → POM spec → Material sheet (green/red) → **Costing** → **Sample sheet PDF** — 6 min
3. **New Sample Request** → 6 steps ki strip dikhao (bharna nahi) — 1 min
4. **AFI-1047** (converted order) → BOM 11 lines · 11 PO · gate · cutting 5,040 · stitching/finishing 4,800 — 3 min
5. **TNA** → Tasks order-wise → Actual me `auto` chip → **Excel — full plan** → **Share plan** link + password → buyer page — 5 min
6. **Packing** (AFI-1044, 360 cartons) → **Dispatch** → Packing List + Invoice print — 4 min
7. **Buyers** page (advance/pending) + **Job Work** (still to pay) — 2 min

---

# 9 · Client ke sawal — ready jawab

- **"Data do baar kyun bhare?"** → Nahi bharna. Sample me jo bhara, wahi order, BOM, PO, cutting, packing, invoice aur buyer link me jaata hai. Sirf aaj ka number (kitna kata, kitna sila) bharna hota hai.
- **"Excel format change karna padega?"** → Nahi. Aapke hi column structure pe T&A Excel download hota hai (Planned/Actual rows), aur sample tracker ki saari dates software me hain.
- **"Buyer ko kya dikhega?"** → Sirf wahi jo aap chuno: stage board ya poora T&A plan. Password lagta hai, validity hoti hai, kabhi bhi revoke; paisa/vendor/stock kabhi nahi.
- **"Purana data kaise aayega?"** → Masters (buyer, supplier, material, size sets) ek baar import/entry, uske baad naye orders isi flow me.
- **"Offline / mobile?"** → Web app mobile pe chalti hai; gate man ke liye simple screen; TNA/dashboard phone pe bhi.

---

# 10 · Jo abhi nahi hai (client ko pehle bata dena behtar hai)

- AFI-1047 ka **packing + invoice** abhi nahi kiya (demo me live karke dikhaya ja sakta hai — 2 min ka kaam).
- **AD Code** Settings me khaali hai → invoice pe "—" chhapta hai; company detail bharni hai.
- **IGST 5%** set hai; LUT ke under export karte ho to Settings me 0 karna hoga.
- Packing list ki **IMAGE column** Excel/print me nahi (Excel HTML import photo drop kar deta hai) — software me photo dikhti hai.
- E-invoice / e-way bill portal ka **API integration** nahi hai — data sheet ready milti hai, portal pe paste karna padta hai.
- Buyer portal me **document download** nahi diya (sirf status dikhta hai) — chahiye to add kar sakte hain.
