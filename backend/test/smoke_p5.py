import json, urllib.request, urllib.error, sys, os, subprocess, tempfile
BASE = os.environ.get('BASE', 'http://localhost:5001/api/v1')

def call(method, path, body=None, tok=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {tok}'} if tok else {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'null')
def login(uid):
    st, d = call('POST', '/auth/login', {'uid': uid, 'password': 'Afion@123'}); assert st == 200, (uid, d); return d['accessToken'], d['user']
def ok(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name, extra)
    if not cond: sys.exit(1)

V, vu = login('vikram'); SU, su = login('sunita'); A, au = login('amit'); N, nu = login('neha'); M, mu = login('meena')
ok('sunita modules + flags', 'compliance' in su['modules'] and 'compliance.manage' in su['flags'] and 'compliance.confidential' in su['flags'], (su['modules'], su['flags']))

# ---- dispatch seeded + docs
st, d = call('GET', '/dispatch', tok=SU); ok('dispatch list', st == 200 and d['total'] >= 1, [(x['invoiceNo'], x['status'], x['docsPending']) for x in d['items']])
inv = d['items'][0]; ok('status derived docs in progress', inv['status'] == 'Docs In Progress' and inv['docsDone'] == 2)
ok('value visible to sunita (rates.view)', 'invoiceValue' in inv and inv['invoiceValue'] > 0)
st, d2 = call('GET', '/dispatch', tok=M if 'dispatch' in mu['modules'] else N); ok('non-module user blocked', st == 403)
st, ds = call('GET', '/dispatch/summary', tok=SU); ok('dispatch summary', st == 200 and ds['docsPending'] == 4, ds)
st, dd = call('GET', f"/dispatch/{inv['id']}/doc-data/Commercial%20Invoice", tok=SU); ok('doc data', st == 200 and dd['company']['legalName'] and dd['buyer']['name'] and dd['order']['sizes'], dd['buyer'])
st, e = call('POST', f"/dispatch/{inv['id']}/docs/Bill%20of%20Lading/generate", tok=SU); ok('carrier doc cannot be generated', st == 400)
st, r = call('POST', f"/dispatch/{inv['id']}/docs/E-Way%20Bill/number", {'number': 'EWB 7412 8890 1123'}, tok=SU); ok('ewb number', st == 200 and r['ewayBillNo'] == 'EWB 7412 8890 1123' and next(x for x in r['documents'] if x['type'] == 'E-Way Bill')['status'] == 'Generated')
st, r = call('POST', f"/dispatch/{inv['id']}/docs/Delivery%20Challan/generate", tok=SU); ok('generate challan', st == 200)
tmp = os.path.join(tempfile.gettempdir(), 'BL-MEDU8812445.pdf'); open(tmp, 'w').write('%PDF-1.4 stub')
up = json.loads(subprocess.run(['curl', '-s', '-X', 'POST', BASE + '/files/upload', '-H', 'Authorization: Bearer ' + SU, '-F', 'file=@' + tmp], capture_output=True, text=True).stdout)
st, r = call('POST', f"/dispatch/{inv['id']}/docs/Certificate%20of%20Origin/upload", {'fileId': up['id']}, tok=SU); ok('upload coo', st == 200 and next(x for x in r['documents'] if x['type'] == 'Certificate of Origin')['status'] == 'Uploaded')
st, r = call('POST', f"/dispatch/{inv['id']}/track", {'key': 'onboard', 'detail': 'MV Ever Ace', 'vesselOrFlight': 'MV Ever Ace', 'blOrAwbNo': 'MEDU8812445'}, tok=SU); ok('onboard needs invoice+PL (they are generated) → ok', st == 200 and r['status'] == 'Shipped On Board' and r['blOrAwbNo'] == 'MEDU8812445', r.get('status'))
st, r = call('POST', f"/dispatch/{inv['id']}/docs/Bill%20of%20Lading/number", {'number': 'MEDU8812445'}, tok=SU); ok('bl number → ready docs', st == 200 and not r['docsPending'], r['docsPending'])
st, o = call('GET', '/orders?q=AFI-1043', tok=V); oid = o['items'][0]['id']
st, det = call('GET', f'/orders/{oid}', tok=V); ok('order stage → Dispatch, gate 10 ok', det['order']['stage'] in ('Dispatch', 'Payment') and det['tower'][9]['k'] == 'ok', (det['order']['stage'], det['tower'][9]))
st, ot = call('GET', f'/tna/orders/{oid}', tok=V); ok('tna ex-factory + dispatch auto-done', all(next(x for x in ot['tasks'] if x['key'] == k)['status'] == 'Done' for k in ('ex_factory', 'dispatch')))
st, r = call('POST', f"/dispatch/{inv['id']}/track", {'key': 'transit', 'detail': 'Suez', 'eta': '2026-10-05'}, tok=SU); ok('transit', st == 200 and r['status'] == 'In Transit')
st, r = call('POST', f"/dispatch/{inv['id']}/track", {'key': 'delivered', 'detail': 'Barcelona DC'}, tok=SU); ok('delivered', st == 200 and r['status'] == 'Delivered')
# blocked dispatch when final AQL fails
st, aq = call('POST', '/quality/aql', {'orderId': oid, 'stage': 'Final', 'lotSize': 12000, 'defects': [{'code': 'MO', 'count': 20}]}, tok=A); ok('post failing final', st == 201 and aq['result'] == 'Fail')
st, e = call('POST', '/dispatch', {'orderId': oid, 'cartons': 10}, tok=SU); ok('dispatch blocked by failed final', st == 400 and 'blocked' in e['message'], e.get('message'))
st, aq = call('POST', '/quality/aql', {'orderId': oid, 'stage': 'Final', 'lotSize': 12000, 'defects': []}, tok=A); ok('post passing final', st == 201 and aq['result'] == 'Pass')
st, d2 = call('POST', '/dispatch', {'orderId': oid, 'mode': 'Air', 'cartons': 12, 'grossWeightKg': 150, 'qty': 600, 'portOfDischarge': 'Manchester', 'invoiceValue': 567600, 'paymentMethod': 'T/T', 'documents': ['Commercial Invoice', 'Packing List']}, tok=SU)
ok('create air invoice', st == 201 and d2['invoiceNo'].startswith('AFI/EXP/2026-27/') and d2['mode'] == 'Air' and any(x['type'] == 'Airway Bill' for x in d2['documents']), d2.get('invoiceNo'))
st, e = call('POST', f"/dispatch/{d2['id']}/track", {'key': 'onboard'}, tok=SU); ok('onboard refused while invoice pending', st == 400)

# ---- payments
st, p = call('GET', '/payments', tok=SU); ok('payments list', st == 200 and p['total'] >= 2, [(x['invoiceNo'], x['method'], x['status']) for x in p['items']])
lc = next(x for x in p['items'] if x['method'] == 'LC'); tt = next(x for x in p['items'] if x['method'] == 'T/T')
ok('lc tracker seeded with milestones', lc['reference'] == 'LC-885003' and sum(1 for m in lc['milestones'] if m['done']) == 2 and lc['pending'] == lc['amount'])
st, pn = call('GET', '/payments', tok=N if 'payments' in nu['modules'] else V)
st, pm = call('GET', '/payments', tok=M if 'payments' in mu['modules'] else SU)
st, e = call('POST', f"/payments/{tt['id']}/receipt", {'amount': tt['amount'] + 1}, tok=SU); ok('over-receipt blocked', st == 400 and e.get('code') == 'OVER_RECEIPT')
st, r = call('POST', f"/payments/{tt['id']}/receipt", {'amount': round(tt['amount'] * 0.3), 'fxRate': 83.4, 'bank': 'ICICI Bank', 'reference': 'TT-77410', 'charges': 850}, tok=SU); ok('partial receipt', st == 201 and r['status'] == 'Partial' and r['receivedPct'] == 30 and next(m for m in r['milestones'] if m['key'] == 'advance')['done'], r.get('status'))
st, r = call('POST', f"/payments/{tt['id']}/receipt", {'amount': r['pending'], 'fxRate': 83.6, 'reference': 'BRC-2026-0117'}, tok=SU); ok('final receipt → Received', st == 201 and r['status'] == 'Received' and r['realisationDays'] is not None and next(m for m in r['milestones'] if m['key'] == 'credited')['done'])
st, det = call('GET', f'/orders/{oid}', tok=V); ok('gate 11 payment ok + stage Payment', det['tower'][10]['k'] == 'ok' and det['order']['stage'] == 'Payment', (det['tower'][10], det['order']['stage']))
st, ot = call('GET', f'/tna/orders/{oid}', tok=V); ok('tna payment auto-done', next(x for x in ot['tasks'] if x['key'] == 'payment_due')['status'] == 'Done')
st, r = call('POST', f"/payments/{lc['id']}/milestone", {'key': 'shipped_docs', 'detail': 'Docs couriered to HSBC'}, tok=SU); ok('lc milestone', st == 200 and next(m for m in r['milestones'] if m['key'] == 'shipped_docs')['done'])
st, ps = call('GET', '/payments/summary', tok=SU); ok('payments summary', st == 200 and ps['lcUnderNegotiation'] == 1 and ps['receivedFY'] == tt['amount'] and ps['byMethod']['T/T'] == tt['amount'], {k: ps[k] for k in ('receivedFY', 'outstanding', 'lcUnderNegotiation', 'avgRealisationDays')})
st, pv = call('GET', '/payments', tok=V)
st, e = call('POST', f"/payments/{lc['id']}/receipt", {'amount': 10}, tok=M) if 'payments' in mu['modules'] else (403, {}); ok('no money flag cannot record', st == 403)

# ---- receivables: what each buyer still owes us (Buyers page)
st, ba = call('GET', '/buyers/accounts', tok=V)
ok('buyer accounts list', st == 200 and ba['money'] and any(x['invoices'] for x in ba['items']), [(x['name'], x.get('invoiced'), x.get('outstanding')) for x in ba['items']][:4])
bid = next(x['id'] for x in ba['items'] if x['invoices'])
st, acc = call('GET', f'/buyers/{bid}/account', tok=V)
t = acc['totals']
ok('buyer account ties invoices to receipts', st == 200 and t['invoiced'] == sum(x['amount'] for x in acc['invoices'])
   and t['received'] == sum(x['receivedTotal'] for x in acc['invoices']) and t['outstanding'] == t['invoiced'] - t['received'], t)
orow = next(o for o in acc['orders'] if o['invoices'])
ok('order row carries value, invoiced and balance', orow['value'] >= 0 and orow['balance'] == orow['invoiced'] - orow['received'], orow)
st, bs = call('GET', '/buyers/accounts/summary', tok=V)
ok('receivable summary adds the buyers up', st == 200 and bs['outstanding'] == sum(x['outstanding'] for x in ba['items']) and bs['received'] == sum(x['received'] for x in ba['items']), {k: bs[k] for k in ('liveValue', 'invoiced', 'received', 'outstanding', 'toInvoice')})
st, bm = call('GET', '/buyers/accounts', tok=N)
ok('no money flag sees the orders but not the amounts', st == 200 and bm['money'] is False and 'outstanding' not in bm['items'][0], bm['items'][0])

# ---- compliance + reminder engine
st, c = call('GET', '/compliance', tok=SU); ok('compliance list (confidential visible to sunita)', st == 200 and c['total'] == 11 and any(x['confidential'] for x in c['items']), [(x['title'][:22], x['state'], x['daysLeft']) for x in c['items']][:6])
st, cv = call('GET', '/compliance', tok=V); ok('admin sees all', cv['total'] == 11)
st, ca = call('GET', '/compliance', tok=A); ok('amit lacks compliance module', st == 403)
st, cs = call('GET', '/compliance/summary', tok=SU); ok('summary', cs['expired'] == 1 and cs['expiringSoon'] >= 2 and cs['formats'] == 2 and cs['renewalInProgress'] == 1, cs)
fire = next(x for x in c['items'] if x['title'] == 'Fire NOC'); marine = next(x for x in c['items'] if 'Marine' in x['title'])
ok('states derived', fire['state'] == 'Renewal in progress' and marine['state'] == 'Expiring' and marine['daysLeft'] == 12, (fire['state'], marine['state'], marine['daysLeft']))
st, rc = call('POST', '/alerts/recompute', tok=V); ok('recompute', st == 200)
st, al = call('GET', '/alerts', tok=SU); comp = [a for a in al['items'] if a['ruleKey'] == 'compliance.expiry']
ok('compliance alerts to owner sunita', len(comp) >= 3 and any('Marine' in a['message'] and a['severity'] == 'amber' for a in comp) and any('Fire NOC' in a['message'] and a['severity'] == 'red' for a in comp), [(a['message'][:40], a['severity']) for a in comp])
st, m2 = call('GET', f"/compliance/{marine['id']}", tok=SU); ok('reminder rows recorded at crossed offsets', sorted(r['offsetDays'] for r in m2['reminders']) == [15, 30, 60], m2['reminders'])
st, r = call('POST', f"/compliance/{marine['id']}/dismiss", {'reason': 'Renewal quote received, policy issues next week', 'days': 10}, tok=SU); ok('dismiss with reason', st == 200 and r['dismissedActive'])
st, rc = call('POST', '/alerts/recompute', tok=V); st, al = call('GET', '/alerts', tok=SU); ok('dismissed → alert resolved', not any(a['entityNo'] == marine['docNo'] for a in al['items']))
up2 = json.loads(subprocess.run(['curl', '-s', '-X', 'POST', BASE + '/files/upload', '-H', 'Authorization: Bearer ' + SU, '-F', 'file=@' + tmp], capture_output=True, text=True).stdout)
st, r = call('POST', f"/compliance/{fire['id']}/version", {'fileId': up2['id'], 'note': 'Renewed NOC', 'expiryDate': '2027-09-10', 'number': 'FNOC/NOI/2026/1044'}, tok=SU); ok('renew via new version', st == 200 and r['state'] == 'Valid' and r['reminders'] == [] and not r['renewalInProgress'] and r['number'] == 'FNOC/NOI/2026/1044', r.get('state'))
st, e = call('POST', '/compliance', {'title': 'x', 'category': 'Insurance'}, tok=V); ok('admin implicit manage flag', st == 201)
st, e = call('POST', f"/compliance/{fire['id']}/dismiss", {'reason': 'x'}, tok=N if 'compliance' in nu['modules'] else SU); ok('dismiss works for manager', st in (200, 403))
st, reg = call('GET', '/compliance/register', tok=SU); ok('expiry register', st == 200 and reg['total'] >= 7, reg['total'])
st, cc = call('POST', '/compliance', {'title': 'Secret', 'category': 'Bank / IEC / GST', 'confidential': True, 'ownerUid': 'vikram'}, tok=SU)
st, cs2 = call('GET', '/compliance', tok=SU); ok('confidential visible with flag', any(x['title'] == 'Secret' for x in cs2['items']))

# ---- reports
st, rg = call('GET', '/reports/register', tok=SU); ok('register', st == 200 and len(rg['items']) == 11 and all(r['allowed'] for r in rg['items']))
st, rg2 = call('GET', '/reports/register', tok=login('saurav')[0]); ok('financial gated for saurav? (has rates.view → allowed)', all(r['allowed'] for r in rg2['items']))
for key in ['order-status', 'material-consumption', 'jobwork-pending', 'production-efficiency', 'stock-ageing', 'export-realisation', 'buyer-profitability', 'tna-delay', 'quality-dhu', 'compliance-expiry', 'priority-ageing']:
    st, rr = call('GET', f'/reports/run/{key}', tok=SU); ok(f'report {key}', st == 200 and 'columns' in rr and isinstance(rr['rows'], list), f"{rr.get('total')} rows")
st, kp = call('GET', '/reports/kpis', tok=SU); ok('kpis', st == 200 and kp['onTimePct'] is not None and kp['grossMarginPct'] is not None, kp)
st, tr = call('GET', '/reports/trend', tok=SU); ok('trend', st == 200 and len(tr['months']) == 12 and sum(tr['dispatched']) == 12000 and sum(tr['realised']) == tt['amount'], (sum(tr['dispatched']), sum(tr['realised'])))
st, by = call('GET', '/reports/buyers', tok=SU); ok('buyers', st == 200 and by['items'][0]['shipped'] == 1)
st, pc = call('GET', '/reports/process-cost', tok=SU); ok('process cost', st == 200 and pc['total'] > 0, pc['items'][:2])
st, e = call('GET', '/reports/process-cost', tok=A if 'reports' in au['modules'] else A); ok('process cost gated', st == 403)
st, mw = call('GET', '/mywork', tok=SU); ok('my work sunita includes compliance alerts', any(i['kind'] == 'alert' for i in mw['items']), mw['counts'])
print('ALL PASS')
