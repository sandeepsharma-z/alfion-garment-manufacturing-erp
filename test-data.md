# Test Data — har step ke liye bharne wala data

Database saaf hai. Sirf **vikram / Afion@123** (Admin), Settings aur default TNA template bache hain. Niche ka data usi order mein bharo jis order mein `flow.md` ka Quick Start hai. Har table ek form hai; column = form ka field.

Numbering apne aap milegi: pehla sample **SMP-319**, pehla order **AFI-1043**, pehla PO **PO-2296**, pehla challan **JW-0775**, pehli invoice **AFI/EXP/2026-27/0183**.

> Pura reset dobara karna ho: `cd backend` → `npm run reset -- --yes` (pehle `npm run backup`). Purana demo data wapas chahiye: `npm run restore -- --dir backups/2026-09-16T11-13-39 --yes`.

---

> **Sept 2026 update:** naye forms (buyer order, colour grid, POM, cutting report, WIP, measurement, needle/blade, multi-line invoice, boxes) ka data sabse neeche **Part H** mein hai — `flow.md` Part H ke saath chalao.

## Part A — Setup · login `vikram`

### Step 1 · Settings → Company
| Field | Value |
|---|---|
| Legal Name | Afion International Pvt. Ltd. |
| IEC | 0512345678 |
| GSTIN | 09AAACA1234A1Z5 |
| Base Currency | INR |
| Financial Year | 2026-27 |
| Registered Address | A-12, Sector 63, Noida, Uttar Pradesh 201301 |
| Phone | +91 120 4567890 |
| Email | merchandising@afion.in |
| Letterhead | koi bhi PNG/JPG logo (optional) |

### Step 2 · Settings → Stores & Procurement / Production
| Field | Value |
|---|---|
| PO approval limit (₹) | 500000 |
| Default port of loading | Nhava Sheva (INNSA1) |
| Godowns | already hain (Rack A, Rack B, Rack C, Bin D, Bin E, Yard F, Unit 2 — Greater Noida) — rehne do |
| Lines | already hain (Line 1 … Line 8, Cutting Table 1, Cutting Table 2, Packing Hall) — rehne do |
| Daily target per line | 800 |

### Step 3 · TNA → Stages
Default 9 rehne do (Samples → Materials → Cutting → Stitching → Finishing → Packing → Inspection → Dispatch → Payment). Change karna ho to baad mein.

### Step 4 · Users & Roles — **already seeded** (`npm run seed:users`), sab ka password `Afion@123`
Yeh 6 users ban chuke hain; Users & Roles page pe dekh lo. Naya user banana ho to isi table jaisa data bharo.
| Full Name | User ID | Role | Extra flags tick karo |
|---|---|---|---|
| Saurav Mishra | saurav | Merchandising Head | See buyer identity · See FOB / material rates · Approve cutting patterns · Replan TNA |
| Neha Gupta | neha | Sampling Incharge | (none) |
| Meena Kapoor | meena | Store Manager | (none) |
| Ravi Kumar | ravi.gate | Gate Man | (none) |
| Amit Prasad | amit | Production Manager | See vendor identity |
| Sunita Rao | sunita | Accounts | See FOB / material rates · Financial reports · Add / renew compliance · See confidential compliance |

Phone `+91 98100 0000x` already bhara hai. Reset ke baad dobara chahiye ho: `cd backend` → `npm run seed:users`.

---

## Part B — Masters

### Step 5 · Buyers → Add Buyer · login `saurav`
| Brand | Legal Entity | Country | Currency | Payment Terms | Contact | Role | Email | Phone |
|---|---|---|---|---|---|---|---|---|
| Zara Home | Inditex S.A. | Spain | EUR | LC 60 days from BL | Marta Ruiz | Sourcing Manager | marta.ruiz@inditex.example | +34 600 123 456 |
| H&M | H & M Hennes & Mauritz GBC AB | Sweden | EUR | T/T 30% advance, 70% against documents | Erik Lund | Merchandiser | erik.lund@hm.example | +46 70 123 4567 |
| Next | Next Retail Ltd | United Kingdom | GBP | LC at sight | Claire Hall | Buyer | claire.hall@next.example | +44 7700 900123 |

Address: `Avenida de la Diputación, Arteixo` / `Mäster Samuelsgatan 46, Stockholm` / `Desford Road, Enderby, Leicester`. Milenge alias B-01, B-02, B-03.

### Step 6 · Vendors & Suppliers — **already seeded** (`npm run seed:vendors`) · login `amit` dekhne ke liye
Yeh 5 suppliers aur 4 vendors (V-01 … V-04) ban chuke hain. Naya add karna ho to isi table jaisa data bharo.

