import json, urllib.request, urllib.error, uuid, sys
import os
BASE = os.environ.get('BASE', 'http://localhost:5001/api/v1')

def call(method, path, body=None, tok=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {tok}'} if tok else {})})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')

def login(uid):
    st, d = call('POST', '/auth/login', {'uid': uid, 'password': 'Afion@123'}); assert st == 200, (uid, d); return d['accessToken']

V = login('vikram'); A = login('amit'); R = login('ravi.gate'); M = login('meena')
def ok(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name, extra)
    if not cond: sys.exit(1)

# ---- job work list / masking / summary
st, d = call('GET', '/jobwork?size=50', tok=V); ok('jw list', st == 200 and d['total'] >= 3, [(j['challanNo'], j['status'], j['location']['label']) for j in d['items']])
jcut = next(j for j in d['items'] if j['op'] == 'Cutting'); ok('location engine partial', jcut['location']['label'] == 'PARTIALLY IN-HOUSE' and '8,000 in-house / 4,000 at' in jcut['location']['detail'], jcut['location'])
ok('overdue derived', jcut['overdue'] is True and jcut['displayStatus'] == 'Overdue')
jdye = next(j for j in d['items'] if j['process'] == 'Dyeing'); ok('location in-house', jdye['location']['label'] == 'IN-HOUSE' and jdye['status'] == 'Received')
ok('admin sees vendor name + rate', 'vendorName' in jcut and 'rate' in jcut)
st, d = call('GET', '/jobwork?size=50', tok=V)
st, d2 = call('GET', '/jobwork?size=50', tok=login('sunita') if False else A)  # amit has vendor.confidential
ok('amit (flag) sees vendor name', 'vendorName' in d2['items'][0])
st, d3 = call('GET', '/jobwork/summary', tok=A); ok('jw summary', st == 200 and d3['outside'] == 4000 and jcut['challanNo'] in d3['overdue'], d3)
st, d4 = call('GET', f"/jobwork/{jcut['id']}/challan-data", tok=A); ok('challan data', st == 200 and d4['vendor']['name'] and d4['company']['legalName'])
st, d5 = call('GET', '/jobwork', tok=R); ok('gate man no jobwork module', st == 403)

# ---- gate pending includes jw with masked party for the gate man
st, g = call('GET', '/gate/pending', tok=R); jwdocs = [x for x in g['items'] if x['kind'] == 'jw']
ok('gate pending has jw', len(jwdocs) == 1 and jwdocs[0]['no'] == jcut['challanNo'] and jwdocs[0]['pendingQty'] == 4000, jwdocs)
ok('gate man sees alias only', jwdocs[0]['party'].startswith('V-') and 'Precision' not in jwdocs[0]['party'], jwdocs[0]['party'])
st, s = call('GET', '/gate/summary', tok=R); ok('gate summary withVendors', s['withVendors'] == 4000 and s['jwOpen'] == 1, s)

# ---- over-return blocked, valid return → production log + op advance + order stage
st, e = call('POST', '/gate', {'kind': 'jw', 'refId': jcut['id'], 'receivedQty': 5000}, tok=R); ok('over-return blocked', st == 400 and e.get('code') == 'OVER_RETURN', e.get('message'))
st, o = call('GET', '/orders?q=AFI-1043', tok=V); oid = o['items'][0]['id']
st, det0 = call('GET', f'/orders/{oid}', tok=V)
cut0 = next(x for x in det0['ops'] if x['op'] == 'Cutting'); ok('ops in order detail', len(det0['ops']) == 4 and cut0['doneQty'] == 8000 and cut0['state'] == 'Partially Received', cut0['location'])
ok('tower gates 6/7/9 derived', det0['tower'][5]['k'] == 'bad' and 'overdue' in det0['tower'][5]['s'] and det0['tower'][6]['k'] == 'warn' and det0['tower'][8]['k'] in ('bad', 'warn', ''), [det0['tower'][i] for i in (5, 6, 8)])
cid = str(uuid.uuid4())
body = {'clientUuid': cid, 'kind': 'jw', 'refId': jcut['id'], 'receivedQty': 4000, 'rejectedQty': 25, 'vehicleNo': 'UP 16 CT 9021', 'challanNo': 'PC/1160', 'remarks': 'last lot'}
st, r = call('POST', '/gate', body, tok=R); ok('jw return posted', st == 201 and 'fully returned' in r['message'] and r['entry']['kind'] == 'jw', r.get('message'))
st, r2 = call('POST', '/gate', body, tok=R); ok('jw return idempotent', st == 200 and r2['duplicate'])
st, j = call('GET', f"/jobwork/{jcut['id']}", tok=A); ok('jw received + location in-house', j['status'] == 'Received' and j['location']['label'] == 'IN-HOUSE' and len(j['returns']) == 3, (j['status'], j['returnedQty']))
st, det = call('GET', f'/orders/{oid}', tok=V)
cut = next(x for x in det['ops'] if x['op'] == 'Cutting'); ok('op advanced by gate', cut['doneQty'] == 12000 and cut['state'] == 'Completed' and cut['location'] == 'Factory', cut)
ok('tower job work ok now', det['tower'][5]['k'] in ('ok', 'warn') and 'overdue' not in det['tower'][5]['s'], det['tower'][5])
st, lg = call('GET', f'/production/logs?orderId={oid}', tok=A); ok('gate log appended', any(l['source'] == 'gate' and l['output'] == 4000 for l in lg['items']), len(lg['items']))
st, v = call('GET', '/vendors?size=50', tok=A); vcut = next(x for x in v['items'] if x['id'] == jcut['vendorId']); ok('vendor on-time recomputed', isinstance(vcut['onTimePct'], int), vcut['onTimePct'])

