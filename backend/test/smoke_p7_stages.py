import json, os, sys, urllib.request, urllib.error
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

adm = login('vikram'); saurav = login('saurav'); amit = login('amit'); neha = login('neha')
DEFAULT = ['Samples', 'Materials', 'Cutting', 'Stitching', 'Finishing', 'Packing', 'Inspection', 'Dispatch', 'Payment']

print('P7 · pipeline stages — read')
s, r = call('GET', '/tna/stages', token=neha)
check('any signed-in user can read the pipeline', s == 200 and [x['name'] for x in r['stages']] == DEFAULT, f'{s} {r if s != 200 else [x["name"] for x in r["stages"]]}')
check('stage rows carry usage counts + portal flag', s == 200 and all('tasks' in x and 'portal' in x for x in r['stages']) and r['stages'][-1]['portal'] is False)
check('defaults returned for reset', s == 200 and len(r['defaults']) == 9)
s, r = call('GET', '/tna/board', token=saurav)
check('board stages follow the pipeline', s == 200 and r['stages'] == DEFAULT)
s, meta = call('GET', '/tna/meta', token=saurav)
check('template meta stages follow the pipeline', s == 200 and meta['stages'] == DEFAULT)

print('P7 · pipeline stages — permissions & validation')
s, r = call('PUT', '/tna/stages', {'stages': DEFAULT}, token=amit)
check('production manager (tna module, no tna.edit) cannot change', s == 403, s)
s, r = call('PUT', '/tna/stages', {'stages': DEFAULT}, token=neha)
check('user without tna module cannot change', s == 403, s)
s, r = call('PUT', '/tna/stages', {'stages': []}, token=adm)
check('empty pipeline rejected', s == 400, f'{s} {r}')
s, r = call('PUT', '/tna/stages', {'stages': ['A', 'a']}, token=adm)
check('duplicate (case-insensitive) rejected', s == 400, f'{s} {r}')
s, r = call('PUT', '/tna/stages', {'stages': ['x' * 31]}, token=adm)
check('over-long name rejected', s == 400, f'{s} {r}')
s, r = call('PUT', '/tna/stages', {'stages': DEFAULT, 'renames': [{'from': 'Cutting', 'to': 'Nope'}]}, token=adm)
check('rename target must exist in the new list', s == 400, f'{s} {r}')

print('P7 · pipeline stages — rename + move + reorder')
s, o = call('GET', '/orders?q=AFI-1043', token=adm); oid = o['items'][0]['id']
s, before = call('GET', f'/tna/orders/{oid}', token=saurav)
cut_before = next(x for x in before['stages'] if x['stage'] == 'Cutting'); insp_before = next(x for x in before['stages'] if x['stage'] == 'Inspection')
custom = [{'name': 'Sampling', 'portal': True}, {'name': 'Fabric & Trims', 'portal': True}, {'name': 'Cutting', 'portal': True}, {'name': 'Sewing', 'portal': True}, {'name': 'Finishing', 'portal': True},
          {'name': 'Packing', 'portal': True}, {'name': 'Dispatch', 'portal': True}, {'name': 'Payment', 'portal': False}]
