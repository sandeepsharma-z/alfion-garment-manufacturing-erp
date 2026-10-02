"""P8 · client-document gaps: buyer orders / colour-size matrix / USD pricing / revisions / partial shipments, POM + measurements + approvals + tech pack,
colour-size-wise BOM + MOQ, fabric lots + fabric WIP, cutting report, stitching WIP + loading plan, measurement inspection, needle / blade registers,
multi-line invoice with IGST + words, box-wise packing list, JAN barcodes. Runs on the seeded in-memory DB after the other suites."""
import json, os, urllib.request, urllib.error
BASE = os.environ.get('BASE', 'http://localhost:5001/api/v1')
FAILS = []
def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: b = r.read(); return r.status, (json.loads(b) if b else None)
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b)
        except Exception: return e.code, b
def check(name, cond, info=''):
    print(('  ok   ' if cond else '  FAIL ') + name + (f'  ({info})' if info and not cond else ''))
    if not cond: FAILS.append(name)
def login(uid, pw='Afion@123'):
    s, r = call('POST', '/auth/login', {'uid': uid, 'password': pw}); assert s == 200, (uid, s, r); return r['accessToken']
def short(x): return json.dumps(x)[:160] if not isinstance(x, (bytes, str)) else str(x)[:160]

A = login('vikram'); M = login('meena'); AM = login('amit')
# a merchandiser without rates.view — none of the seeded users has orders access without the flag
call('POST', '/users', {'name': 'No Rates', 'uid': 'norate', 'password': 'Afion@123', 'role': 'Custom', 'modules': ['orders', 'dispatch', 'samples']}, token=A)
NR = login('norate')

print('P8 · settings + meta')
s, c = call('GET', '/settings/company', token=A)
check('size sets seeded', s == 200 and any(x['name'] == 'Japan M – 3L' and x['sizes'] == ['M', 'L', 'LL', '3L'] for x in c['sizeSets']), short(c.get('sizeSets')))
check('format numbers + currency defaults', c['formatNos'].get('cuttingReport') == 'AFN/11' and c['defaultCurrency'] == 'USD' and c['fxRate'] > 0 and 'approvalItems' in c and 'Lab dip' in c['approvalItems'])
s, r = call('PUT', '/settings/company', {'adCode': '0510012-3400009', 'igstPct': 5, 'fxRate': 84, 'sizeSets': [{'name': 'Test S-L', 'sizes': ['S', 'M', 'L']}] + c['sizeSets']}, token=A)
check('settings accept adCode / igst / fx / size sets', s == 200 and r['adCode'] == '0510012-3400009' and r['fxRate'] == 84 and r['sizeSets'][0]['name'] == 'Test S-L', short(r))
s, m = call('GET', '/orders/meta', token=A)
check('orders meta exposes size sets + currencies', s == 200 and 'USD' in m['currencies'] and any(x['name'] == 'Test S-L' for x in m['sizeSets']) and m['fxRate'] == 84)

print('P8 · buyer order header + colour-wise style lines in USD')
s, buyer = call('POST', '/buyers', {'brand': 'Yarra Trading Co.', 'legalName': 'Yarra Trading Co. Ltd.', 'country': 'Japan', 'address': '2-4-1 Nihonbashi, Tokyo', 'currency': 'USD'}, token=A)
check('buyer created', s == 201, short(buyer))
s, bo = call('POST', '/buyer-orders', {'buyerId': buyer['id'], 'poNo': 'PN-2026-0912', 'date': '2026-09-12', 'season': 'AW-26', 'currency': 'USD', 'fxRate': 83.5, 'terms': 'LC at sight', 'incoterm': 'FOB', 'latestShipment': '2026-12-10', 'deliveryDate': '2026-12-25', 'salesMonth': '2027-01'}, token=A)
check('buyer order created', s == 201 and bo['poNo'] == 'PN-2026-0912' and bo['revision'] == 0 and bo['fxRate'] == 83.5, short(bo))
s, dup = call('POST', '/buyer-orders', {'buyerId': buyer['id'], 'poNo': 'PN-2026-0912'}, token=A)
check('duplicate PO no per buyer refused', s == 409, short(dup))
s, r = call('PATCH', f"/buyer-orders/{bo['id']}", {'latestShipment': '2026-12-20', 'revisionReason': 'Buyer moved ETD'}, token=A)
check('header revision logged', s == 200 and r['revision'] == 1 and r['revisions'][0]['changes'][0]['field'] == 'latestShipment' and r['revisions'][0]['reason'] == 'Buyer moved ETD', short(r.get('revisions')))

def make_sample(style, desc):
    s, smp = call('POST', '/samples', {'buyerId': buyer['id'], 'styleNo': style, 'description': desc, 'type': 'PP Sample', 'fabric': '100% cotton poplin', 'colour': 'Navy / Ivory', 'sizeRange': 'M – 3L'}, token=A)
    assert s == 201, (s, smp)
    s, _ = call('POST', f"/samples/{smp['id']}/round", {'action': 'sent', 'awb': 'DHL-1'}, token=A); assert s == 200
    s, smp = call('POST', f"/samples/{smp['id']}/round", {'action': 'approved', 'comment': 'OK'}, token=A); assert s == 200 and smp['status'] == 'Approved', smp
    return smp
smp1 = make_sample('YR-2201', 'Ladies woven blouse'); smp2 = make_sample('YR-2202', 'Ladies woven skirt')
check('sample kinds extended', 'TOP Sample' in call('GET', '/samples/meta', token=A)[1]['types'])
colours = [{'code': 'B-01', 'name': 'Navy', 'sizes': [{'size': 'M', 'qty': 300}, {'size': 'L', 'qty': 400}, {'size': 'LL', 'qty': 200}, {'size': '3L', 'qty': 100, 'barcode': '4901234567890'}]},
           {'code': 'B-07', 'name': 'Ivory', 'sizes': [{'size': 'M', 'qty': 150}, {'size': 'L', 'qty': 250}, {'size': 'LL', 'qty': 100}, {'size': '3L', 'qty': 0}]}]