# ---- issue a new challan with material → ledger issue_jw; cancel → reversal
st, mats = call('GET', '/materials?size=500', tok=V); fab = next(m for m in mats['items'] if m['code'] == 'FAB-0121')
st, vend = call('GET', '/vendors?size=50', tok=A); vprint = next(x for x in vend['items'] if x['category'] == 'Printing')
st, nj = call('POST', '/jobwork/issue', {'orderId': oid, 'vendorId': vprint['id'], 'process': 'Printing', 'materialId': fab['id'], 'sentQty': 1000, 'rate': 18, 'instructions': 'test'}, tok=A)
ok('issue challan', st == 201 and nj['challanNo'].startswith('JW-0') and nj['location']['label'] == 'OUTSOURCED', nj.get('challanNo') or nj)
st, mats2 = call('GET', '/materials?size=500', tok=V); fab2 = next(m for m in mats2['items'] if m['code'] == 'FAB-0121')
ok('stock left with vendor', fab2['physicalQty'] == fab['physicalQty'] - 1000 and fab2['atVendor'] == 1000, (fab['physicalQty'], fab2['physicalQty'], fab2['atVendor']))
st, e = call('POST', '/jobwork/issue', {'orderId': oid, 'vendorId': vprint['id'], 'process': 'Printing', 'materialId': fab['id'], 'sentQty': 999999}, tok=A); ok('issue > stock blocked', st == 400)
st, e = call('POST', '/jobwork/issue', {'orderId': oid, 'vendorId': vprint['id'], 'process': 'Other', 'itemDesc': 'tags', 'sentQty': 10}, tok=A); ok('Other needs description', st == 400)
st, c = call('POST', f"/jobwork/{nj['id']}/cancel", tok=A); ok('cancel reverses', st == 200 and c['status'] == 'Cancelled')
st, mats3 = call('GET', '/materials?size=500', tok=V); fab3 = next(m for m in mats3['items'] if m['code'] == 'FAB-0121'); ok('stock restored', fab3['physicalQty'] == fab['physicalQty'] and fab3['atVendor'] == 0)

# ---- production board / manual log / plan op
st, b = call('GET', '/production/board', tok=A); ok('board', st == 200 and len(b['cards']) >= 8 and b['kpi']['todayOutput'] >= 1682 and len(b['lines']) == 11, b['kpi'])
st, l = call('POST', '/production/logs', {'orderId': oid, 'op': 'Stitching', 'where': 'Line 5', 'workers': 30, 'output': 600, 'rejected': 5, 'supervisor': 'R. Verma'}, tok=A)
ok('manual log', st == 201 and l['op']['doneQty'] == 8000 and l['op']['state'] == 'In Process', l.get('op', l))
st, det = call('GET', f'/orders/{oid}', tok=V); ok('order progress derived', det['order']['progress'] == round((12000 + 8000) * 100 / 48000), det['order']['progress'])
fin = next(x for x in det['ops'] if x['op'] == 'Finishing')
st, p = call('PATCH', f"/production/ops/{fin['id']}", {'blocked': True, 'blockedReason': 'Waiting for trims'}, tok=A); ok('block op', st == 200 and p['state'] == 'Blocked')
st, det = call('GET', f'/orders/{oid}', tok=V); ok('tower production blocked', det['tower'][6]['k'] == 'bad' and 'Blocked' in det['tower'][6]['s'], det['tower'][6])
st, e = call('POST', '/production/logs', {'orderId': oid, 'op': 'Finishing', 'output': 10}, tok=A); ok('log on blocked op refused', st == 400)
st, p = call('PATCH', f"/production/ops/{fin['id']}", {'blocked': False, 'exec': 'In-house', 'line': 'Line 6'}, tok=A); ok('unblock + in-house', st == 200 and p['exec'] == 'In-house' and p['whereLabel'] == 'Line 6')
st, b = call('GET', '/production/board', tok=R); ok('gate man no production', st == 403)