**Add Supplier** (material dene wale)
| Supplier Name | Category | Location | GSTIN | Payment Terms | Lead Time (days) | Contact | Phone |
|---|---|---|---|---|---|---|---|
| Vardhman Textiles | Fabric | Ludhiana | 03AABCV1234A1Z5 | 30 days credit | 21 | Rajesh Bansal | +91 98150 11111 |
| Shree Rayon Mills | Fabric | Surat | 24AABCS5678B1Z2 | 45 days credit | 18 | Hitesh Patel | +91 98250 22222 |
| Precision Labels | Accessory | Noida | 09AABCP9012C1Z9 | 30 days credit | 7 | Pooja Verma | +91 98110 33333 |
| Kwality Buttons | Accessory | Delhi | 07AABCK3456D1Z4 | 15 days credit | 5 | Sanjay Jain | +91 98100 44444 |
| Packwell Industries | Packing | Greater Noida | 09AABCP7890E1Z1 | 30 days credit | 4 | Neeraj Singh | +91 98180 55555 |

**Add Vendor** (job work karne wale)
| Vendor Name | Process Category | Location | GSTIN | Rate | Daily Capacity | On-Time % | Rating | Contact | Phone |
|---|---|---|---|---|---|---|---|---|---|
| Rangoli Prints | Printing | Noida Phase 2 | 09AABCR1111F1Z3 | ₹18 / pc | 5,000 pcs/day | 92 | 4.2 | Irfan Khan | +91 98710 66666 |
| Stitch Art Embroidery | Embroidery | Sahibabad | 09AABCS2222G1Z6 | ₹25 / pc | 3,000 pcs/day | 88 | 4.0 | Kavita Sharma | +91 98730 77777 |
| Bluewash Laundry | Washing | Greater Noida | 09AABCB3333H1Z8 | ₹12 / pc | 8,000 pcs/day | 95 | 4.5 | Deepak Yadav | +91 98990 88888 |
| Precision Cutting Co. | Cutting | Noida Sector 58 | 09AABCP4444J1Z0 | ₹6 / pc | 6,000 pcs/day | 90 | 4.1 | Manoj Tiwari | +91 98910 99999 |

Milenge alias V-01 … V-04.

### Step 7 · Stock & Inventory → Add Material — **already seeded** (`npm run seed:materials`, 17 Sept 2026) · login `meena` dekhne ke liye
Yeh 14 materials opening stock, supplier, **item type / MOQ / lead days** ke saath ban chuke hain (neeche ki table + Pocketing FAB-0160, Fusing FAB-0170, JAN sticker ACC-0251, Carton sticker PKG-0310). Naya add karna ho to isi table jaisa data bharo.

| Code | Material Name | Category | UOM | Rate (₹) | Opening Qty | Reorder Level | Godown | Supplier | Specification |
|---|---|---|---|---|---|---|---|---|---|
| FAB-0121 | Cotton Poplin 60x60 Optical White | Fabric | mtr | 148 | 4000 | 5000 | Rack A | Vardhman Textiles | 118 gsm, 58" width |
| FAB-0134 | Rayon 14kg Printed Indigo | Fabric | mtr | 132 | 2500 | 3000 | Rack B | Shree Rayon Mills | 14 kg, 44" width |
| FAB-0155 | Denim 6.5oz Mid Blue | Fabric | mtr | 210 | 0 | 2000 | Rack C | Vardhman Textiles | 6.5 oz, 58" width |
| ACC-0208 | Poly Button 18L White | Accessory | pcs | 0.80 | 60000 | 50000 | Bin D | Kwality Buttons | 4-hole, 18 ligne |
| ACC-0214 | Woven Brand Label | Accessory | pcs | 2.60 | 15000 | 15000 | Bin D | Precision Labels | 40 × 12 mm |
| ACC-0219 | Care & Size Label Set | Accessory | pcs | 1.40 | 15000 | 15000 | Bin D | Precision Labels | printed satin |
| ACC-0223 | Hang Tag + String | Accessory | pcs | 3.10 | 8000 | 10000 | Bin E | Precision Labels | 300 gsm board |
| ACC-0240 | Sewing Thread 40/2 White | Accessory | cone | 95 | 400 | 300 | Bin E | Kwality Buttons | 5000 m cone |
| PKG-0305 | Poly Bag 12x16 LDPE | Packing | pcs | 1.20 | 10000 | 20000 | Yard F | Packwell Industries | 50 micron |
| PKG-0301 | Export Carton 60x40x40 | Packing | pcs | 68 | 300 | 400 | Yard F | Packwell Industries | 5-ply, 24 pcs |

Rate column tabhi dikhega jab *See rates* flag ho (meena ke paas nahi hai — vikram se bharo ya blank chhodo).

---

## Part C — Sampling → Order · login `saurav`

### Step 8 · Sample Development → New Sample Request (2 samples banao)

**Sample 1**
| Field | Value |
|---|---|
| Buyer | Zara Home |
| Style No | AF-2451 |
| Sample Type | Proto Sample |
| Product Description | Men Oxford Shirt Long Sleeve |
| Size Range | S – 3XL |
| Target Send Date | aaj + 7 din |
| Priority | High |
| Piece 1 | photo: koi bhi shirt ki image · Piece/description: Long sleeve shirt, button-down collar · Fabric type: Cotton Poplin 60x60 · Qty: 2 · Colour: Optical White · Sizes: M, L |
| Piece 2 | photo optional · Piece/description: Same shirt, short sleeve variant · Fabric type: Cotton Poplin 60x60 · Qty: 1 · Colour: Sky Blue · Sizes: L |
| Accessories | 12 × Poly Button 18L, woven brand label, care & size label set, hang tag + string |
| Buyer Comments | Collar stand 3 cm, single chest pocket, box pleat at back yoke |
| Spec sheet | buyer ka tech pack PDF (optional) |
| Courier method | DHL Express |
| Receiver at buyer | Marta Ruiz, Arteixo |

