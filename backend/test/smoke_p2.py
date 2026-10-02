import json, urllib.request, urllib.error, uuid, sys
import os
BASE = os.environ.get('BASE', 'http://localhost:5001/api/v1')

def call(method, path, body=None, tok=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {tok}'} if tok else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')

def login(uid):
    st, d = call('POST', '/auth/login', {'uid': uid, 'password': 'Afion@123'})
    assert st == 200, (uid, d)
    return d['accessToken']

V = login('vikram'); M = login('meena'); N = login('neha')
ok = lambda name, cond, extra='': print(('PASS ' if cond else 'FAIL ') + name, extra) or (cond or sys.exit(1))

# 1 stock summary + materials with onOrder
st, d = call('GET', '/stock/summary', tok=V); ok('stock summary', st == 200 and d['openPos'] >= 3, d)
st, d = call('GET', '/materials?size=500', tok=V)
fab = next(m for m in d['items'] if m['code'] == 'FAB-0121'); btn = next(m for m in d['items'] if m['code'] == 'ACC-0208')
ok('material onOrder FAB-0121', fab['onOrder'] == 21500 - 12000, fab['onOrder'])
st, d = call('GET', f"/stock/ledger?materialId={fab['id']}", tok=V); ok('ledger opening rows', st == 200 and any(r['txn'] == 'opening' for r in d['items']), len(d['items']))

# 2 PO list / summary / gate pending
st, d = call('GET', '/po?size=50', tok=V); ok('po list', st == 200 and d['total'] >= 5)
po_btn = next(p for p in d['items'] if p['materialCode'] == 'ACC-0208')
ok('po present remaining', po_btn['remainingQty'] == 110000 and 'value' in po_btn)
st, d = call('GET', '/po?size=50', tok=M); ok('po rate hidden for meena', 'rate' not in d['items'][0] and 'value' not in d['items'][0])
st, d = call('GET', '/po/summary', tok=V); ok('po summary', st == 200 and d['open'] >= 3, d)
st, d = call('GET', '/gate/pending', tok=M); ok('gate pending', st == 200 and any(x['no'] == po_btn['poNo'] for x in d['items']), len(d['items']))
st, d = call('GET', '/gate/summary', tok=M); ok('gate summary', st == 200 and d['awaiting'] >= 3, d)
st, d = call('GET', '/gate?size=10', tok=M); ok('gate register', st == 200 and d['total'] >= 4)
st, d = call('GET', '/gate', tok=N); ok('gate 403 for neha', st == 403)

# 3 gate receipt: over-receipt blocked, valid, idempotent
st, d = call('POST', '/gate', {'kind': 'po', 'refId': po_btn['id'], 'receivedQty': 120000}, tok=M)
ok('over-receipt blocked', st == 400 and d.get('code') == 'OVER_RECEIPT', d.get('message'))
cid = str(uuid.uuid4())
body = {'clientUuid': cid, 'kind': 'po', 'refId': po_btn['id'], 'receivedQty': 50000, 'rejectedQty': 120, 'vehicleNo': 'DL 01 AB 1234', 'driverName': 'Test Driver',
        'challanNo': 'KB/DC/991', 'invoiceNo': 'KB-INV-1', 'inspection': 'Passed with deviation', 'godown': 'Bin D-11', 'remarks': 'smoke'}
st, d = call('POST', '/gate', body, tok=M); ok('gate receipt posted', st == 201 and d['entry']['grnNo'].startswith('GRN-') and d['entry']['statusAfter'] == 'Partially Received', d.get('message'))
grn = d['entry']['grnNo']
st, d2 = call('POST', '/gate', body, tok=M); ok('idempotent replay', st == 200 and d2['duplicate'] and d2['entry']['grnNo'] == grn)
st, d = call('GET', f"/po/{po_btn['id']}", tok=V); ok('po received updated once', d['receivedQty'] == 50000 and d['status'] == 'Partially Received' and len(d['receipts']) == 1, (d['receivedQty'], d['status']))
st, d = call('GET', '/materials?size=500', tok=V); btn2 = next(m for m in d['items'] if m['code'] == 'ACC-0208')
ok('stock increased by receipt', btn2['physicalQty'] == btn['physicalQty'] + 50000 and btn2['onOrder'] == btn['onOrder'] - 50000, (btn['physicalQty'], btn2['physicalQty']))
st, d = call('GET', f"/stock/ledger?materialId={btn['id']}&limit=3", tok=V); ok('ledger receipt row', d['items'][0]['txn'] == 'receipt' and d['items'][0]['refNo'] == grn and d['items'][0]['balanceAfter']['physical'] == btn2['physicalQty'])