# ---- packing
st, pk = call('GET', '/packing/overview', tok=A); ok('packing overview', st == 200 and len(pk['items']) >= 4 and len(pk['plans']) >= 2, (pk['kpi'], [(p['orderNo'], p['status'], p['cartons']) for p in pk['plans']]))
plan = next(p for p in pk['plans'] if p['orderNo'] == 'AFI-1043'); ok('carton plan', plan['pcsPerCarton'] == 50 and plan['cartons'] == 240)
st, pl = call('PUT', f"/packing/plan/{oid}", {'packRatio': 'Ratio pack 1-2-2-1', 'pcsPerCarton': 60}, tok=A); ok('plan saved', st == 200 and pl['cartons'] == 200)
st, ld = call('GET', f"/packing/list-data/{oid}", tok=A); ok('packing list data', st == 200 and ld['order']['cartons'] == 200 and len(ld['perCarton']) == 6)
st, e = call('GET', '/packing/overview', tok=M); ok('meena no packing module', st == 403)
# ---- payables: what we owe job-work vendors and material suppliers
st, jw2 = call('POST', '/jobwork/issue', {'orderId': oid, 'vendorId': vprint['id'], 'process': 'Printing', 'itemDesc': 'Panels for print', 'sentQty': 500, 'rate': 20, 'uom': 'pcs'}, tok=A)
ok('challan for the payables test', st == 201, jw2.get('challanNo') or jw2)
st, led = call('GET', f"/payables/vendor/{vprint['id']}", tok=A)
row = next((d for d in led['docs'] if d['no'] == jw2['challanNo']), {})
ok('nothing is billed before the goods come back', st == 200 and row.get('billed') == 0 and row.get('balance') == 0, row)
st, g = call('POST', '/gate', {'kind': 'jw', 'refId': jw2['id'], 'receivedQty': 500, 'challanNo': 'VCH-9'}, tok=R)   # the gate man books it back in
ok('printed panels received back', st in (200, 201), g)
st, led = call('GET', f"/payables/vendor/{vprint['id']}", tok=A)
row = next(d for d in led['docs'] if d['no'] == jw2['challanNo'])
ok('vendor is billed on what came back (500 x 20)', row['billed'] == 10000 and row['balance'] == 10000, row)
st, paid = call('POST', '/payables/pay', {'partyKind': 'vendor', 'partyId': vprint['id'], 'amount': 4000, 'method': 'NEFT / RTGS', 'reference': 'UTR-1',
                                          'lines': [{'refId': row['id'], 'amount': 4000}]}, tok=A)
row2 = next(d for d in paid['docs'] if d['no'] == jw2['challanNo'])
ok('part payment leaves the balance', st == 201 and row2['paid'] == 4000 and row2['balance'] == 6000, row2)
st, e = call('POST', '/payables/pay', {'partyKind': 'vendor', 'partyId': vprint['id'], 'amount': 99999, 'lines': [{'refId': row['id'], 'amount': 99999}]}, tok=A)
ok('paying more than the balance is refused', st == 400, e)
st, auto = call('POST', '/payables/pay', {'partyKind': 'vendor', 'partyId': vprint['id'], 'amount': 6000}, tok=A)
row3 = next(d for d in auto['docs'] if d['no'] == jw2['challanNo'])
ok('a payment with no lines settles the oldest bills', st == 201 and row3['balance'] == 0, row3)
st, jwlist = call('GET', '/jobwork?size=50', tok=A)
jrow = next(j for j in jwlist['items'] if j['challanNo'] == jw2['challanNo'])
ok('the challan register shows value / paid / balance', jrow['billed'] == 10000 and jrow['paid'] == 10000 and jrow['balance'] == 0, jrow.get('balance'))
st, sm = call('GET', '/payables/summary', tok=A)
ok('payables summary adds up both sides', st == 200 and sm['vendors']['paid'] >= 10000 and sm['vendors']['outstanding'] == sm['vendors']['billed'] - sm['vendors']['paid'] and 'outstanding' in sm['suppliers'], (sm['vendors'], sm['suppliers']))
st, e = call('GET', '/payables/summary', tok=R); ok('gate man cannot see payables', st == 403)

print('ALL PASS')