**Sample 2**
| Field | Value |
|---|---|
| Buyer | H&M |
| Style No | AF-2447 |
| Sample Type | Fit Sample |
| Product Description | Ladies Rayon Printed Top |
| Size Range | XS – XL |
| Priority | Normal |
| Piece 1 | Piece/description: Printed top, 3/4 sleeve · Fabric type: Rayon 14kg Printed · Qty: 3 · Colour: Indigo · Sizes: S, M, F |
| Accessories | woven brand label, care label |
| Courier method | FedEx |

### Step 9 · Mark Sent to Buyer (dono samples)
| Sample | Sent On | Courier / AWB No |
|---|---|---|
| SMP-319 (AF-2451) | aaj | DHL 7712 3345 6689 |
| SMP-320 (AF-2447) | aaj | FedEx 4412 5567 8890 |

### Step 10 · Log Buyer Feedback
| Sample | Comment | Button |
|---|---|---|
| SMP-319 | PP approved, proceed to bulk | **Approved** |
| SMP-320 | Sleeve 2 cm short, reduce neck drop | **Changes → Round 2** (next type: PP Sample) — phir Round 2 ko Sent + Approved karo |

### Step 11 · Spec Sheet
SMP-319 pe **Generate & Print** → PDF save karo (ya tech pack upload).

### Step 12 · Convert to Order
| Field | AF-2451 (Zara Home) | AF-2447 (H&M) |
|---|---|---|
| Order Quantity | 12000 | 6000 |
| Cutting Quantity | 12000 | 6000 |
| Buyer PO No | ZH-PO-77120 | HM-PO-40118 |
| FOB Price / pc (₹) | 950 | 780 |
| Ship Date | aaj + 60 din | aaj + 75 din |
| Payment Terms | Letter of Credit (LC) — 60 days | T/T — 30% advance |
| Shipment Mode | Sea | Sea |
| Priority | High | Normal |
| Size Breakdown % | S 12 · M 24 · L 28 · XL 22 · 2XL 10 · 3XL 4 | S 20 · M 30 · L 30 · XL 15 · 2XL 5 · 3XL 0 |
| Special Instructions | Poly bag each pc, 24 pcs / carton, size sticker on bag | Hanger pack, 30 pcs / carton |

Milenge **AFI-1043** aur **AFI-1044**. Order page pe TNA apne aap ban jayega.

> **Naya form (Sept 2026):** Convert dialog ab USD unit price, buyer order, size set aur colour × size grid maangta hai — is step ka naya data **Part H3** mein hai (FOB ₹ ki jagah unit price 11.40 USD @ 83.50).

---

## Part D — Material

### Step 13 · Material Planning → Define BOM · login `saurav`

> Aapka live order **AFI-1043 = style AF-001** (Men Oxford Shirt, Cotton Poplin, White, 12,000 pcs) hai — neeche AF-2451 wali table hi AF-001 pe bharo (Planning page → style AF-001, ya order page ke **Planning** button se). Part H4 ke extra columns (part FAB-A, colour blank, MOQ, required-by) optional hain.

**AF-2451 / AF-001 (Men Oxford Shirt)**
| Material | Per pc | Waste % |
|---|---|---|
| FAB-0121 Cotton Poplin | 1.62 | 5 |
| ACC-0208 Poly Button | 12 | 3 |
| ACC-0214 Woven Brand Label | 1 | 2 |
| ACC-0219 Care & Size Label Set | 1 | 2 |
| ACC-0223 Hang Tag + String | 1 | 2 |
| ACC-0240 Sewing Thread | 0.06 | 4 |
| PKG-0305 Poly Bag | 1 | 2 |
| PKG-0301 Export Carton | 0.0417 | 1 |

**AF-2447 (Ladies Rayon Top)**
| Material | Per pc | Waste % |
|---|---|---|
| FAB-0134 Rayon Printed | 1.15 | 7 |
| ACC-0214 Woven Brand Label | 1 | 2 |
| ACC-0219 Care & Size Label Set | 1 | 2 |
| ACC-0240 Sewing Thread | 0.04 | 4 |
| PKG-0305 Poly Bag | 1 | 2 |
| PKG-0301 Export Carton | 0.0333 | 1 |

Ab AFI-1043 ke Order Stock mein dikhega: fabric required ≈ 20,412 mtr (cut qty 12,000 × 1.62 × 1.05), stock 4,000 → shortage ≈ 16,412 → PO qty (MOQ 500 se upar hai, wahi).

### Step 14 · Order page → Reserve Free Stock (dono orders)