s, o1 = call('POST', f"/samples/{smp1['id']}/convert", {'buyerOrderId': bo['id'], 'sizeSet': ['M', 'L', 'LL', '3L'], 'colours': colours, 'cutExtraPct': 5, 'currency': 'USD', 'unitPrice': 6.4, 'firstPrice': 6.8, 'fxRate': 83.5, 'shipDate': '2026-12-10', 'targetShipDate': '2026-12-05', 'deliveryDate': '2026-12-25', 'mode': 'Sea'}, token=A)
check('order line 1 created from colour grid', s in (200, 201) and o1['qty'] == 1500 and o1['cutQty'] == 1575 and o1['buyerOrderNo'] == 'PN-2026-0912' and o1['buyerPoNo'] == 'PN-2026-0912', short(o1))
check('sizes = Σ colours, size set kept', [x['qty'] for x in o1['sizes']] == [450, 650, 300, 100] and o1['sizeSet'] == ['M', 'L', 'LL', '3L'] and o1['colours'][0]['cutQty'] == 1050 and o1['colours'][0]['sizes'][3]['barcode'] == '4901234567890', short(o1.get('sizes')))
check('USD price → INR FOB + values', o1['currency'] == 'USD' and o1['unitPrice'] == 6.4 and o1['firstPrice'] == 6.8 and o1['fobRate'] == 534.4 and o1['valueFx'] == 9600 and o1['value'] == 801600, (o1.get('fobRate'), o1.get('value'), o1.get('valueFx')))
check('dates carried', o1['targetShipDate'][:10] == '2026-12-05' and o1['deliveryDate'][:10] == '2026-12-25' and o1['salesMonth'] == '2027-01' and o1['colour'] == 'Navy / Ivory')
s, o2 = call('POST', f"/samples/{smp2['id']}/convert", {'buyerOrderId': bo['id'], 'qty': 800, 'currency': 'USD', 'unitPrice': 9, 'fxRate': 83.5, 'shipDate': '2026-12-10'}, token=A)
check('order line 2 (no colours) uses % grid + cut extra from settings', s in (200, 201) and o2['qty'] == 800 and o2['cutQty'] == 840 and o2['fobRate'] == 751.5, short(o2))
s, r = call('GET', f"/orders/{o1['id']}", token=NR)
check('user without rates.view sees no prices', s == 200 and 'unitPrice' not in r['order'] and 'fobRate' not in r['order'] and r['order']['qty'] == 1500)
s, r = call('PATCH', f"/orders/{o1['id']}", {'unitPrice': 7}, token=NR)
check('no rates.view → cannot change price', s == 403, short(r))

print('P8 · order revision + planned qty sync')
colours2 = json.loads(json.dumps(colours)); colours2[0]['sizes'][0]['qty'] = 500   # Navy M 300 → 500
s, r = call('PATCH', f"/orders/{o1['id']}", {'colours': colours2, 'unitPrice': 6.5, 'cancelledQty': 0, 'revisionReason': 'Buyer PN rev 1: +200 Navy M, price 6.50'}, token=A)
check('revision bumps + logs changes', s == 200 and r['revision'] == 1 and r['qty'] == 1700 and r['cutQty'] == 1785 and r['unitPrice'] == 6.5 and r['fobRate'] == 542.75 and any(c['field'] == 'colours' for c in r['revisions'][0]['changes']) and any(c['field'] == 'unitPrice' and c['to'] == '6.5' for c in r['revisions'][0]['changes']), short(r.get('revisions')))
check('activity carries the reason', any('Revision 1' in a['text'] and 'PN rev 1' in a['text'] for a in r['activity']))
s, d = call('GET', f"/orders/{o1['id']}", token=A)
cut_op = next(x for x in d['ops'] if x['op'] == 'Cutting'); st_op = next(x for x in d['ops'] if x['op'] == 'Stitching')
check('production planned qty follows the revision', cut_op['plannedQty'] == 1785 and st_op['plannedQty'] == 1700, (cut_op['plannedQty'], st_op['plannedQty']))
s, r = call('PATCH', f"/orders/{o1['id']}", {'instructions': 'no change'}, token=A)
check('non-commercial edit is not a revision', s == 200 and r['revision'] == 1)

