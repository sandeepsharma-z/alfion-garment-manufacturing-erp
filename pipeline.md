# Afion ERP — Pipeline: Sample se Payment tak

Yeh file un logon ke liye hai jinhe project ke baare mein kuch nahi pata. Ek garment order factory mein kaise chalta hai, software usko kaise track karta hai, aur har step pe kaun sa form banta hai.

## Ek nazar mein

```
Buyer ne style bheja
   │
   ▼
 SAMPLE  ──sent──▶ buyer feedback ──approved──▶ SPEC SHEET ──▶ ORDER (AFI-####)
   (POM measurements · approvals board: lab dip / strike-off / trim card)      │   (buyer order header + colour × size grid, USD price)
        ┌──────────────────────────────────────────────────────────┘
        ▼
 BOM (kya kya material lagega) ──▶ RESERVE stock ──▶ PO (kharido) ──▶ GATE ENTRY (maal aaya, GRN)
        │
        ▼
 PATTERN ──▶ JOB WORK (bahar se kaam: print/embroidery/dyeing) ──▶ gate se wapas
        │
        ▼
 PRODUCTION (Cutting report → Stitching WIP → Finishing → Packing · loading plan)  +  QUALITY (4-point, DHU, measurement, Final AQL, needle/blade)
        │
        ▼
 PACKING plan ──▶ EXPORT INVOICE (multi-style, USD + INR + IGST) + box-wise packing list + carton marks ──▶ SHIPPED (ship-1 … n) ──▶ PAYMENT (LC / TT) ──▶ CLOSE
```

Poore raste mein **TNA** (Time & Action) har step ki date track karta hai, **Control Tower** order page pe 12 gates dikhata hai, aur buyer ko ek **tracking link** milta hai jisse woh apna order dekh sakta hai.

---

## Roles — kaun kya karta hai

| Kaun | Software mein role | Kaam |
|---|---|---|
| Admin (vikram) | Admin | Settings, users, sab kuch |
| Merchandiser (saurav) | Merchandising Head | Buyer, sample, order, BOM, TNA |
| Sampling (neha) | Sampling Incharge | Sample banana, pattern |
| Store (meena) | Store Manager | Material, PO, gate entry |
| Gate (ravi.gate) | Gate Man | Sirf gate entry |
| Production (amit) | Production Manager | Job work, floor, quality, packing |
| Accounts (sunita) | Accounts | Invoice, documents, payment, compliance |

---

## Stage 1 — Sample (buyer ko dikhana ki hum bana sakte hain)

**Kya hota hai:** Buyer ek style bhejta hai (tech pack). Hum sample banate hain, buyer ko courier karte hain, buyer haan/na bolta hai.

**Forms:**
1. **New Sample Request** (Sample Development page) — buyer, style number, sample type (Proto / Fit / Revised Fit / Size Set / PP / Exhibition / Salesman / Photoshoot / SMS / TOP), description, har piece ki **photo + fabric + colour + sizes**, accessories, tech pack PDF, courier details. → `SMP-###` banta hai.
2. **Mark Sent to Buyer** — sent date, AWB number.
3. **Log Buyer Feedback** — comment + ek button: **Approved** / **Changes** (next round shuru) / **Rejected**.
4. Sample card ke neeche 4 chhote buttons (style ke liye, ek baar):
   - **POM** — measurement spec: har point of measure (body length, chest…) ka size-wise spec + tolerance.
   - **Measure** — is round ka measured value vs spec, buyer ka instruction per POM; **Print comment sheet**.
   - **Approvals** — lab dip / print strike-off / embroidery / wash / shade band / trim card / FPT-GPT / sample kinds ka board: due, received, submitted, AWB, approved, comments, status. Approved karte hi order ki TNA activity done.
   - **Tech pack** — composition, lining, article, construction, label placement, packing method, buyer ka accessory list per piece (spec sheet pe print hota hai).

**Result:** sample *Approved* hone ke baad hi aage ka rasta khulta hai.

---

## Stage 2 — Spec Sheet aur Order

**Kya hota hai:** Approved sample ki final specification bante hai, phir buyer ka confirmed order system mein aata hai.

**Forms:**
1. **Spec Sheet** (approved sample pe) — *Generate & Print* (system letterhead pe banata hai) ya buyer ki PDF *Upload*. Versioned.
2. **Buyer Order** (Buyer Orders & Shipping page, optional) — buyer ka purchase note header: PO no, date, season, currency (USD), exchange rate, terms, incoterm, latest shipment, delivery date, sales month. Ek header ke neeche kai style lines.
3. **Convert to Order** — buyer order choose karo (ya single), currency + **unit price (USD)** + first price + exchange rate (₹ FOB apne aap), ship date / buyer target / delivery date, **size set** (S–3XL, Japan M–3L, Free, kids…), **colour × size grid** (buyer colour code, colour name, size-wise qty, JAN barcode) — cut qty = qty + extra % (Settings). Colour rows na ho to purana total qty + size % bhi chalta hai.
4. Baad mein badlav = **Revise** (order page) — qty/colours/price/dates/cancelled qty + reason → revision 1, 2, 3… history ke saath; production ka planned qty apne aap update.