### Step 15 · Purchase Orders · login `meena`
Order page pe **Raise N POs** dabao (shortage ka PO apne aap) — ya manually:
| Material | Supplier | Quantity | Rate (₹) | Against Order | Expected Delivery | Payment Terms | Priority |
|---|---|---|---|---|---|---|---|
| FAB-0121 | Vardhman Textiles | 17000 mtr | 148 | AFI-1043 | aaj + 21 din | 30 days credit | High |
| ACC-0208 | Kwality Buttons | 90000 pcs | 0.80 | AFI-1043 | aaj + 7 din | 15 days credit | Normal |
| PKG-0305 | Packwell Industries | 10000 pcs | 1.20 | AFI-1043 | aaj + 5 din | 30 days credit | Normal |
| FAB-0134 | Shree Rayon Mills | 5000 mtr | 132 | AFI-1044 | aaj + 18 din | 45 days credit | Normal |

FAB-0121 ka PO ₹25.16 lakh hai → *Pending Approval* → `vikram` login → PO kholo → **Approve**.

### Step 16 · Gate Entry · login `meena` (ya `ravi.gate`)
| PO | Current Received Qty | Rejected | Vehicle | Driver | Delivery Challan No | Supplier Invoice No | Inspection | Store Location | Remarks |
|---|---|---|---|---|---|---|---|---|---|
| FAB-0121 (1st lot) | 9000 | 120 | HR 55 AB 1234 | Sukhwinder Singh | VT/DC/2261 | VT-INV-4471 | Passed with deviation | Rack A | Lot VT-LOT-2261, shade A |
| FAB-0121 (2nd lot, next day) | 8000 | 0 | HR 55 AB 1234 | Sukhwinder Singh | VT/DC/2270 | VT-INV-4489 | Passed 4-point | Rack A | balance lot |
| ACC-0208 | 90000 | 0 | DL 01 CA 9988 | Ramesh | KB/DC/991 | KB-INV-1120 | Passed 4-point | Bin D | — |
| PKG-0305 | 10000 | 0 | UP 16 T 4455 | Sonu | PW/DC/318 | PW-INV-702 | Passed 4-point | Yard F | — |

Try karo: FAB-0121 pe 20000 daal ke dekho — block hoga.

---

## Part E — Production

### Step 17 · Patterns · login `neha` (approve `saurav`)
| Field | Value |
|---|---|
| Style | AF-2451 |
| Linked sample round | SMP-319 round 1 |
| Pattern maker | Neha Gupta |
| Base size | M |
| Size range | S – 3XL |
| Grading | In progress |
| Marker efficiency % | 84 |
| Priority | High |
| Approval due | aaj + 3 din |
| Remarks | Collar stand +0.5 cm as per buyer comment |

Add version: koi bhi PDF/DXF → Submit for Review → saurav: Approve → Issue v1 (Order AFI-1043, Issued to: Cutting Table 1).

### Step 18 · Job Work → New Job Work Challan · login `amit`
| Field | Challan 1 | Challan 2 |
|---|---|---|
| Against Order | AFI-1043 | AFI-1043 |
| Process | Printing | Cutting |
| Vendor | Rangoli Prints | Precision Cutting Co. |
| Material Issued | FAB-0121 Cotton Poplin | (none — pieces only) |
| Item Description | Poplin for chest print panel | Cut panels — full order |
| UOM | mtr | pcs |
| Issue Quantity | 1500 | 12000 |
| Issue Date | aaj | aaj |
| Expected Return | aaj + 6 din | aaj + 8 din |
| Priority | High | High |
| Process Instructions | Pantone 19-4052 print, 2 cm repeat | Marker eff 84%, size-wise bundles of 50 |

### Step 19 · Gate Entry (job work return)
| Challan | Current Return Qty | Rejected | Vendor Challan No | Inspection |
|---|---|---|---|---|
| JW-0775 Printing | 1480 | 20 | RP/OUT/551 | Passed 4-point |
| JW-0776 Cutting (1st) | 8000 | 25 | PC/OUT/218 | Passed 4-point |
| JW-0776 Cutting (2nd) | 4000 | 0 | PC/OUT/224 | Passed 4-point |

Pehli cutting return ke baad location *PARTIALLY IN-HOUSE (8,000 in-house / 4,000 at V-04)* dikhega.

### Step 20 · Production Floor → Log Production · login `amit` (roz ek entry)
| Day | Order | Stage | Line | Output | Rejected | Manpower | Supervisor |
|---|---|---|---|---|---|---|---|
| 1 | AFI-1043 | Stitching | Line 3 | 1450 | 18 | 38 | Farhan |
| 1 | AFI-1043 | Stitching | Line 4 | 1380 | 22 | 36 | Farhan |
| 2 | AFI-1043 | Stitching | Line 3 | 1520 | 12 | 38 | Farhan |
| 2 | AFI-1043 | Stitching | Line 4 | 1410 | 15 | 36 | Farhan |
| 3 | AFI-1043 | Finishing | Packing Hall | 2600 | 9 | 20 | Rekha |
| 4 | AFI-1043 | Packing | Packing Hall | 2400 | 0 | 14 | Rekha |

(Cutting already outsourced tha, gate return se auto complete.) Continue till 12,000 each.

### Step 21 · Quality · login `amit`