print('P8 · POM spec, sample measurements, approvals board, tech pack')
sid = o1['styleId']
pom = [{'code': 'A', 'name': 'Body length', 'tolerance': 1, 'spec': {'M': 60, 'L': 62, 'LL': 64, '3L': 66}}, {'code': 'B', 'name': 'Chest', 'tolerance': 0.5, 'spec': {'M': 48, 'L': 50, 'LL': 52, '3L': 54}}, {'code': '', 'name': 'Sleeve', 'tolerance': 0.5, 'spec': {'M': 20.5, 'L': '21', 'LL': 'x'}}]
s, st = call('PUT', f"/styles/{sid}/pom", {'sizeSet': ['M', 'L', 'LL', '3L'], 'pomUnit': 'cm', 'pom': pom}, token=A)
check('POM spec saved + cleaned', s == 200 and len(st['pom']) == 3 and st['pom'][1]['spec']['LL'] == 52 and st['pom'][2]['code'] == 'C' and st['pom'][2]['spec'] == {'M': 20.5, 'L': 21} and st['sizeSet'] == ['M', 'L', 'LL', '3L'], short(st.get('pom')))
s, sm = call('PUT', f"/samples/{smp1['id']}/measurements", {'round': 1, 'size': 'L', 'rows': [{'code': 'A', 'measured': 63.2, 'instruction': 'reduce 1 cm'}, {'code': 'B', 'measured': '', 'instruction': ''}], 'dueDate': '2026-09-20', 'pcsPerColour': 2, 'actualSentOn': '2026-09-19', 'commentsOn': '2026-09-24'}, token=A)
r1 = sm['rounds'][0]
check('round measurements + plan columns saved', s == 200 and r1['size'] == 'L' and r1['measurements'][0]['measured'] == 63.2 and r1['measurements'][0]['instruction'] == 'reduce 1 cm' and 'measured' not in r1['measurements'][1] and r1['pcsPerColour'] == 2 and r1['actualSentOn'][:10] == '2026-09-19', short(r1))
s, ap = call('GET', f"/styles/{sid}/approvals", token=A)
check('approvals board defaults from settings', s == 200 and not ap['saved'] and any(x['title'] == 'Lab dip' for x in ap['items']) and 'Approved' in ap['statuses'], short(ap))
s, tna0 = call('GET', f"/tna/orders/{o1['id']}", token=A)
lab = next((t for t in tna0['tasks'] if t['key'] == 'lab_dip'), None)
check('TNA has lab dip activity from the template', lab is not None and lab['status'] != 'Done', short([t['key'] for t in tna0['tasks']][:12]))
items = ap['items']; items[[x['title'] for x in items].index('Lab dip')].update({'status': 'Approved', 'approvedOn': '2026-09-18', 'submittedOn': '2026-09-15', 'awb': 'DHL-77'}); items.append({'title': 'Hanger sample', 'group': 'Sample', 'status': 'Pending', 'dueDate': '2026-10-01'})
s, ap2 = call('PUT', f"/styles/{sid}/approvals", {'items': items}, token=A)
check('approvals saved', s == 200 and ap2['saved'] and any(x['title'] == 'Hanger sample' for x in ap2['items']) and next(x for x in ap2['items'] if x['title'] == 'Lab dip')['status'] == 'Approved')
s, tna1 = call('GET', f"/tna/orders/{o1['id']}", token=A)
lab2 = next(t for t in tna1['tasks'] if t['key'] == 'lab_dip')
check('approving lab dip completes the TNA activity on the open order', lab2['status'] == 'Done', short(lab2))
s, tp = call('PUT', f"/styles/{sid}/techpack", {'composition': '100% cotton', 'lining': 'No', 'article': 'YR-2201-A', 'construction': 'French seams', 'labelPlacement': 'CB neck', 'packingMethod': 'Flat pack 12/ctn', 'accessories': [{'item': 'Main label', 'qtyPerPc': 1}, {'item': '', 'qtyPerPc': 3}, {'item': 'Button', 'qtyPerPc': 7, 'note': '18L'}]}, token=A)
check('tech pack saved (blank accessory dropped)', s == 200 and tp['techPack']['composition'] == '100% cotton' and len(tp['techPack']['accessories']) == 2 and tp['techPack']['accessories'][1]['qtyPerPc'] == 7, short(tp.get('techPack')))
s, sd = call('GET', f"/samples/{smp1['id']}/spec-data", token=A)
check('spec-data carries POM + tech pack', s == 200 and len(sd['style']['pom']) == 3 and sd['style']['techPack']['article'] == 'YR-2201-A')

print('P8 · materials with item type / MOQ, colour-size-wise BOM, MOQ-aware requirement')
s, mt = call('GET', '/materials/meta', token=A)
check('material item types list', s == 200 and 'Sewing thread' in mt['itemTypes']['Accessory'] and len(mt['itemTypes']['Fabric']) >= 8)
s, sup = call('GET', '/suppliers?size=5', token=A); sup2 = sup['items'][1]; sup = sup['items'][0]
s, fab = call('POST', '/materials', {'code': 'FAB-YR01', 'name': 'Cotton poplin 40s navy', 'category': 'Fabric', 'itemType': 'Main fabric (FAB-A)', 'uom': 'mtr', 'rate': 180, 'moq': 500, 'leadDays': 21, 'supplierId': sup['id']}, token=A)
check('fabric master with item type + MOQ', s == 201 and fab['itemType'] == 'Main fabric (FAB-A)' and fab['moq'] == 500, short(fab))
s, fab2 = call('POST', '/materials', {'code': 'FAB-YR02', 'name': 'Cotton poplin 40s ivory', 'category': 'Fabric', 'itemType': 'Main fabric (FAB-A)', 'uom': 'mtr', 'rate': 180, 'supplierId': sup['id']}, token=A)
s, btn = call('POST', '/materials', {'code': 'ACC-YR01', 'name': 'Shell button 18L', 'category': 'Accessory', 'itemType': 'Button', 'uom': 'pcs', 'rate': 1.2, 'moq': 20000, 'supplierId': sup['id']}, token=A)
lines = [{'materialId': fab['id'], 'perPc': 1.2, 'wastePct': 5, 'part': 'FAB-A', 'colour': 'B-01', 'perSize': {'M': 1.1, 'L': 1.2, 'LL': 1.3, '3L': 1.4}, 'requiredDate': '2026-10-15'},
         {'materialId': fab2['id'], 'perPc': 1.2, 'wastePct': 5, 'part': 'FAB-A', 'colour': 'Ivory'},
         {'materialId': btn['id'], 'perPc': 7, 'wastePct': 2, 'moq': 25000}]
s, bom = call('PUT', f"/bom/{sid}", {'lines': lines}, token=A)
check('BOM saved with part / colour / per-size / MOQ / date', s == 200 and bom['lines'][0]['perSize']['LL'] == 1.3 and bom['lines'][0]['colour'] == 'B-01' and bom['lines'][2]['moq'] == 25000 and bom['lines'][0]['requiredDate'][:10] == '2026-10-15', short(bom.get('lines')))
s, d = call('GET', f"/orders/{o1['id']}", token=A)
rows = {r['code']: r for r in d['material']['rows']}
# Navy after revision: M 500 L 400 LL 200 3L 100 → cut ×1.05 → 525/420/210/105 ; Σ size×perSize = 577.5+504+273+147 = 1501.5 ×1.05 waste = 1576.6 → 1577
check('colour + size-wise requirement on cut qty', rows['FAB-YR01']['required'] == 1577 and rows['FAB-YR01']['colour'] == 'B-01', rows['FAB-YR01'].get('required'))
# Ivory 500 → cut 525 × 1.2 × 1.05 = 661.5 → 662 ; buttons: cut 1785 × 7 × 1.02 = 12744.9 → 12745, toOrder = max(12745, 25000)
check('colour-only line uses that colour cut qty', rows['FAB-YR02']['required'] == 662, rows['FAB-YR02'].get('required'))
check('MOQ lifts the PO quantity', rows['ACC-YR01']['required'] == 12745 and rows['ACC-YR01']['toOrder'] == 25000 and rows['ACC-YR01']['moq'] == 25000, (rows['ACC-YR01'].get('required'), rows['ACC-YR01'].get('toOrder')))
s, calc = call('POST', '/bom/calc', {'styleId': sid, 'qty': 1000}, token=A)
check('planning calc without an order = flat qty (colour lines count in full)', s == 200 and next(r for r in calc['rows'] if r['code'] == 'ACC-YR01')['required'] == 7140 and next(r for r in calc['rows'] if r['code'] == 'FAB-YR01')['required'] == 1260, short(calc.get('rows')))
s, calc2 = call('POST', '/bom/calc', {'styleId': sid, 'qty': 1000, 'orderId': o1['id']}, token=A)
check('planning calc with orderId = colour-wise', next(r for r in calc2['rows'] if r['code'] == 'FAB-YR01')['required'] == 1577 and next(r for r in calc2['rows'] if r['code'] == 'FAB-YR01')['orderQty'] == 1577)