**Result:** order `AFI-####` ban gaya. Uske saath automatically:
- **TNA plan** ban gaya (har activity ki planned date, ship date se peeche ginti karke)
- **Control Tower** khul gaya (12 gates: Order, Sample, Spec, Material, Procurement, Job Work, Cutting, Stitching, Finishing, Packing, Dispatch, Payment)
- Order page pe **Buyer Tracking Link** bana sakte ho

---

## Stage 3 — Material (kya lagega, kitna hai, kitna kharidna hai)

**Kya hota hai:** Har style ka BOM (bill of materials) batata hai 1 piece mein kitna fabric, kitne button, label, poly bag lagega. System order quantity se total nikalta hai, stock se milata hai, aur shortage batata hai.

**Forms:**
1. **Define BOM** (Material Planning) — material, per piece consumption, waste %; har line pe **part** (FAB-A/B/C), **colour** (blank = sab colours), **per-size consumption**, **MOQ**, **required-by date**. Requirement cutting qty pe, colour aur size-wise; to-order = max(shortage, MOQ). Material master mein **item type** (client ki 47-item list), MOQ, lead days.
2. **Reserve Free Stock** (order page pe button) — jo stock pehle se hai woh is order ke naam lock ho jata hai.
3. **Raise POs** (order page) ya **New Purchase Order** — material, supplier, quantity, rate, expected delivery. → `PO-####`. Limit se upar ho to *Pending Approval*, approve flag wala **Approve** karta hai.

**Result:** order page ka **Order Stock** table: Required · Reserved · Free · On Order · Shortage · To Order. Control Tower ke Material aur Procurement gates green.

---

## Stage 4 — Gate Entry (maal factory mein aaya)

**Kya hota hai:** Supplier ka truck aaya. Gate pe entry hoti hai, tab hi stock badhta hai. Stock badhane ka aur koi rasta nahi.

**Form:**
- **Gate Entry** — pending PO choose karo, current received qty, rejected qty, vehicle, driver, challan no, invoice no, inspection result, godown, photo → **Confirm**. Fabric ho to **Fabric lots** rows: lot no, colour, thans, on-tag vs actual length/width, GSM — received qty = Σ actual. Order page pe **Fabric WIP** card: required → ordered → received lot-wise → rejected/hold → balance.

**Rules:**
- pending se zyada receive nahi kar sakte (block)
- har confirm = `GRN-####` + stock ledger mein entry + PO status *Partially / Fully Received*
- Gate Man ko simple bada screen milta hai

---

## Stage 5 — Pattern aur Job Work (bahar ka kaam)

**Pattern:** Sampling **New Pattern** banata hai, file versions upload karta hai, **Submit for Review**; merchandiser **Approve** karta hai; phir cutting ko **Issue**.

**Job Work:** Jo kaam factory mein nahi hota (printing, embroidery, dyeing, washing, kabhi kabhi cutting/stitching bhi) woh vendor ko jata hai.

**Forms:**
1. **New Job Work Challan** — order, process, vendor, kaunsa material/pieces, quantity, expected return → `JW-####`, **Print Challan** (GST non-sale challan).
2. Wapas aane pe **Gate Entry** hi hoti hai (challan pending list mein dikhta hai).

**Result:** system khud batata hai maal kahan hai — *OUTSOURCED* (sab bahar) / *PARTIALLY IN-HOUSE* (kuch wapas) / *IN-HOUSE* (sab wapas). Vendor ke paas kitna pending hai = bheja − wapas aaya.

---

## Stage 6 — Production (factory floor)

**Kya hota hai:** Cutting → Stitching → Finishing → Packing, isi order mein. Roz ka output log hota hai.

**Forms (Production Floor ke 4 tabs):**
- **Cutting report** (AFN/11) — order, colour, fabric + lot no, thans, width, layers, fabric issued/consumed, **size-wise cut pcs**, table, cutter → `CUT-####`; Cutting stage apne aap aage, fabric stock se issue.
- **Log Production** — order, stage, line, colour, date, **loaded** (stitching input), output qty, rejected, manpower, optional **hourly output** grid (AFN/40).
- **Stitching WIP** (AFN/14) — order × colour: cut · loaded · output · WIP on line · cutting in stock · balance. Print.
- **Loading plan** — date × line grid: kaunsa order/colour kis line pe, target vs actual (logs se).
- **Plan** (optional) — stage in-house hai ya outsourced, kaunsi line, ya blocked with reason.

**Result:** order ka **progress %** aur **stage** apne aap aage badhta hai. TNA ke cutting/stitching/finishing/packing activities apne aap done. Board pe line-wise output, efficiency, idle lines.

---

## Stage 7 — Quality (teen jagah check)