**Fabric 4-point** (FAB-0121, GRN of 1st lot)
| Field | Value |
|---|---|
| Lot no | VT-LOT-2261 |
| Metres inspected | 2000 |
| Width (inches) | 58 |
| Colour | Optical White |
| GSM | 118 |
| Defect points | Weaving: 1-pt 8, 2-pt 3, 3-pt 1 · Print/dye: 1-pt 4, 2-pt 2 · Hard stain: 1-pt 2, 4-pt 1 |
| Inspector | QC · Farhan |

**Inline & DHU** (Day 1)
| Field | Value |
|---|---|
| Order | AFI-1043 |
| Line | Line 3 |
| Type | Inline |
| Stage | Stitching |
| Pieces checked | 400 |
| Defects | BS Broken stitch 6 · SS Skip stitch 3 · UT Untrimmed thread 5 |
| Inspector | QC · Farhan |

**Mid / Final AQL**
| Field | Mid | Final |
|---|---|---|
| Order | AFI-1043 | AFI-1043 |
| Stage | Mid | Final |
| AQL level | 2.5 | 2.5 |
| Lot size | 6000 | 12000 |
| Sampling | Normal | Normal |
| Inspector / type | QC · Farhan / Internal | Anil Mehta / Buyer QA |
| Merchandiser | Saurav Mishra | Saurav Mishra |
| Cartons opened / total | 0 / 0 | 24 / 500 |
| Defects | MO 3 · ST 1 · UT 7 | MO 4 · ST 2 · UT 11 |
| Checks | sab OK | sab OK |
| Result | (auto Pass) | (auto Pass) |

### Step 22 · Packing → Set plan · login `amit`
| Order | Pcs per carton | Pack ratio |
|---|---|---|
| AFI-1043 | 24 | Ratio pack 1-2-2-1 |
| AFI-1044 | 30 | Solid size |

---

## Part F — Dispatch → Payment · login `sunita`

### Step 23 · Create Export Invoice (AFI-1043)
| Field | Value |
|---|---|
| Order | AFI-1043 |
| Invoice date | aaj |
| Shipment mode | Sea |
| Port of loading | Nhava Sheva (INNSA1) |
| Port of discharge | Barcelona (ESBCN) |
| Incoterm | FOB |
| Quantity | 12000 |
| Cartons | 500 |
| Gross weight (kg) | 6500 |
| Net weight (kg) | 5700 |
| Invoice value (₹) | 11400000 (auto: 950 × 12000) |
| Payment method | LC |
| Transporter / CHA | Speedway Logistics |
| Documents to prepare | Commercial Invoice, Packing List, E-Way Bill, Delivery Challan, Certificate of Origin |

### Step 24 · Documents
| Document | Action | Value |
|---|---|---|
| Commercial Invoice | Generate | — |
| Packing List | Generate | — |
| Delivery Challan | Generate | — |
| E-Way Bill | Number | 1234 5678 9012 |
| Certificate of Origin | Upload | koi PDF |
| Bill of Lading | Upload + Number | MEDUBB12345 |

Shipment fields: Vessel **MSC Ever Aim** · Container **MSCU 774 4521** · Seal **SL 88213** · Shipping bill **7741208** · ETA aaj + 28 din.

### Step 25 · Record event (isi order mein)
| Event | Date | Detail |
|---|---|---|
| Factory stuffing | aaj | 500 cartons, 1 × 40' HC |
| Customs clearance | aaj + 1 | LEO granted |
| Shipped on board | aaj + 3 | MSC Ever Aim, voyage 227W |
| In transit | aaj + 4 | ETA Barcelona in 24 days |
| Delivered | aaj + 28 | Received at buyer DC |

### Step 26 · Payments (invoice AFI/EXP/2026-27/0183)
Milestones: LC received & checked (LC no **LC-885003**, HSBC, ₹1.14 Cr) → Goods shipped & documents prepared → Documents negotiated at bank.

**Record Receipt**
| Field | Receipt 1 | Receipt 2 |
|---|---|---|
| Date | aaj + 35 | aaj + 62 |
| Amount (₹) | 5000000 | 6400000 |
| FX rate | 90.40 | 90.85 |
| Bank | HSBC EEFC | HSBC EEFC |
| BRC / FIRC ref | BRC/26/0091 | BRC/26/0118 |
| Charges | 4200 | 3800 |

Dusri receipt ke baad status *Received*.

### Step 27 · Order page → Close Order

---

## Part G — Baaki

### Step 28 · Buyer Tracking Link (AFI-1043)
PIN **4321**, valid 90 days → New link → copy → `/track/CODE` browser mein kholo.

### Compliance → Add Document · login `sunita`
| Title | Category | Authority | Number | Issue date | Expiry | Owner | Confidential |
|---|---|---|---|---|---|---|---|
| Factory Licence | Company licence | Directorate of Factories, UP | FL/GBN/2019/4471 | 2025-10-01 | aaj + 40 din | Sunita Rao | no |
| Fire NOC | Company licence | UP Fire Services | FNOC/NOI/2025/0912 | 2025-09-01 | aaj − 10 din (expired) | Sunita Rao | no |
| Marine Open Cover Policy | Insurance | New India Assurance | NIA/MOC/26/55821 | 2025-10-01 | aaj + 12 din | Sunita Rao | no |
| SEDEX SMETA 4-pillar | Certification | Intertek | SMETA-2026-IN-7712 | 2026-07-01 | aaj + 300 din | Saurav Mishra | no |
| Bank Sanction Letter — Packing Credit | Bank / IEC / GST | HSBC | HSBC/PC/2026/117 | 2026-08-15 | aaj + 90 din | Sunita Rao | **yes** |
| Format AFN/10 — 4-point fabric inspection | Format / Template | Afion QA | AFN/10 | — | — | Amit Prasad | no |