print('P8 · supplier comparison + selective PO raise')
s, alt = call('PATCH', f"/materials/{fab['id']}", {'suppliers': [{'supplierId': sup2['id'], 'rate': 170, 'moq': 800, 'leadDays': 25, 'note': 'quote Q-1'}, {'supplierId': 'junk'}]}, token=A)
check('alternate supplier saved (junk dropped)', s == 200 and len(alt['suppliers']) == 1 and alt['suppliers'][0]['name'] == sup2['name'] and alt['suppliers'][0]['rate'] == 170, short(alt.get('suppliers')))
s, so = call('GET', f"/po/supplier-options?materialId={fab['id']}", token=A)
names = [o['name'] for o in so['options']]
check('options: alternate (cheaper) first, then master, with rates + basis', s == 200 and names[0] == sup2['name'] and so['options'][0]['rate'] == 170 and so['options'][0]['source'] == 'alternate' and any(o.get('primary') and o['rate'] == 180 and o['source'] == 'master' for o in so['options']), short(so.get('options')))
s, so_nr = call('GET', f"/po/supplier-options?materialId={fab['id']}", token=NR)
check('no rates.view → options without rates', s == 403 or (s == 200 and all('rate' not in o for o in so_nr['options'])))
s, fp = call('POST', '/po/from-plan', {'orderId': o1['id'], 'lines': [{'materialId': fab['id'], 'qty': 900, 'supplierId': sup2['id'], 'rate': 168}]}, token=A)
check('selective raise: one line, chosen supplier + typed rate', s == 201 and len(fp['created']) == 1, short(fp))
s, pl = call('GET', f"/po?orderId={o1['id']}&size=20", token=A)
po_alt = next((x for x in pl['items'] if x['poNo'] == fp['created'][0]), None)
check('PO carries supplier / qty / rate from the pick', po_alt is not None and po_alt['supplierName'] == sup2['name'] and po_alt['orderedQty'] == 900 and po_alt['rate'] == 168, short(po_alt))
s, r = call('POST', f"/po/{po_alt['id']}/cancel", token=A)
check('cancelled again so the fabric position is unchanged', s == 200 and r['status'] == 'Cancelled')

print('P8 · fabric lots at the gate + fabric WIP')
s, po = call('POST', '/po', {'materialId': fab['id'], 'supplierId': sup['id'], 'orderedQty': 1600, 'rate': 180, 'orderId': o1['id']}, token=A)
check('fabric PO against the order', s == 201 and po['orderedQty'] == 1600, short(po))
s, g = call('POST', '/gate', {'kind': 'po', 'refId': po['id'], 'lots': [{'lotNo': 'DL-4471', 'colour': 'Navy', 'thans': 8, 'tagLength': 420, 'actualLength': 412.5, 'tagWidth': 58, 'actualWidth': 57.5, 'gsm': 118}, {'lotNo': 'DL-4472', 'colour': 'Navy', 'thans': 7, 'tagLength': 380, 'actualLength': 380, 'tagWidth': 58, 'actualWidth': 58, 'gsm': 119}], 'vehicleNo': 'HR-26-AB-1234'}, token=M)
check('gate receipt = Σ actual lot length', s == 201 and g['entry']['receivedQty'] == 792.5 and len(g['entry']['lots']) == 2 and g['entry']['lots'][0]['lotNo'] == 'DL-4471', short(g))
s, w = call('GET', f"/orders/{o1['id']}/fabric-wip", token=A)
navy = next(r for r in w['rows'] if r['code'] == 'FAB-YR01')
check('fabric WIP: required / ordered / received lot-wise / balance', w['hasBom'] and navy['required'] == 1577 and navy['ordered'] == 1600 and navy['received'] == 792.5 and navy['balance'] == 784.5 and len(navy['lots']) == 2 and navy['lots'][0]['thans'] == 8, short(navy))
s, fi = call('POST', '/quality/fabric', {'materialId': fab['id'], 'gateEntryId': g['entry']['id'], 'lot': 'DL-4471', 'metersChecked': 100, 'widthInches': 57.5, 'tagLength': 420, 'tagWidth': 58, 'thans': 8, 'unit': 'sqyd', 'defects': [{'category': 'Hole', 'p4': 3}, {'category': 'Weaving', 'p1': 4}]}, token=A)
check('4-point with on-tag fields + per 100 sq yd', s == 201 and fi['tagLength'] == 420 and fi['unit'] == 'sqyd' and fi['pointsPer100Yd'] > 0 and fi['pointsPer100'] > 0 and fi['result'] == 'Pass', short(fi))
s, fi_e = call('PATCH', f"/quality/fabric/{fi['id']}", {'defects': [{'category': 'Hole', 'p4': 40}], 'remarks': 'edited'}, token=A)
check('edit recomputes → Fail + hold on free stock', s == 200 and fi_e['result'] == 'Fail' and fi_e['hold'] is True and fi_e['holdQty'] > 0 and fi_e['remarks'] == 'edited', short(fi_e))
s, fi_p = call('PATCH', f"/quality/fabric/{fi['id']}", {'defects': [{'category': 'Hole', 'p4': 3}, {'category': 'Weaving', 'p1': 4}]}, token=A)
check('edit back to Pass releases the hold', s == 200 and fi_p['result'] == 'Pass' and fi_p['hold'] is False and fi_p.get('releasedBy'), short(fi_p))
s, fi_g = call('GET', f"/quality/fabric/{fi['id']}", token=A)
check('single inspection readable', s == 200 and fi_g['inspNo'] == fi['inspNo'] and len(fi_g['defects']) == 2)

