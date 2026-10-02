import json, urllib.request, urllib.error, sys
import os
BASE = os.environ.get('BASE', 'http://localhost:5001/api/v1')
def call(method, path, body=None, tok=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {tok}'} if tok else {})})
    try:
        with urllib.request.urlopen(req, timeout=25) as r: return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'null')
def login(uid):
    st, d = call('POST', '/auth/login', {'uid': uid, 'password': 'Afion@123'}); assert st == 200; return d['accessToken'], d['user']
def ok(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name, extra)
    if not cond: sys.exit(1)
A, au = login('amit'); M, _ = login('meena'); V, _ = login('vikram')
ok('amit has packing now', 'packing' in au['modules'], au['modules'])
st, o = call('GET', '/orders?q=AFI-1043', tok=V); oid = o['items'][0]['id']
st, pk = call('GET', '/packing/overview', tok=A); ok('packing overview', st == 200 and len(pk['items']) >= 4 and len(pk['plans']) >= 2, (pk['kpi'], [(p['orderNo'], p['status'], p['cartons'], p['shortLines']) for p in pk['plans']]))
st, pl = call('PUT', f"/packing/plan/{oid}", {'packRatio': 'Ratio pack 1-2-2-1', 'pcsPerCarton': 50}, tok=A); ok('plan set to 50/carton', st == 200 and pl['cartons'] == 240, pl)
st, pk = call('GET', '/packing/overview', tok=A)
plan = next(p for p in pk['plans'] if p['orderNo'] == 'AFI-1043'); ok('carton plan', plan['pcsPerCarton'] == 50 and plan['cartons'] == 240, plan)
st, pl = call('PUT', f"/packing/plan/{oid}", {'packRatio': 'Ratio pack 1-2-2-1', 'pcsPerCarton': 60}, tok=A); ok('plan saved', st == 200 and pl['cartons'] == 200, pl)
st, ld = call('GET', f"/packing/list-data/{oid}", tok=A); ok('packing list data', st == 200 and ld['order']['cartons'] == 200 and len(ld['perCarton']) == 6)
st, e = call('GET', '/packing/overview', tok=M); ok('meena no packing module', st == 403)
st, s = call('GET', '/settings/company', tok=V); ok('settings lines', len(s.get('lines', [])) == 11 and s.get('lineTarget') == 800)
print('ALL PASS')