Fire NOC pe *Renewal in progress* tick karo → Alert Center mein expiry alerts dikhenge.

### Settings → Form Fields (optional try)
Sample Request form pe ek extra field: Label **Wash type**, Type **Dropdown**, Options `Garment wash, Enzyme, Stone, None`, Required tick → Save Changes → New Sample Request mein niche *Additional details* mein dikhega.

---

## Part H — Naye forms ka data (client formats, Sept 2026) · `flow.md` Part H ke saath

Upar ke steps waise hi chalte hain; niche sirf **naye fields / naye forms** ka data hai. Jahan "Step N" likha hai, woh upar wale step ke saath bharna hai.

### H1 · Settings (Step 1 ke saath) · login `vikram`
| Tab | Field | Value |
|---|---|---|
| Company | GSTIN | 06AAACA1234A1Z5 (apna asli daalo) |
| Company | IEC | 0512345678 |
| Company | AD code | 0510012-3400009 |
| Production | Cutting extra % | 5 |
| Production | Size sets | pehle se: S – 3XL, XS – XL, Japan M – 3L, Japan S – LL, Free size, Kids 2 – 10Y, Numeric 34 – 44 — ek line add karo: `Japan S – 3L: S, M, L, LL, 3L` |
| Production | Approvals board rows | default list rakho |
| Export & Portal | Order / invoice currency | USD |
| Export & Portal | Exchange rate (₹ per unit) | 83.50 |
| Export & Portal | IGST % | 5 |
| Export & Portal | Format numbers | default (AFN/10, 11, 13, 14, 15, 17, 19, 19A, 21, 22, 40, 05, 06) |

### H2 · Sample tools (Step 10 ke baad, SMP-319 / AF-2451 pe) · login `saurav`

**POM** (size set S – 3XL, unit cm)
| Code | Point of measure | S | M | L | XL | 2XL | 3XL | Tol ± |
|---|---|---|---|---|---|---|---|---|
| A | Body length from HPS | 72 | 74 | 76 | 78 | 80 | 82 | 1 |
| B | Chest 1" below armhole | 52 | 55 | 58 | 61 | 64 | 67 | 1 |
| C | Shoulder across | 44 | 45.5 | 47 | 48.5 | 50 | 51.5 | 0.5 |
| D | Sleeve length | 62 | 63 | 64 | 65 | 66 | 67 | 0.5 |
| E | Collar (buttoned) | 39 | 40 | 41 | 42 | 43 | 44 | 0.5 |
(Sirf S aur M bharo → **Auto-grade** baaki bhar dega.)

**Measure** (Round 1, size L)
| POM | Measured | Buyer instruction |
|---|---|---|
| A | 77.5 | reduce body length by 1.5 cm |
| B | 58.2 | OK |
| C | 47 | OK |
| D | 63 | increase sleeve 1 cm |
| E | 41.2 | OK |
Due date: aaj + 7 · Pcs per colour: 2 · Actual sent on: aaj · Comments received: aaj + 5 → **Save** → **Print comment sheet**.

**Approvals**
| Item | Due | Pcs/col | Received (factory) | Submitted | AWB | Approved | Status |
|---|---|---|---|---|---|---|---|
| Lab dip | aaj + 3 | — | aaj + 2 | aaj + 3 | DHL 7712 3345 6701 | aaj + 8 | Approved |
| Print strike-off | aaj + 10 | — | — | — | — | — | Pending |
| Trim card | aaj + 12 | — | — | — | — | — | Pending |
| PP Sample | aaj + 15 | 2 | — | — | — | — | Pending |
| TOP Sample | ship date − 10 | 1 | — | — | — | — | Pending |
(Baaki rows default rakho. Lab dip **Approved** karte hi AFI-1043 ki TNA "Lab dip approval" Done hogi.)

**Tech pack**
| Field | Value |
|---|---|
| Composition | 100% cotton poplin 60×60, 118 GSM |
| Lining | No |
| Article / buyer item no | ZH-24-OXF-01 |
| Construction notes | French seams at side, 14 SPI, box pleat at back yoke, 1/4" top-stitch at collar |
| Label placement | Main label CB neck; care label left side seam 10 cm above hem; size label under main label |
| Packing method | Flat pack, 1 pc / poly bag, 24 pcs / carton solid colour solid size |
| Accessories per pc | Poly button 18L × 12 · Main label × 1 · Care label × 1 · Size label × 1 · Hang tag × 1 · Poly bag × 1 |

### H3 · Buyer Order + Convert (Step 12 ki jagah) · login `saurav`