**Forms (Quality page ke paanch tabs):**
1. **Fabric 4-point** (AFN/10) — fabric aate hi: metres, width, thans, on-tag vs actual, defect points (0–3" = 1 … >9" = 4) → points/100 sq m **ya** sq yd → Pass/Fail. Fail = woh fabric hold pe.
2. **Inline & DHU** — line pe roz: pieces checked, defect counts → DHU %. Limit se upar = alert.
3. **Mid / Final AQL** (AFN/21) — lot size, PO qty/date, already shipped, ref no; system sample size aur accept number batata hai, defects ginno → found vs allowed → Pass / Fail / Hold.
4. **Measurement** (AFN/22) — order + size choose karo, POM spec apne aap, 5 pieces ke measurements → tolerance ke bahar = red, Pass/Fail. Print.
5. **Needle & blade** — broken needle register (AFN/17: machine, operator, parts recovered, detector check) aur blade register (AFN/13: received/issued/broken/balance).

**Rule:** **Final AQL Pass** ke bina export invoice nahi ban sakta.

---

## Stage 8 — Packing

**Form:** **Set plan** (Packing page) — pcs per carton, pack ratio → cartons apne aap = qty ÷ pcs per carton. Poly bag / carton short ho to yahin se **Reorder**. Box-wise (carton × style × colour × size) list invoice ke andar banti hai (Stage 9).

---

## Stage 9 — Dispatch (maal nikla, documents bane)

**Kya hota hai:** Export invoice banta hai, documents taiyar hote hain, container/flight track hota hai.

**Forms:**
1. **Create Export Invoice** — buyer choose karo, uske open style lines **tick** karo (partial qty allowed — balance agle shipment ke liye khula rehta hai), HS code, unit price (USD), exchange rate, **IGST %** (0 = LUT), incoterm (FOB/CFR/CIF/CPT/DAP…), L/C no + date, consignee, notify party, pre-carriage, place of receipt, final destination, cartons, weights → `AFI/EXP/FY/####`. System line-wise USD amount, INR taxable, IGST, total aur **amount in words** (USD + ₹) nikalta hai.
2. Invoice ke andar **Box-wise packing**: **Auto boxes** (colour × size grid + pcs/carton se solid cartons) ya haath se rows → packing list matrix (carton no × style × colour code × size × pcs, gross/net, dims). **Carton marks** = har carton ka label barcode (JAN) ke saath.
3. Har document pe **Generate** (Commercial Invoice — multi-line, HS code, USD + ₹, IGST, words, L/C, format no · Packing List · Carton Marks · Delivery Challan · COO · E-Way Bill) ya **Upload** (B/L, AWB) ya **Number**.
4. **Record event** — Factory stuffing → Customs → **Shipped on board** → In transit → Delivered.

**Result:** *Shipped on board* pe har line order ka stage *Dispatch*, buyer portal pe shipment card, TNA ex-factory done. Payments mein tracker apne aap khul jata hai. **Buyer Orders & Shipping → Shipping track** tab: har line ka ship-1 … n (invoice, AWB), shipped, cancelled, balance, on-time.

---

## Stage 10 — Payment aur Close

**Forms (Payments page):**
1. **Milestones** tick karo — LC: received → amendment → shipped & docs → negotiated → credited. TT: advance → shipped → balance → credited.
2. **Record Receipt** — date, amount, FX rate, bank, BRC/FIRC ref. Pending = invoice − jo aaya.

**Result:** pura paisa aaya = *Received*, order stage *Payment*, TNA payment done. Order page pe **Close Order** → order complete, Control Tower 12/12.

---

## Poore raste mein saath chalne wali cheezein

- **TNA (Time & Action):** har order ka calendar. Template se activities banti hain (planned dates), modules se actual dates apne aap bharti hain. Green = time pe, Amber = due soon, Red = late. Date badalni ho to **Replan** with reason. **Buyer Board** pe har order ki pipeline ek nazar mein. Steps **Stages** button se customise.
- **My Work:** har user ka apna to-do — overdue activities, approvals, alerts.
- **Alert Center:** system khud alerts banata hai — material short, PO late, TNA red, quality fail, licence expiry, payment overdue.
- **Buyer Tracking Link:** order page se link banao (PIN optional), buyer bina login ke stage board + shipment dekhta hai. Price, vendor, stock kabhi nahi dikhta.
- **Compliance:** licences, insurance, certificates — expiry se pehle reminders.
- **Reports:** 11 reports (order status, material consumption, job work pending, efficiency, stock ageing, realisation, buyer profitability, TNA delay, DHU, compliance, priority ageing) — CSV / print.
- **Settings → Form Fields:** kisi bhi form mein apne extra fields add karo, built-in fields rename/hide karo.
- **Settings (naya):** Company — AD code, Gurgaon address; Production — cutting extra %, **size sets**, approvals board rows; Export — order/invoice currency, exchange rate, IGST %, **format numbers** (AFN/10, 11, 13, 14, 17, 19, 21, 22, 40 — har print ke header pe).

---

## Sabse important 5 rules (system inhe enforce karta hai)

1. Order sirf **approved sample** se banta hai.
2. Stock sirf **Gate Entry** se badhta hai; pending se zyada receive nahi hota.
3. Job work ka maal sirf **gate** se wapas aata hai; location system khud nikalta hai.
4. **Final AQL pass** ke bina invoice nahi banta.
5. Buyer/vendor ka naam, rate, value sirf **flag wale users** ko dikhta hai; baaki ko alias (B-01, V-05).