print('P8 · daily cutting report → cutting log + fabric issue')
s, cut = call('POST', '/production/cutting', {'orderId': o1['id'], 'colour': 'Navy', 'materialId': fab['id'], 'lotNo': 'DL-4471', 'thans': 3, 'widthInches': 57.5, 'layers': 40, 'totalMeters': 160, 'consumedMeters': 150.5, 'endBitsMeters': 4.2, 'sizes': {'M': 40, 'L': 40, 'LL': 30, '3L': 10}, 'table': 'Cutting Table 1', 'cutter': 'Ramesh'}, token=AM)
check('cutting report numbered + totals', s == 201 and cut['cutNo'].startswith('CUT-') and cut['cutPcs'] == 120 and cut['avgPerPc'] == 1.254, short(cut))
s, d = call('GET', f"/orders/{o1['id']}", token=A)
check('cutting op advanced by the report', next(x for x in d['ops'] if x['op'] == 'Cutting')['doneQty'] == 120)
s, led = call('GET', f"/stock/ledger?materialId={fab['id']}&limit=3", token=A)
check('fabric issued from stock (issue_prod)', led['items'][0]['txn'] == 'issue_prod' and led['items'][0]['qty'] == -150.5 and led['items'][0]['refNo'] == cut['cutNo'], short(led['items'][:1]))
s, cl = call('GET', f"/production/cutting?orderId={o1['id']}", token=A)
check('cutting list', s == 200 and cl['total'] == 1)
s, r = call('POST', '/production/cutting', {'orderId': o1['id'], 'sizes': {}}, token=AM)
check('empty cutting refused', s == 400)

print('P8 · stitching WIP (loaded / hourly) + loading plan')
s, lg = call('POST', '/production/logs', {'orderId': o1['id'], 'op': 'Stitching', 'where': 'Line 1', 'colour': 'Navy', 'loaded': 100, 'output': 60, 'rejected': 2, 'workers': 30, 'hourly': {'09-10': 20, '10-11': 25, '11-12': 15, 'junk': -3}}, token=AM)
check('stitching log with loaded + hourly', s == 201 and lg['log']['loaded'] == 100 and lg['log']['colour'] == 'Navy' and lg['log']['hourly'] == {'09-10': 20, '10-11': 25, '11-12': 15}, short(lg))
s, wip = call('GET', f"/production/wip?orderId={o1['id']}", token=AM)
navy_w = next(r for r in wip['items'] if r['colour'] == 'Navy')
check('WIP row: cut 120 · loaded 100 · output 60 · wip 40 · cutting in stock 20', navy_w['cut'] == 120 and navy_w['loaded'] == 100 and navy_w['output'] == 60 and navy_w['wip'] == 40 and navy_w['cuttingInStock'] == 20 and navy_w['balanceToStitch'] == 1140 and 'Line 1' in navy_w['lines'], short(navy_w))
s, lp = call('POST', '/production/loading-plan', {'date': lg['log']['date'][:10], 'line': 'Line 1', 'process': 'Stitching', 'orderId': o1['id'], 'colour': 'Navy', 'target': 80}, token=AM)
check('loading plan row', s == 201 and lp['target'] == 80 and lp['orderNo'] == o1['orderNo'], short(lp))
s, lp2 = call('POST', '/production/loading-plan', {'date': lg['log']['date'][:10], 'line': 'Line 1', 'process': 'Stitching', 'orderId': o1['id'], 'colour': 'Navy', 'target': 90}, token=AM)
check('same key upserts (no duplicate)', s == 201 and lp2['id'] == lp['id'] and lp2['target'] == 90)
s, plan = call('GET', f"/production/loading-plan?from={lg['log']['date'][:10]}&to={lg['log']['date'][:10]}", token=AM)
row = next(r for r in plan['items'] if r['id'] == lp['id'])
check('plan shows actual from logs', row['actual'] == 60 and row['pct'] == 67 and 'Line 1' in plan['lines'], short(row))
s, r = call('DELETE', f"/production/loading-plan/{lp['id']}", token=AM)
check('plan row deleted', s == 200 and r['ok'])

print('P8 · measurement inspection, needle & blade registers, AQL extras')
s, mi = call('POST', '/quality/measurements', {'orderId': o1['id'], 'stage': 'Final', 'size': 'L', 'colour': 'Navy', 'rows': [{'code': 'A', 'measured': [62, 62.5, 61.8, '', 63.5]}, {'code': 'B', 'measured': [50.2, 50.4, 49.9, 50, 50.1]}, {'code': 'C', 'measured': [21.6, 21]}]}, token=A)
check('measurement inspection graded per POM', s == 201 and mi['inspNo'].startswith('MI-') and mi['rows'][0]['spec'] == 62 and mi['rows'][0]['maxDev'] == 1.5 and mi['rows'][0]['pass'] is False and mi['rows'][1]['pass'] is True and mi['rows'][2]['pass'] is False and mi['failed'] == 2 and mi['result'] == 'Fail' and mi['pieces'] == 5, short(mi))
s, mi2 = call('POST', '/quality/measurements', {'orderId': o1['id'], 'stage': 'Inline', 'size': 'M', 'rows': [{'code': 'A', 'measured': [60.5]}, {'code': 'B', 'measured': [48.2]}]}, token=A)
check('passing measurement', s == 201 and mi2['result'] == 'Pass')
s, ml = call('GET', f"/quality/measurements?orderId={o1['id']}", token=A)
check('measurement list', s == 200 and ml['total'] == 2)
s, nd = call('POST', '/quality/needles', {'line': 'Line 1', 'machineNo': 'SN-14', 'operator': 'Sita', 'orderNo': o1['orderNo'], 'needleType': 'DB×1', 'needleSize': '11', 'parts': {'point': True, 'shank': True, 'eye': False, 'middle': True}, 'garmentChecked': True}, token=AM)
check('needle record: missing part → allFound false', s == 201 and nd['allFound'] is False and nd['parts']['eye'] is False and nd['newIssued'] is True, short(nd))
s, b1 = call('POST', '/quality/blades', {'kind': 'Cutting blade', 'received': 10}, token=AM)
s, b2 = call('POST', '/quality/blades', {'kind': 'Cutting blade', 'issued': 3, 'broken': 1, 'issuedTo': 'Cutting Table 1'}, token=AM)
check('blade running balance', b1['balance'] == 10 and b2['balance'] == 7, (b1.get('balance'), b2.get('balance')))
s, b3 = call('POST', '/quality/blades', {'kind': 'Cutting blade', 'issued': 20}, token=AM)
check('cannot issue more blades than in store', s == 400, short(b3))
s, bl = call('GET', '/quality/blades?kind=Cutting%20blade', token=AM)
check('blade register list filtered by kind', s == 200 and bl['total'] == 2)
s, aq = call('POST', '/quality/aql', {'orderId': o1['id'], 'stage': 'Final', 'lotSize': 1700, 'poQty': 1700, 'poDate': '2026-09-12', 'shippedQty': 0, 'refNo': 'YR-INSP-01', 'defects': [{'code': 'UT', 'count': 2}]}, token=A)
check('final AQL with PO qty / ref / found vs allowed', s == 201 and aq['result'] == 'Pass' and aq['poQty'] == 1700 and aq['refNo'] == 'YR-INSP-01' and aq['foundMajors'] == 0 and aq['allowedMajors'] == aq['acceptNo'], short(aq))
s, aq2 = call('POST', '/quality/aql', {'orderId': o2['id'], 'stage': 'Final', 'lotSize': 800}, token=A)
check('line 2 final AQL pass', s == 201 and aq2['result'] == 'Pass')