**Buyer Orders & Shipping → New Buyer Order**
| Field | Zara Home | H&M |
|---|---|---|
| Buyer PO / purchase-note no | ZH-PO-77120 | HM-PO-40118 |
| Order date | aaj | aaj |
| Season | AW-26 | SS-27 |
| Currency | USD | USD |
| Exchange rate | 83.50 | 83.50 |
| Payment terms | Letter of Credit (LC) — 60 days | T/T — 30% advance |
| Incoterm | FOB | FOB |
| Latest shipment | aaj + 60 | aaj + 75 |
| Delivery date | aaj + 90 | aaj + 105 |
| Sales month | 4 mahine baad ka | 5 mahine baad ka |

**Convert to Order — AF-2451 (Zara Home)** — Buyer order: ZH-PO-77120 · Currency USD · Unit price **11.40** · First quoted price **12.00** · Exchange rate 83.50 (₹ FOB ≈ 951.90) · Ship date aaj + 60 · Buyer target aaj + 55 · Delivery aaj + 90 · Payment terms LC 60 days · Mode Sea · Priority High · Cutting extra 5 · Size set **S – 3XL**
| Colour code | Colour | S | M | L | XL | 2XL | 3XL | Total |
|---|---|---|---|---|---|---|---|---|
| ZH-101 | Optical White | 840 | 1680 | 1960 | 1540 | 700 | 280 | 7000 |
| ZH-207 | Sky Blue | 600 | 1200 | 1400 | 1100 | 500 | 200 | 5000 |
→ order qty **12,000**, cut **12,600**. Special instructions: Poly bag each pc, 24 pcs / carton, size sticker on bag.

**Convert to Order — AF-2447 (H&M)** — Buyer order: HM-PO-40118 · Unit price **9.35** · First price 9.80 · Size set **XS – XL** · colour grid:
| Colour code | Colour | XS | S | M | L | XL | Total |
|---|---|---|---|---|---|---|---|
| 4310 | Indigo | 600 | 1200 | 1800 | 1500 | 900 | 6000 |
→ **AFI-1043**, **AFI-1044** (numbering same).

**Revise (Step 12a, AFI-1043 pe, kabhi bhi)** — ZH-207 Sky Blue L: 1400 → **1600**, unit price 11.40 → **11.25**, reason: `Buyer PN rev 1 dated <aaj>: +200 Sky Blue L, price revised` → Rev 1. Cutting planned qty 12,810 dikhega.

### H4 · Material (Step 6 / 13 / 17 ke saath)

**Material master — extra fields (Step 6)**
| Code | Item type | MOQ | Lead days |
|---|---|---|---|
| FAB-0134 | Main fabric (FAB-A) | 500 | 21 |
| FAB-0135 | Main fabric (FAB-A) | 500 | 21 |
| ACC-0208 | Button | 20000 | 5 |
| ACC-0214 | Main label | 5000 | 7 |
| PKG-0305 | Poly bag | 10000 | 4 |
| PKG-0301 | Carton | 500 | 4 |

**BOM extra row (Step 13, AF-2451)**
| Material | Part | Colour | Per size | MOQ | Required by |
|---|---|---|---|---|---|
| FAB-0134 (white poplin) | FAB-A | ZH-101 | S 1.55 · M 1.62 · L 1.70 · XL 1.78 · 2XL 1.86 · 3XL 1.94 | 500 | aaj + 20 |
| FAB-0135 (blue poplin) | FAB-A | ZH-207 | wahi | 500 | aaj + 20 |
| ACC-0208 buttons | — | (blank = sab) | — | 20000 | aaj + 25 |
| baaki lines | — | (blank) | — | — | aaj + 30 |
Order page → Order Stock: requirement colour-wise (white 7000 → cut 7350 pcs ka fabric; blue alag), **To order = max(shortage, MOQ)**.

**Gate Entry — Fabric lots (Step 17, FAB-0134 ke PO pe)**
| Lot no | Colour | Thans | On-tag length | Actual length | On-tag width | Actual width | GSM |
|---|---|---|---|---|---|---|---|
| DL-4471 | Optical White | 8 | 420 | 412.5 | 58 | 57.5 | 118 |
| DL-4472 | Optical White | 7 | 380 | 380 | 58 | 58 | 119 |
| DL-4473 | Optical White | 9 | 450 | 447 | 58 | 57.75 | 118 |
→ Received qty apne aap **1239.5** m. Order page **Fabric WIP** mein teen lots dikhenge.

### H5 · Production (Step 21–22 ke saath) · login `amit`

**Cutting report (Production Floor → Cutting report), AFI-1043**
| Field | Day 1 | Day 2 |
|---|---|---|
| Colour | Optical White | Optical White |
| Fabric / Lot no | FAB-0134 / DL-4471 | FAB-0134 / DL-4472 |
| Thans / Width / Layers | 4 / 57.5 / 60 | 4 / 58 / 60 |
| Fabric issued / consumed (m) | 210 / 205.4 | 190 / 186.2 |
| End bits (m) | 3.1 | 2.6 |
| Size-wise cut | S 40 · M 60 · L 20 | S 0 · M 20 · L 60 · XL 40 |
| Table / Cutter | Cutting Table 1 / Ramesh | Cutting Table 1 / Ramesh |
→ CUT-0001, CUT-0002; Cutting stage 240 pcs; fabric ledger mein `issue_prod`.