# 3b make the suite self-contained: AFI-1044 = approved AF-2476 sample converted with a 2-line BOM (FAB-0134 1.8 + ACC-0214 1 + PKG-0305 1)
st, d = call('GET', '/orders?size=50', tok=V)
if not any(o['orderNo'] == 'AFI-1044' for o in d['items']):
    st, sm = call('GET', '/samples?size=100', tok=V); smp = next(x for x in sm['items'] if x['styleNo'] == 'AF-2476' and x['status'] == 'Approved')
    st, mats = call('GET', '/materials?size=500', tok=V); mid = {m['code']: m['id'] for m in mats['items']}
    st, r = call('PUT', f"/bom/{smp['styleId']}", {'lines': [{'materialId': mid['FAB-0134'], 'perPc': 1.8, 'wastePct': 5}, {'materialId': mid['ACC-0214'], 'perPc': 1, 'wastePct': 2}, {'materialId': mid['PKG-0305'], 'perPc': 1, 'wastePct': 2}]}, tok=V)
    ok('bom saved for AF-2476', st == 200 and len(r['lines']) == 3, r)
    st, r = call('POST', f"/samples/{smp['id']}/convert", {'qty': 6000, 'buyerPoNo': 'HM-PO-40118', 'shipDate': '2026-11-30', 'fobRate': 540, 'pcsPerCarton': 24}, tok=V)
    ok('AF-2476 converted to AFI-1044', st in (200, 201) and r.get('order', r).get('orderNo') == 'AFI-1044', r)

# 4 order detail with material position, pos, movements, tower
st, d = call('GET', '/orders?size=50', tok=V); o43 = next(o for o in d['items'] if o['orderNo'] == 'AFI-1043'); o44 = next(o for o in d['items'] if o['orderNo'] == 'AFI-1044')
st, det = call('GET', f"/orders/{o43['id']}", tok=V)
ok('order detail material rows', st == 200 and det['material']['hasBom'] and len(det['material']['rows']) == 8 and len(det['pos']) >= 3, [g for g in det['tower'][3:5]])
g5 = det['tower'][4]; ok('procurement gate derived', g5['k'] == 'warn' and 'PO open' in g5['s'], g5)
row = next(r for r in det['material']['rows'] if r['code'] == 'ACC-0208'); ok('row onOrder/status', row['onOrder'] == 60000 and row['status'] in ('On Order', 'Purchase', 'Available', 'Reserved'), row)
ok('movements from gate', any(m['refNo'] == grn for m in det['movements']))

# 5 reserve / release for AFI-1044 (BOM: FAB-0134 1.8 + ACC-0214 1)
st, r = call('POST', f"/orders/{o44['id']}/reserve", tok=V); ok('reserve', st == 200 and len(r['reserved']) >= 1, r)
st, det44 = call('GET', f"/orders/{o44['id']}", tok=V)
lab = next(x for x in det44['material']['rows'] if x['code'] == 'ACC-0214'); ok('reservedForOrder recorded', lab['reservedForOrder'] > 0 and lab['available'] >= lab['reservedForOrder'], lab)
st, r = call('POST', f"/orders/{o44['id']}/release", tok=V); ok('release', st == 200 and r['released'] >= 1, r)
st, det44 = call('GET', f"/orders/{o44['id']}", tok=V); lab = next(x for x in det44['material']['rows'] if x['code'] == 'ACC-0214'); ok('released to zero', lab['reservedForOrder'] == 0)

# 6 from-plan (meena: no po.approve → big PO Pending Approval) then approve by admin
st, r = call('POST', '/po/from-plan', {'orderId': o44['id']}, tok=M); ok('from-plan created', st == 201 and len(r['created']) >= 1, r)
st, d = call('GET', f"/po?orderId={o44['id']}", tok=V)
big = [p for p in d['items'] if p['status'] == 'Pending Approval']; ok('approval needed above limit', len(big) >= 1, [(p['poNo'], p['value']) for p in d['items']])
st, r = call('POST', f"/po/{big[0]['id']}/approve", tok=M); ok('meena cannot approve', st == 403)
st, r = call('POST', f"/po/{big[0]['id']}/approve", tok=V); ok('admin approves', st == 200 and r['status'] == 'Ordered')
st, r = call('POST', '/gate', {'kind': 'po', 'refId': big[0]['id'], 'receivedQty': 1}, tok=M); ok('gate accepts approved po', st == 201)
st, det44 = call('GET', f"/orders/{o44['id']}", tok=V); ok('tower procurement after PO', det44['tower'][4]['k'] == 'warn' and 'PO open' in det44['tower'][4]['s'], det44['tower'][4])
st, d = call('GET', f"/po/rate-history?materialId={fab['id']}", tok=V); ok('rate history', st == 200 and len(d['items']) >= 1)
st, d = call('GET', f"/po/rate-history?materialId={fab['id']}", tok=M); ok('rate history hidden', st == 403)

# 7 accessories overview
st, d = call('GET', '/accessories/overview', tok=M); ok('accessories overview', st == 200 and d['kpi']['skus'] >= 6 and len(d['byOrder']) >= 2, [(b['orderNo'], b['status']) for b in d['byOrder']])

# 8 stock adjust needs reason; balances not editable via PATCH
st, d = call('POST', '/stock/adjust', {'materialId': fab['id'], 'qty': -10}, tok=V); ok('adjust needs reason', st == 400)
st, d = call('POST', '/stock/adjust', {'materialId': fab['id'], 'qty': -10, 'reason': 'Physical count variance'}, tok=V); ok('adjust posted', st == 201 and d['txn'] == 'adjust')
st, d = call('PATCH', f"/materials/{fab['id']}", {'physicalQty': 999999, 'godown': 'Rack A-01'}, tok=V); ok('direct balance edit ignored', st == 200 and d['physicalQty'] != 999999, d['physicalQty'])
st, d = call('GET', '/settings/company', tok=V); ok('settings p2 fields', 'poApprovalLimit' in d and isinstance(d.get('godowns'), list), (d.get('poApprovalLimit'), d.get('godowns')))
print('ALL PASS')