print('P8 · multi-line invoice (USD → INR, IGST, words), partial shipment, shipping track, boxes + carton marks')
s, dm = call('GET', '/dispatch/meta', token=A)
check('dispatch meta has CFR/CPT/DAP + igst/fx', 'CFR' in dm['incoterms'] and 'DAP' in dm['incoterms'] and dm['igstPct'] == 5 and dm['fxRate'] == 84 and 'Carton Marks' in dm['docTypes'])
s, inv = call('POST', '/dispatch', {'lines': [{'orderId': o1['id'], 'qty': 1000, 'hsCode': '62064000'}, {'orderId': o2['id'], 'qty': 800, 'unitPrice': 9.25}], 'mode': 'Sea', 'cartons': 150, 'grossWeightKg': 1800, 'incoterm': 'CFR', 'portOfDischarge': 'Tokyo (JPTYO)', 'lcNo': 'LC-2026-771', 'lcDate': '2026-09-01', 'consignee': {'name': 'Yarra Trading Co. Ltd.', 'address': 'Tokyo', 'country': 'Japan'}, 'notifyParty': 'Same as consignee', 'placeOfReceipt': 'Gurgaon', 'finalDestination': 'Osaka'}, token=A)
check('multi-line invoice created', s == 201 and inv['lineCount'] == 2 and inv['qty'] == 1800 and inv['incoterm'] == 'CFR' and inv['lcNo'] == 'LC-2026-771' and inv['consignee']['country'] == 'Japan', short(inv))
l1, l2 = inv['lines']
check('line amounts: order price vs typed price', l1['unitPrice'] == 6.5 and l1['amountFx'] == 6500 and l1['hsCode'] == '62064000' and l2['unitPrice'] == 9.25 and l2['amountFx'] == 7400 and l1['currency'] == 'USD', short(inv['lines']))
# fx = order fx 83.5 (first line) : 6500×83.5 = 542750 ; 7400×83.5 = 617900 → taxable 1160650, IGST 5% = 58032.5 → 58033, total 1218683
check('totals + IGST + INR invoice value', inv['fxRate'] == 83.5 and inv['totalFx'] == 13900 and inv['taxableInr'] == 1160650 and inv['igstPct'] == 5 and inv['igstInr'] == 58033 and inv['totalInr'] == 1218683 and inv['invoiceValue'] == 1218683, (inv.get('taxableInr'), inv.get('igstInr'), inv.get('totalInr')))
check('amount in words (INR + USD)', inv['amountInWords'] == 'Rupees Twelve Lakh Eighteen Thousand Six Hundred Eighty Three Only' and inv['amountInWordsFx'] == 'US Dollars Thirteen Thousand Nine Hundred Only', (inv.get('amountInWords'), inv.get('amountInWordsFx')))
s, inv_m = call('GET', f"/dispatch/{inv['id']}", token=NR)
check('no rates → no prices on lines / totals', 'unitPrice' not in inv_m['lines'][0] and 'totalInr' not in inv_m and inv_m['lineCount'] == 2)
s, r = call('POST', '/dispatch', {'lines': [{'orderId': o1['id'], 'qty': 10}, {'orderId': call('GET', '/orders?size=5', token=A)[1]['items'][-1]['id'], 'qty': 5}]}, token=A)
check('lines of two buyers refused', s == 400, short(r))
s, d = call('GET', f"/orders/{o1['id']}", token=A)
check('order shows shipped 1000 / balance 700', d['order']['shippedQty'] == 1000 and d['order']['balanceQty'] == 700 and d['shipping']['shipments'][0]['invoiceNo'] == inv['invoiceNo'] and d['shipping']['shipments'][0]['qty'] == 1000, short(d.get('shipping')))
s, tr = call('GET', f"/orders/shipping-track?buyerOrderId={bo['id']}", token=A)
rows = {r['orderNo']: r for r in tr['items']}
check('shipping track per line', tr['total'] == 2 and rows[o1['orderNo']]['balanceQty'] == 700 and rows[o2['orderNo']]['balanceQty'] == 0 and rows[o1['orderNo']]['balanceValueFx'] == 4550, short(tr['items']))
s, bod = call('GET', f"/buyer-orders/{bo['id']}/detail", token=A)
check('buyer order detail totals', s == 200 and bod['totals']['qty'] == 2500 and bod['totals']['shipped'] == 1800 and bod['totals']['balance'] == 700 and bod['totals']['valueFx'] == 18250 and len(bod['lines']) == 2, short(bod.get('totals')))
s, bl = call('GET', '/buyer-orders?size=50', token=A)
check('buyer order list carries line count / qty', any(b['poNo'] == 'PN-2026-0912' and b['lines'] == 2 and b['qty'] == 2500 for b in bl['items']))
# boxes
s, r = call('POST', f"/dispatch/{inv['id']}/boxes/auto", token=A)
check('auto boxes need pcs per carton', s == 400, short(r))
s, _ = call('PUT', f"/packing/plan/{o1['id']}", {'pcsPerCarton': 12}, token=A); s, _ = call('PUT', f"/packing/plan/{o2['id']}", {'pcsPerCarton': 10}, token=A)
s, bx = call('POST', f"/dispatch/{inv['id']}/boxes/auto", {'grossKg': 12, 'netKg': 11, 'dims': '60×40×40'}, token=A)
n = lambda b: b['to'] - b['from'] + 1
check('boxes built colour × size at pcs/ctn', s == 200 and len(bx['boxes']) > 4 and sum(b['pcs'] * n(b) for b in bx['boxes']) == 1800 and bx['cartons'] == sum(n(b) for b in bx['boxes']) and bx['boxes'][0]['colourCode'] == 'B-01' and bx['boxes'][0]['sizes'] == {'M': 12} and bx['grossWeightKg'] == 12 * bx['cartons'], (len(bx.get('boxes', [])), bx.get('cartons')))
check('partial shipment scales the grid (1000 of 1700 for line 1)', sum(b['pcs'] * n(b) for b in bx['boxes'] if b['styleNo'] == 'YR-2201') in (999, 1000, 1001))
boxes = bx['boxes'][:2] + [{'from': 999, 'to': 999, 'styleNo': 'YR-2202', 'colourCode': 'X', 'colour': 'Ivory', 'sizes': {'F': 8, 'bad': 'x'}, 'grossKg': 5}]
s, bx2 = call('PUT', f"/dispatch/{inv['id']}/boxes", {'boxes': boxes}, token=A)
check('manual boxes replace + clean', s == 200 and len(bx2['boxes']) == 3 and bx2['boxes'][2]['pcs'] == 8 and bx2['boxes'][2]['sizes'] == {'F': 8} and bx2['cartons'] == sum(n(b) for b in bx2['boxes']), short(bx2.get('boxes')))
s, dd = call('GET', f"/dispatch/{inv['id']}/doc-data/Packing%20List", token=A)
check('doc-data carries orders (colours + barcodes), format no', s == 200 and len(dd['orders']) == 2 and dd['formatNo'] == 'AFN/19A' and next(o for o in dd['orders'] if o['styleNo'] == 'YR-2201')['colours'][0]['sizes'][3]['barcode'] == '4901234567890' and dd['company']['adCode'] == '0510012-3400009', short({k: dd.get(k) for k in ('formatNo',)}))
s, dd2 = call('GET', f"/dispatch/{inv['id']}/doc-data/Commercial%20Invoice", token=A)
check('invoice doc-data format AFN/19', dd2['formatNo'] == 'AFN/19' and dd2['dispatch']['amountInWords'].startswith('Rupees'))
s, dd3 = call('GET', f"/dispatch/{inv['id']}/doc-data/Commercial%20Invoice", token=NR)
check('invoice doc-data restricted without rates', s == 403)
s, _ = call('POST', f"/dispatch/{inv['id']}/docs/Commercial%20Invoice/generate", token=A); s, _ = call('POST', f"/dispatch/{inv['id']}/docs/Packing%20List/generate", token=A)
s, tk = call('POST', f"/dispatch/{inv['id']}/track", {'key': 'onboard', 'blOrAwbNo': 'MSCU-778812', 'vesselOrFlight': 'MV Ever Ace'}, token=A)
check('onboard recorded', s == 200 and tk['status'] == 'Shipped On Board')
s, d1 = call('GET', f"/orders/{o1['id']}", token=A); s, d2 = call('GET', f"/orders/{o2['id']}", token=A)
check('both line orders move to Dispatch with the AWB on the track', d1['order']['stage'] == 'Dispatch' and d2['order']['stage'] == 'Dispatch' and d1['shipping']['shipments'][0]['awb'] == 'MSCU-778812' and d1['shipping']['onTime'] is True, (d1['order']['stage'], d2['order']['stage']))
s, inv2 = call('POST', '/dispatch', {'lines': [{'orderId': o1['id']}], 'cartons': 20}, token=A)
check('second shipment defaults to the balance (700)', s == 201 and inv2['lines'][0]['qty'] == 700 and inv2['qty'] == 700, short(inv2))
s, d1 = call('GET', f"/orders/{o1['id']}", token=A)
check('order fully shipped → balance 0, 2 shipments', d1['order']['balanceQty'] == 0 and d1['order']['shipments'] == 2 and len(d1['shipping']['shipments']) == 2)
s, r = call('PATCH', f"/orders/{o1['id']}", {'cancelledQty': 50, 'revisionReason': 'short shipped'}, token=A)
check('cancelled qty is a revision', s == 200 and r['revision'] == 2 and r['cancelledQty'] == 50)