**Log Production — Stitching (Step 22, roz)**
| Field | Value |
|---|---|
| Order / Stage / Line | AFI-1043 / Stitching / Line 3 |
| Colour | Optical White |
| Loaded on line | 240 |
| Hourly output | 09-10: 25 · 10-11: 30 · 11-12: 30 · 12-13: 28 · 14-15: 32 · 15-16: 30 · 16-17: 25 (→ output 200 apne aap) |
| Rejection / Manpower / Supervisor | 3 / 32 / Amit Prasad |
→ **Stitching WIP** tab: cut 240 · loaded 240 · output 200 · WIP 40 · cutting in stock 0.

**Loading plan** (cell click karo): kal · Line 3 · Stitching · AFI-1043 · Optical White · target **800**; kal · Line 4 · Stitching · AFI-1043 · Sky Blue · target 800; parso · Cutting Table 1 · Cutting · AFI-1044 · Indigo · target 1200.

### H6 · Quality (Step 23–25 ke saath) · login `amit`

**Fabric 4-point — extra (Step 23)**: Thans 8 · On-tag length 420 · On-tag width 58 · Check-in date aaj · Points per **100 sq yards**.

**Measurement inspection (Quality → Measurement)** — AFI-1043 · Final · size L · Optical White
| POM | Pc 1 | Pc 2 | Pc 3 | Pc 4 | Pc 5 |
|---|---|---|---|---|---|
| A Body length (spec 76 ± 1) | 76.2 | 75.8 | 76.5 | 77.4 | 76.0 |
| B Chest (58 ± 1) | 58.0 | 58.4 | 57.6 | 58.2 | 58.1 |
| C Shoulder (47 ± 0.5) | 47.0 | 47.2 | 46.8 | 47.1 | 47.6 |
| D Sleeve (64 ± 0.5) | 64.0 | 64.2 | 63.9 | 64.1 | 64.0 |
→ C fail (47.6), baaki pass → **MI-0001 Fail**. Dobara sahi values se **MI-0002 Pass** banao.

**Broken needle (Quality → Needle & blade → Record)**
| Date/time | Line | Machine | Operator | Order | Needle | Parts recovered | Detector | New issued |
|---|---|---|---|---|---|---|---|---|
| aaj 10:40 | Line 3 | SN-14 | Sita Devi | AFI-1043 | DB×1 / 11 | point, shank, middle (eye missing) | Yes | Yes |
| aaj 15:10 | Line 4 | SN-22 | Rekha | AFI-1043 | DB×1 / 14 | sab | No | Yes |

**Blade register (Entry)**: Cutting blade · Received 10 → Cutting blade · Issued 3 · Broken 1 · Issued to Cutting Table 1 → balance 7. Band knife · Received 4.

**Final AQL extra (Step 25)**: PO qty 12000 · PO date = order date · Already shipped 0 · Reference no ZH-INSP-2026-118.

### H7 · Invoice + packing (Step 26–27 ki jagah) · login `sunita`

**Create Export Invoice** — Buyer **Zara Home** → line tick: AFI-1043 · Ship qty **6000** (partial) · Unit price 11.25 · HS code **62052000**
| Field | Value |
|---|---|
| Invoice date / Mode | aaj / Sea |
| Port of loading / discharge / final destination | Nhava Sheva (INNSA1) / Barcelona (ESBCN) / Arteixo |
| Incoterm / Pre-carriage / Place of receipt | FOB / By road / Gurgaon |
| Payment method / L/C no / L/C date | LC / LC-ZH-2026-0917 / aaj − 20 |
| Exchange rate / IGST % | 83.50 / 5 |
| Cartons / Gross / Net | 250 / 3750 / 3500 |
| Transporter | Om Logistics |
| Consignee | Zara Home — Industria de Diseño Textil S.A., Avenida de la Diputación, Arteixo, Spain |
| Notify party | Same as consignee |
| Reverse charge | No |
→ `AFI/EXP/2026-27/0183`: lines table USD 67,500.00 · ₹ 56,36,250 · IGST ₹ 2,81,813 · total ₹ 59,18,063 · words dono.

**Box-wise packing (invoice ke andar)**: pcs/ctn **24** · gross **15** · net **14** · dims **60×40×40** → **Auto boxes** → ~250 cartons (colour × size solid) → **Save packing** → **Carton marks** print (JAN daalna ho to order **Revise** → grid ke neeche JAN cell: ZH-101 / M = `8412345001012` …).
**Documents**: Commercial Invoice, Packing List, Carton Marks, Delivery Challan, COO → Generate. **Shipped on board**: vessel MSC Aurora · B/L MSCU-778812 · ETA aaj + 28.

**Dusra shipment (balance 6000)**: Create Export Invoice → Zara Home → AFI-1043 tick (qty default 6000) → cartons 250 → `…/0184`. **Buyer Orders & Shipping → Shipping track**: AFI-1043 · Ship 1 6,000 (0183 · MSCU-778812) · Ship 2 6,000 (0184) · balance 0 · On time.
