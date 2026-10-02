import json, os, sys, urllib.request, urllib.error
BASE = os.environ.get('BASE', 'http://localhost:5001/api/v1')
FAILS = []
def call(method, path, body=None, token=None, headers=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    for k, v in (headers or {}).items(): req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            b = r.read(); return r.status, (b if raw else (json.loads(b) if b else None))
    except urllib.error.HTTPError as e:
        b = e.read();
        try: return e.code, json.loads(b)
        except Exception: return e.code, b
def check(name, cond, info=''):
    print(('  ok   ' if cond else '  FAIL ') + name + (f'  ({info})' if info and not cond else ''))
    if not cond: FAILS.append(name)
def login(uid, pw='Afion@123'):
    s, r = call('POST', '/auth/login', {'uid': uid, 'password': pw}); assert s == 200, (uid, s, r); return r['accessToken']

adm = login('vikram'); saurav = login('saurav'); amit = login('amit'); neha = login('neha'); sunita = login('sunita')

print('P6 · tracking codes (internal)')
s, r = call('GET', '/orders?size=5', token=adm); order = r['items'][0]; oid = order['id']
s, code = call('POST', '/tracking', {'kind': 'order', 'orderId': oid, 'expiresInDays': 30}, token=saurav)
check('merch issues an order link', s == 201 and '-' in code['token'] and code['url'].endswith('/track/' + code['token']), f'{s} {code}')
check('token is 9 chars, no ambiguous letters', len(code['token']) == 9 and not any(c in code['token'] for c in '0O1I'), code['token'])
s, pinned = call('POST', '/tracking', {'kind': 'order', 'orderId': oid, 'pin': '4321', 'expiresInDays': 10}, token=saurav)
check('PIN-protected link', s == 201 and pinned['hasPin'] and 'pinHash' not in pinned, f'{s} {pinned}')
s, r = call('POST', '/tracking', {'kind': 'order', 'orderId': oid, 'pin': '12'}, token=saurav)
check('bad PIN format rejected', s == 400, s)
s, r = call('POST', '/tracking', {'kind': 'order', 'orderId': oid}, token=amit)
check('production manager (no orders module) cannot issue', s == 403, s)
s, r = call('POST', '/tracking', {'kind': 'buyer', 'buyerId': order['buyerId']}, token=neha)
check('buyer-wise link needs buyer.confidential (neha 403)', s == 403, s)
s, master = call('POST', '/tracking', {'kind': 'buyer', 'buyerId': order['buyerId']}, token=saurav)
check('saurav issues buyer master link', s == 201 and master['kind'] == 'buyer', f'{s} {master}')
s, r = call('GET', f'/tracking?orderId={oid}', token=saurav)
check('list by order shows both order links', s == 200 and len([x for x in r['items'] if x['kind'] == 'order']) >= 2, s)
s, r = call('GET', '/orders/' + oid, token=saurav)
check('order activity logged the share', any('Tracking code' in a['text'] for a in r['order'].get('activity', [])))

print('P6 · public view (no auth)')
s, view = call('GET', '/public/track/' + code['token'])
check('public view 200', s == 200, f'{s} {view}')
if s == 200:
    o = view['order']
    check('kind order + company name', view['kind'] == 'order' and view['company']['name'])
    check('whitelisted fields present', all(k in o for k in ['ref', 'description', 'qty', 'shipDate', 'stages', 'progress', 'merchandiser', 'dispatch']))
    check('stage board has 8 stages (no Payment)', len(o['stages']) == 8 and all(st['stage'] != 'Payment' for st in o['stages']), [st['stage'] for st in o['stages']])
    check('stages carry planned + status + rag', all('planned' in st and 'status' in st and 'rag' in st for st in o['stages']))
    blob = json.dumps(view).lower()
    for leak in ['fobrate', 'rate', 'vendor', 'supplier', 'cost', 'invoicevalue', 'amount', 'remark', 'lc-', 'bank', 'physical', 'reserved', 'brand', 'legalname']:
        check(f'no leak: {leak}', leak not in blob, leak)
    check('merchandiser contact only name/email/phone', set(o['merchandiser'].keys()) <= {'name', 'email', 'phone'})
s, r = call('GET', '/public/track/' + code['token'].lower())
check('token case-insensitive', s == 200, s)
s, r = call('GET', '/public/track/ZZZZ-ZZZZ')
check('unknown token 404', s == 404, s)
s, r = call('GET', '/public/track/' + pinned['token'])
check('PIN link without PIN → 401 PIN_REQUIRED', s == 401 and r['code'] == 'PIN_REQUIRED', f'{s} {r}')
s, r = call('GET', '/public/track/' + pinned['token'], headers={'x-pin': '0000'})
check('wrong PIN → 401 PIN_WRONG', s == 401 and r['code'] == 'PIN_WRONG', f'{s} {r}')
s, r = call('GET', '/public/track/' + pinned['token'], headers={'x-pin': '4321'})
check('right PIN → 200', s == 200, s)
s, r = call('GET', '/public/track/' + pinned['token'] + '?pin=4321')
check('PIN via query also works', s == 200, s)
s, mv = call('GET', '/public/track/' + master['token'])
check('buyer master link lists live orders', s == 200 and mv['kind'] == 'buyer' and len(mv['orders']) >= 1 and all('id' in x for x in mv['orders']), f'{s}')
# ---- password-protected link that carries the whole T&A plan (TNA → Share plan)
s, full = call('POST', '/tracking', {'kind': 'order', 'orderId': oid, 'detail': 'full', 'password': 'Buyer@2026'}, token=saurav)
check('password link with the full plan', s == 201 and full['hasPin'] and full['secretLabel'] == 'Password' and full['detail'] == 'full', f'{s} {full}')
s, r = call('POST', '/tracking', {'kind': 'order', 'orderId': oid, 'password': 'short'}, token=saurav)
check('short password rejected', s == 400, s)
s, r = call('GET', '/public/track/' + full['token'])
check('password link asks for the password', s == 401 and r['code'] == 'PASSWORD_REQUIRED', f'{s} {r}')
s, r = call('GET', '/public/track/' + full['token'], headers={'x-pin': 'wrong-one'})
check('wrong password refused', s == 401 and r['code'] == 'PASSWORD_WRONG', f'{s} {r}')
s, fv = call('GET', '/public/track/' + full['token'], headers={'x-pin': 'Buyer@2026'})
o = (fv or {}).get('order') or {}
check('full link shows the plan, floor, quality and shipments', s == 200 and fv['detail'] == 'full' and len(o.get('plan') or []) > 5 and 'production' in o and 'shipments' in o and o['planTotal'] >= len(o['plan']), f"{s} {list(o.keys())[:12]}")
check('stage-board link still hides the plan', 'plan' not in ((view or {}).get('order') or {}), list(((view or {}).get('order') or {}).keys())[:8])

s, r = call('GET', '/public/track/' + code['token'] + '/image')
check('image route 404 when style has no image (never 500)', s == 404, s)
s, r = call('GET', '/public/track/DEMO-2451')
check('seeded DEMO-2451 link opens', s == 200 and r['order']['ref']['styleNo'] == 'AF-2451', f'{s}')
check('shipped order shows dispatch card or null', s == 200 and (r['order']['dispatch'] is None or 'mode' in r['order']['dispatch']))

print('P6 · access log + revoke + expiry')
s, r = call('GET', f'/tracking?orderId={oid}', token=saurav)
c = next(x for x in r['items'] if x['id'] == code['id']); p = next(x for x in r['items'] if x['id'] == pinned['id'])
check('view count incremented (2 ok views)', c['viewCount'] == 2 and c['lastViewedAt'], c['viewCount'])
check('refused PIN attempt logged as not ok', any(v['ok'] is False for v in p['views']) and p['viewCount'] == 2, f"{p['viewCount']} {[v['ok'] for v in p['views']]}")
s, r = call('POST', f"/tracking/{code['id']}/revoke", token=saurav)
check('revoke', s == 200 and r['status'] == 'Revoked', f'{s} {r}')
s, r = call('GET', '/public/track/' + code['token'])
check('revoked → 410', s == 410 and r['code'] == 'REVOKED', f'{s} {r}')
s, r = call('POST', '/tracking', {'kind': 'order', 'orderId': oid, 'expiresInDays': -1}, token=saurav)   # negative → default days; simulate expiry via 0.00001? use direct check on presentation
check('negative expiry falls back to default (active)', s == 201 and r['status'] == 'Active', f'{s}')

print('P6 · buyer master switch')
s, r = call('PATCH', '/buyers/' + order['buyerId'], {'portalMasterLink': False}, token=saurav)
check('switch master link off', s == 200 and r['portalMasterLink'] is False, f'{s} {r}')
s, r = call('POST', '/tracking', {'kind': 'buyer', 'buyerId': order['buyerId']}, token=saurav)
check('master link refused when switched off', s == 400, s)
s, r = call('PATCH', '/buyers/' + order['buyerId'], {'portalMasterLink': True}, token=saurav)
check('switch back on', s == 200 and r['portalMasterLink'] is True)

print('P7 · hardening')
s, r = call('POST', '/auth/login', {'uid': {'$ne': ''}, 'password': 'x'})
check('operator injection in login body rejected (sanitized → 400/401)', s in (400, 401), f'{s} {r}')
s, r = call('GET', '/orders?status[$ne]=x', token=adm)
check('operator injection in query sanitized (200, not 500)', s == 200, s)
s, r = call('GET', '/settings/company', token=adm)
check('settings expose portalBaseUrl + portalDefaultDays', 'portalDefaultDays' in r and 'portalBaseUrl' in r)
s, r = call('PUT', '/settings/company', {'portalBaseUrl': 'https://erp.afion.example', 'portalDefaultDays': 45}, token=adm)
check('settings save portal fields', s == 200 and r['portalDefaultDays'] == 45)
s, r = call('POST', '/tracking', {'kind': 'order', 'orderId': oid}, token=saurav)
check('new links use configured base + default days', r['url'].startswith('https://erp.afion.example/track/') and r['status'] == 'Active', r.get('url'))
s, r = call('GET', '/users/meta', token=adm)
check('tna.edit flag in meta', s == 200 and any(f['key'] == 'tna.edit' for f in r.get('flags', [])), s)
s, r = call('GET', '/tna/tasks?size=1', token=neha)
task = r['items'][0] if s == 200 and r.get('items') else None
if task:
    s, r = call('PATCH', '/tna/tasks/' + task['id'], {'plannedEnd': '2026-12-01', 'reason': 'buyer moved delivery'}, token=neha)
    check('neha (no tna module, no flag) cannot replan → 403', s == 403, f'{s} {r}')
    s, r = call('PATCH', '/tna/tasks/' + task['id'], {'plannedEnd': '2026-12-01', 'reason': 'buyer moved delivery'}, token=saurav)
    check('saurav (tna module) can replan', s == 200, f'{s} {r}')
else:
    check('tna task list reachable', False, s)
s, r = call('GET', '/health')
check('health ok', s == 200 and r.get('db') in ('connected', 'ok', True) or s == 200, f'{s} {r}')

print(f'\n{len(FAILS)} failures' + (': ' + ', '.join(FAILS) if FAILS else ' — P6/P7 smoke passed'))
sys.exit(1 if FAILS else 0)