print('P8 · sample development as the entry point (photos, costing, buyer dates)')
s, smp3 = call('POST', '/samples', {'buyerId': buyer['id'], 'styleNo': 'YR-2290', 'description': 'Costing test polo', 'type': 'Proto Sample',
    'items': [{'description': 'Polo', 'fabric': 'Pique', 'colour': 'Navy', 'sizes': 'M, L', 'qty': 2,
               'photos': [{'fileName': 'front.png'}, {'fileName': 'back.png'}]}]}, token=A)
check('sample created without photo ids (photos optional)', s == 201, short(smp3))
s, cst = call('PUT', f"/samples/{smp3['id']}/costing", {'currency': 'USD', 'exchangeRate': 70, 'targetPrice': 9,
    'fabrics': [{'item': 'FABRIC-A', 'description': '92x80 voil 140 cm', 'yardage': 2.1, 'shrinkPct': 18, 'rate': 65, 'party': '45+20'}],
    'processes': [{'item': 'STITCHING', 'rate': 70}, {'item': 'FINISHING', 'rate': 50}, {'item': 'WASHING', 'rate': 10}, {'item': 'INSPECTION', 'rate': 30}, {'item': 'OVERHEAD', 'rate': 50}],
    'charges': [{'item': 'C&F SENDING', 'rate': 100}], 'wastagePct': 5, 'profitPct': 25}, token=A)