body = {'stages': custom, 'renames': [{'from': 'Samples', 'to': 'Sampling'}, {'from': 'Materials', 'to': 'Fabric & Trims'}, {'from': 'Stitching', 'to': 'Sewing'}], 'moves': [{'from': 'Inspection', 'to': 'Packing'}]}
s, r = call('PUT', '/tna/stages', body, token=saurav)
check('saurav (tna.edit) saves a custom pipeline', s == 200 and [x['name'] for x in r['stages']] == [x['name'] for x in custom], f'{s} {r}')
check('tasks + template items followed renames/moves', s == 200 and r['tasksTouched'] > 0 and r['itemsTouched'] > 0, f'{s} {r if s != 200 else (r["tasksTouched"], r["itemsTouched"])}')
check('nothing left unlisted', s == 200 and r['unlisted'] == [], r.get('unlisted') if s == 200 else r)
s, after = call('GET', f'/tna/orders/{oid}', token=saurav)
sew = next(x for x in after['stages'] if x['stage'] == 'Sewing'); pack = next(x for x in after['stages'] if x['stage'] == 'Packing')
check('order roll-up uses new names in the new order', [x['stage'] for x in after['stages']] == [x['name'] for x in custom], [x['stage'] for x in after['stages']])
check('renamed stage keeps its tasks', sew['total'] == next(x for x in before['stages'] if x['stage'] == 'Stitching')['total'] and sew['total'] > 0)
check('moved stage tasks landed in the target', pack['total'] == next(x for x in before['stages'] if x['stage'] == 'Packing')['total'] + insp_before['total'])
check('untouched stage unchanged', next(x for x in after['stages'] if x['stage'] == 'Cutting')['total'] == cut_before['total'])
s, tpl = call('GET', '/tna/templates', token=saurav)
check('template activities renamed', s == 200 and not any(it['stage'] in ('Samples', 'Materials', 'Stitching', 'Inspection') for t in tpl['items'] for it in t['items']))
s, r = call('GET', '/tna/board', token=saurav)
check('board follows new pipeline', s == 200 and r['stages'] == [x['name'] for x in custom] and all([c['stage'] for c in o['stages']] == r['stages'] for b in r['buyers'] for o in b['orders'] if o['hasTna']))
s, r = call('GET', '/tna/meta', token=saurav)
check('new template defaults map unknown stages to the first stage', s == 200 and all(a['stage'] in r['stages'] for a in r['activities']), s)
s, r = call('GET', '/public/track/DEMO-2451')
check('portal shows buyer-visible stages only (no Payment)', s == 200 and [x['stage'] for x in r['order']['stages']] == [x['name'] for x in custom if x['portal']], f'{s} {[x["stage"] for x in r["order"]["stages"]] if s == 200 else r}')

print('P7 · pipeline stages — removal without move keeps tasks visible')
s, r = call('PUT', '/tna/stages', {'stages': [x for x in custom if x['name'] != 'Finishing']}, token=adm)
check('stage removed without a move', s == 200 and any(u['name'] == 'Finishing' for u in r['unlisted']), f'{s} {r.get("unlisted") if s == 200 else r}')
s, after = call('GET', f'/tna/orders/{oid}', token=saurav)
fin = next((x for x in after['stages'] if x['stage'] == 'Finishing'), None)
check('order roll-up still shows the leftover stage, flagged unlisted', fin is not None and fin.get('unlisted') is True and fin['total'] > 0, fin)
s, r = call('PUT', '/tna/stages', {'stages': [x for x in custom if x['name'] != 'Finishing'], 'moves': [{'from': 'Finishing', 'to': 'Sewing'}]}, token=adm)
check('later move of the leftover stage works', s == 200 and r['unlisted'] == [] and r['tasksTouched'] > 0, f'{s} {r if s != 200 else r["unlisted"]}')

print('P7 · pipeline stages — reset to defaults')
body = {'stages': [{'name': n, 'portal': n != 'Payment'} for n in DEFAULT], 'renames': [{'from': 'Sampling', 'to': 'Samples'}, {'from': 'Fabric & Trims', 'to': 'Materials'}, {'from': 'Sewing', 'to': 'Stitching'}]}
s, r = call('PUT', '/tna/stages', body, token=adm)
check('defaults restored', s == 200 and [x['name'] for x in r['stages']] == DEFAULT and r['unlisted'] == [], f'{s} {r if s != 200 else ""}')