c = (cst or {}).get('costing', {})
check('act yard = yardage x (1 + shrink %)', s == 200 and abs(c['fabrics'][0]['actYard'] - 2.478) < 0.001, short(c.get('fabrics')))
check('costing totals follow the client sheet', abs(c['totals']['final'] - 612.03) < 0.05, short(c.get('totals')))
check('sample price in currency = final / exchange rate', abs(c['totals']['finalFx'] - 8.74) < 0.02, short(c.get('totals')))
s, trk = call('PUT', f"/samples/{smp3['id']}/tracking", {'articleNo': 'YR-A1', 'bomOn': '2026-09-01', 'ccMaterial': 'received'}, token=A)
check('buyer sample-sheet dates saved on the sample', s == 200 and trk['tracking']['articleNo'] == 'YR-A1' and trk['tracking']['bomOn'][:10] == '2026-09-01', short(trk.get('tracking')))
s, dos = call('GET', f"/samples/{smp3['id']}/dossier", token=A)
check('dossier carries sample + company for the printed sheet', s == 200 and dos['sample']['sampleNo'] == smp3['sampleNo'] and 'legalName' in dos['company'], short(dos))

print('P8 · material requirement sheet -> stock analysis -> BOM')
s, meta = call('GET', '/samples/meta', token=A)
check('material catalog served with the sample meta', s == 200 and len(meta.get('catalog', [])) >= 16 and any(g['group'] == 'Fabric' for g in meta['catalog']), short(meta.get('catalog')))
s, mat = call('POST', '/materials', {'code': 'FAB-7701', 'name': 'Sheet fabric', 'category': 'Fabric', 'uom': 'mtr', 'rate': 100, 'reorderLevel': 0, 'openingQty': 1000, 'moq': 500}, token=A)
check('stock item for the sheet created', s == 201, short(mat))
s, saved = call('PUT', f"/samples/{smp3['id']}/materials", {'plan': {'qty': 500, 'garmentType': 'Polo', 'sizeRatio': 'S1:M2:L2:XL1'}, 'lines': [
    {'group': 'Fabric', 'item': 'Main Fabric', 'description': 'Beige 100% linen', 'unit': 'mtr', 'perPc': 2.4, 'wastePct': 5, 'materialId': mat['id'], 'moq': 500},
    {'group': 'Buttons & Closures', 'item': 'Button', 'description': '18L pearl', 'unit': 'pcs', 'perPc': 3, 'wastePct': 2}]}, token=A)
check('material sheet saved on the sample', s == 200 and len(saved['materials']) == 2 and saved['materialPlan']['qty'] == 500, short(saved.get('materialPlan')))
s, rq = call('GET', f"/samples/{smp3['id']}/requirement?qty=500", token=A)
fab_row = rq['rows'][0] if s == 200 else {}
check('average consumption = per pc x (1 + waste %)', s == 200 and abs(fab_row['avgConsumption'] - 2.52) < 0.001, short(fab_row))
check('final required = average x order qty', fab_row['required'] == 1260, short(fab_row))
check('shortage nets free stock (1260 - 1000)', fab_row['shortage'] == 260 and fab_row['status'] in ('Short', 'Purchase'), short(fab_row))
check('MOQ lifts the order quantity (260 -> 500)', fab_row['finalOrderQty'] == 500, short(fab_row))
check('a line with no stock item is flagged', rq['rows'][1]['status'] == 'Not in stock' and rq['totals']['unlinked'] == 1, short(rq['totals']))
s, built = call('POST', f"/bom/from-sample/{smp3['id']}", {'createMissing': True}, token=A)
check('BOM built from the sample sheet', s == 200 and len(built['bom']['lines']) == 2, short(built.get('bom', {}).get('lines')))
check('missing stock items are created automatically', len(built['created']) == 1 and built['created'][0]['code'].startswith('ACC-9'), short(built.get('created')))
# a brand-new style: sheet -> approve -> convert, and the BOM must appear without anyone pressing a button
s, smp4 = call('POST', '/samples', {'buyerId': buyer['id'], 'styleNo': 'YR-2291', 'description': 'Auto BOM tee', 'type': 'Proto Sample'}, token=A)
call('POST', f"/samples/{smp4['id']}/round", {'action': 'sent'}, token=A)
s, smp4 = call('POST', f"/samples/{smp4['id']}/round", {'action': 'approved', 'comment': 'ok'}, token=A)
call('PUT', f"/samples/{smp4['id']}/materials", {'plan': {'qty': 300}, 'lines': [
    {'group': 'Fabric', 'item': 'Main Fabric', 'unit': 'mtr', 'perPc': 1.2, 'wastePct': 5, 'materialId': mat['id']},
    {'group': 'Labels', 'item': 'Main Label', 'unit': 'pcs', 'perPc': 1, 'wastePct': 0}]}, token=A)
s, conv = call('POST', f"/samples/{smp4['id']}/convert", {'qty': 300, 'sizeSet': ['S', 'M', 'L'], 'unitPrice': 6}, token=A)
check('sample converts to an order', s in (200, 201), short(conv))
s, autoBom = call('GET', f"/bom/{smp4['styleId']}", token=A)
check('converting a sample builds its BOM by itself', s == 200 and len(autoBom['lines']) == 2, short(autoBom.get('lines')))
check('the order says where the BOM came from', any('BOM built from' in x['text'] for x in (conv.get('activity') or [])), short(conv.get('activity')))
s, calc = call('POST', '/bom/calc', {'styleId': smp3['styleId'], 'qty': 500}, token=A)
check('planning sees the same requirement as the sample sheet', s == 200 and any(r['required'] == 1260 for r in calc['rows']), short(calc.get('rows')))

print()
print(f'{len(FAILS)} failures — client-document gaps {"OK" if not FAILS else "FAILED: " + ", ".join(FAILS)}')
if FAILS: raise SystemExit(1)