print('P7 · pipeline stages — chained renames key on the original stage')
s, before = call('GET', f'/tna/orders/{oid}', token=adm)
tot = lambda d, n: next((x['total'] for x in d['stages'] if x['stage'] == n), 0)
pack, insp = tot(before, 'Packing'), tot(before, 'Inspection')
chained = [n if n not in ('Packing', 'Inspection') else {'Packing': 'Inspection', 'Inspection': 'Final Inspection'}[n] for n in DEFAULT]
s, r = call('PUT', '/tna/stages', {'stages': [{'name': n, 'portal': n != 'Payment'} for n in chained], 'renames': [{'from': 'Packing', 'to': 'Inspection'}, {'from': 'Inspection', 'to': 'Final Inspection'}]}, token=adm)
s, after = call('GET', f'/tna/orders/{oid}', token=adm)
check('Packing→Inspection then Inspection→Final Inspection does not merge them', tot(after, 'Inspection') == pack and tot(after, 'Final Inspection') == insp, f'{tot(after, "Inspection")}/{tot(after, "Final Inspection")} expected {pack}/{insp}')
s, r = call('PUT', '/tna/stages', {'stages': [{'name': n, 'portal': n != 'Payment'} for n in DEFAULT], 'renames': [{'from': 'Inspection', 'to': 'Packing'}, {'from': 'Final Inspection', 'to': 'Inspection'}]}, token=adm)
s, after = call('GET', f'/tna/orders/{oid}', token=adm)
check('reverse chain restores the original split', s == 200 and tot(after, 'Packing') == pack and tot(after, 'Inspection') == insp, f'{tot(after, "Packing")}/{tot(after, "Inspection")} expected {pack}/{insp}')
s, r = call('GET', '/settings/company', token=adm)
check('settings carry tnaStages', s == 200 and [x['name'] for x in r['tnaStages']] == DEFAULT)

print('P7 · pipeline stages — review fixes')
s, r = call('PUT', '/settings/company', {'tnaStages': ['Only']}, token=adm)
check('PUT /settings/company cannot overwrite the pipeline', s == 200 and [x['name'] for x in r['tnaStages']] == DEFAULT, f'{s} {[x["name"] for x in r.get("tnaStages", [])]}')
s, r = call('PUT', '/tna/stages', {'stages': DEFAULT, 'renames': [{'from': 'Cutting', 'to': 'Stitching'}]}, token=adm)
check('rename whose source is still live is rejected (would silently merge)', s == 400, f'{s} {r}')
s, r = call('PUT', '/tna/stages', {'stages': DEFAULT, 'renames': [None, 5, {'from': 'x'}]}, token=adm)
check('junk rename entries ignored, not a 500', s == 200, f'{s} {r}')
s, r = call('PUT', '/tna/stages', {'stages': [n if n != 'Cutting' else 'Cut  &  Sew' for n in DEFAULT], 'renames': [{'from': 'Cutting', 'to': 'Cut &  Sew'}]}, token=adm)
check('inner whitespace normalised on both sides', s == 200 and 'Cut & Sew' in [x['name'] for x in r['stages']] and r['tasksTouched'] > 0, f'{s} {r if s != 200 else [x["name"] for x in r["stages"]]}')
s, r = call('PUT', '/tna/stages', {'stages': DEFAULT, 'renames': [{'from': 'Cut & Sew', 'to': 'Cutting'}]}, token=adm)
check('renamed back', s == 200 and r['unlisted'] == [])
s, r = call('PUT', '/tna/stages', {'stages': ['Samples', 'Materials', 'Cutting', 'Stitching', 'Finishing', 'Packing', 'Inspection', 'Dispatch', 'Payment']}, token=adm)
check('plain-string stages keep the previous portal flag (Payment stays hidden)', s == 200 and next(x for x in r['stages'] if x['name'] == 'Payment')['portal'] is False, f'{s} {r if s != 200 else [(x["name"], x["portal"]) for x in r["stages"]]}')
s, r = call('PUT', '/tna/stages', {'stages': [n for n in DEFAULT if n != 'Payment'], 'moves': [{'from': 'Payment', 'to': 'Dispatch'}], 'renames': [{'from': 'Payment', 'to': 'Dispatch'}]}, token=adm)
check('same source in renames and moves rejected', s == 400, f'{s} {r}')
s, r = call('GET', '/public/track/DEMO-2451')
check('portal health ignores hidden stages', s == 200 and r['order']['health'] in ('green', 'amber', 'red', 'done', 'none'), s)
print(f"\n{len(FAILS)} failures" + (': ' + ', '.join(FAILS) if FAILS else ' — pipeline stages OK'))
sys.exit(1 if FAILS else 0)
