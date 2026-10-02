import json, urllib.request, urllib.error, sys, os
BASE = os.environ.get('BASE', 'http://localhost:5001/api/v1')

def call(method, path, body=None, tok=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {tok}'} if tok else {})})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            data = r.read()
            return r.status, (data.decode('utf-8') if raw else json.loads(data or b'null'))
    except urllib.error.HTTPError as e:
        data = e.read()
        return e.code, (data.decode('utf-8') if raw else json.loads(data or b'null'))
def login(uid):
    st, d = call('POST', '/auth/login', {'uid': uid, 'password': 'Afion@123'}); assert st == 200, (uid, d); return d['accessToken'], d['user']
def ok(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name, extra)
    if not cond: sys.exit(1)

V, vu = login('vikram'); S, su = login('saurav'); A, au = login('amit'); N, nu = login('neha'); R, ru = login('ravi.gate')
ok('modules grew per role', 'tna' in su['modules'] and 'pattern' in su['modules'] and 'quality' in au['modules'] and 'pattern' in nu['modules'], (su['modules'], au['modules']))
ok('saurav has pattern.approve', 'pattern.approve' in su['flags'])

# ---- TNA
st, t = call('GET', '/tna/templates', tok=S); ok('default template', st == 200 and any(x['isDefault'] for x in t['items']) and len(t['items'][0]['items']) == 25, [(x['name'], len(x['items'])) for x in t['items']])
st, b = call('GET', '/tna/board', tok=S); ok('buyer board', st == 200 and len(b['buyers']) >= 1 and all(o['hasTna'] for g in b['buyers'] for o in g['orders']), [(g['buyer'], g['health'], [(o['orderNo'], o['done'], o['total'], o['health']) for o in g['orders']]) for g in b['buyers']])
ok('buyer masked for merch without flag', all(g['buyer'].startswith('B-') for g in b['buyers']) if 'buyer.confidential' not in su['flags'] else True)
st, o = call('GET', '/orders?q=AFI-1043', tok=V); oid = o['items'][0]['id']
st, ot = call('GET', f'/tna/orders/{oid}', tok=V); ok('order tna', st == 200 and ot['total'] == 25 and ot['done'] >= 5, (ot['done'], ot['total'], ot['health'], ot['red'], ot['amber']))
auto = [x for x in ot['tasks'] if x['status'] == 'Done']; ok('auto-filled events', any(x['key'] == 'cutting_start' for x in auto) and any(x['key'] == 'spec' for x in auto) and any(x['key'] == 'fabric_in' for x in auto), [x['key'] for x in auto])
red = [x for x in ot['tasks'] if x['rag'] == 'red']; ok('overdue tasks red (ship date is tomorrow)', len(red) >= 1, [(x['activity'], x['delayDays']) for x in red[:3]])
task = next(x for x in ot['tasks'] if x['status'] != 'Done')
st, e = call('PATCH', f"/tna/tasks/{task['id']}", {'plannedEnd': '2026-09-20'}, tok=S); ok('replan needs reason', st == 400)
st, r = call('PATCH', f"/tna/tasks/{task['id']}", {'plannedEnd': '2026-09-20', 'priority': 'Urgent', 'reason': 'Buyer moved the ship date', 'ownerUid': 'amit'}, tok=S)
ok('replan recorded', st == 200 and r['replanCount'] == 1 and r['priority'] == 'Urgent' and r['ownerUid'] == 'amit' and r['replans'][0]['reason'] == 'Buyer moved the ship date', r.get('replans'))
st, c = call('POST', f"/tna/tasks/{task['id']}/complete", {'remark': 'done manually'}, tok=A); ok('manual complete', st == 200 and c['status'] == 'Done' and c['rag'] == 'done')
st, c = call('POST', f"/tna/tasks/{task['id']}/reopen", tok=A); ok('reopen', st == 200 and c['status'] == 'In Progress')
st, m = call('GET', '/tna/tasks?mine=1&open=1', tok=A); ok('my tasks (amit) include reassigned', any(x['id'] == task['id'] for x in m['items']), len(m['items']))
st, sm = call('GET', '/tna/summary', tok=S); ok('tna summary', st == 200 and sm['red'] >= 1, sm)
st, e = call('GET', '/tna/board', tok=R); ok('gate man no tna module', st == 403)
st, e = call('GET', '/tna/tasks?mine=1', tok=R); ok('but tasks endpoint open to all', st == 200)
st, tp = call('POST', '/tna/templates', {'name': 'Knits — 45 day', 'productType': 'Knits'}, tok=S); ok('template create (default items)', st == 201 and len(tp['items']) == 25)
oid44 = oid
st, ap = call('POST', f'/tna/orders/{oid44}/apply', {'templateId': tp['id'], 'force': True}, tok=S); ok('re-apply with force keeps done tasks', st == 201 and 5 <= ap['created'] <= 21, ap)
ok('apply says which template the order now runs on', ap.get('template') == 'Knits — 45 day', ap.get('template'))
st, t44 = call('GET', f'/tna/orders/{oid44}', tok=S); ok('every task carries the template name', all(x['templateName'] in ('Knits — 45 day', 'Standard woven — 60 day') for x in t44['tasks']), sorted(set(x['templateName'] for x in t44['tasks'])))
auto = [x for x in t44['tasks'] if x['status'] == 'Done' and x['auto']]
ok('auto-completed tasks say so', all(x['doneLabel'] in ('Completed', 'Approved') for x in auto), [(x['activity'], x['doneLabel']) for x in auto][:3])
st, xl = call('GET', '/tna/export', tok=S, raw=True)
ok('excel export of the whole plan', st == 200 and '<b>Planned</b>' in xl and '<b>Actual</b>' in xl and 'P.O wise qty' in xl, len(xl))
st, xl1 = call('GET', f'/tna/export?orderId={oid44}', tok=S, raw=True)
ok('excel export of one order', st == 200 and xl1.count('<b>Planned</b>') == 1, xl1.count('<b>Planned</b>'))
st, e = call('GET', '/tna/export', tok=R, raw=True); ok('gate man cannot export the plan', st == 403)

# ---- pattern
st, p = call('GET', '/patterns', tok=N); ok('patterns list (neha)', st == 200 and p['total'] >= 1, [(x['patternNo'], x['status']) for x in p['items']])
ok('buyer masked for neha', all(x['buyerName'].startswith('B-') for x in p['items']))
import subprocess, tempfile
st, styles = call('GET', '/styles?size=50', tok=V); st2 = next(x for x in styles['items'] if x['styleNo'] == 'AF-2436')
st, rev = call('POST', '/patterns', {'styleId': st2['id'], 'baseSize': 'M', 'priority': 'High', 'dueDate': '2026-09-01'}, tok=N); ok('create pattern for review', st == 201 and rev['status'] == 'Draft', rev.get('patternNo'))
tmp = os.path.join(tempfile.gettempdir(), 'AF-2436-v1.dxf'); open(tmp, 'w').write('0 SECTION 2 ENTITIES 0 ENDSEC 0 EOF')
up = json.loads(subprocess.run(['curl', '-s', '-X', 'POST', BASE + '/files/upload', '-H', 'Authorization: Bearer ' + N, '-F', 'file=@' + tmp, '-F', 'refType=pattern', '-F', 'refId=' + rev['id']], capture_output=True, text=True).stdout)
st, rv = call('POST', f"/patterns/{rev['id']}/version", {'fileId': up['id'], 'note': 'base block'}, tok=N); ok('attach dxf version', st == 200 and rv['versions'][0]['kind'] == 'DXF', up.get('name'))
st, rv = call('POST', f"/patterns/{rev['id']}/submit", tok=N); ok('submit for review', st == 200 and rv['status'] == 'In Review')
st, o36 = call('GET', '/orders?size=50', tok=V); oid44 = oid
st, e = call('POST', f"/patterns/{rev['id']}/approve", tok=N); ok('neha cannot approve', st == 403)
st, e = call('POST', f"/patterns/{rev['id']}/reject", {'note': 'neckline'}, tok=S); ok('reject → draft', st == 200 and e['status'] == 'Draft' and e['reviewNote'] == 'neckline')
st, e = call('POST', f"/patterns/{rev['id']}/submit", tok=N); ok('resubmit', st == 200 and e['status'] == 'In Review')
st, e = call('POST', f"/patterns/{rev['id']}/approve", {'note': 'ok'}, tok=S); ok('approve by flag holder', st == 200 and e['status'] == 'Approved' and e['approvedBy'] == 'Saurav Mishra')
# pattern approval for AF-2451 (PT-0001 style) → TNA pattern task: approve a new pattern on that style and check the task
st, ok43 = call('GET', f'/tna/orders/{oid}', tok=V); pt_before = next(x for x in ok43['tasks'] if x['key'] == 'pattern')['status']
st, p43 = call('POST', '/patterns', {'styleId': next(x for x in styles['items'] if x['styleNo'] == 'AF-2451')['id'], 'baseSize': 'M'}, tok=N)
up2 = json.loads(subprocess.run(['curl', '-s', '-X', 'POST', BASE + '/files/upload', '-H', 'Authorization: Bearer ' + N, '-F', 'file=@' + tmp], capture_output=True, text=True).stdout)
call('POST', f"/patterns/{p43['id']}/version", {'fileId': up2['id'], 'note': 'v3 after fit'}, tok=N); call('POST', f"/patterns/{p43['id']}/submit", tok=N)
st, e = call('POST', f"/patterns/{p43['id']}/approve", {}, tok=S); ok('approve supersedes old approved', st == 200)
st, old = call('GET', '/patterns?size=50', tok=S); ok('PT-0001 superseded', any(x['patternNo'] == 'PT-0001' and x['status'] == 'Superseded' for x in old['items']))
st, ok43 = call('GET', f'/tna/orders/{oid}', tok=V); ok('pattern approval completed TNA task', next(x for x in ok43['tasks'] if x['key'] == 'pattern')['status'] == 'Done', pt_before)
st, e = call('POST', f"/patterns/{p43['id']}/issue", {'orderId': oid, 'issuedTo': 'Cutting Table 1'}, tok=S); ok('issue log', st == 200 and e['issues'][0]['orderNo'] == 'AFI-1043')
st, np = call('POST', '/patterns', {'styleId': p['items'][0]['styleId'], 'baseSize': 'L', 'priority': 'High'}, tok=N); ok('create pattern', st == 201 and np['patternNo'].startswith('PT-0') and np['status'] == 'Draft', np.get('patternNo'))
st, e = call('POST', f"/patterns/{np['id']}/submit", tok=N); ok('submit without file refused', st == 400)
st, ps = call('GET', '/patterns/summary', tok=S); ok('pattern summary', st == 200 and ps['approved'] >= 1, ps)

# ---- quality
st, qm = call('GET', '/quality/meta', tok=A); ok('defect master', st == 200 and len(qm['defects']) == 12 and len(qm['fabricCategories']) == 5)
st, plan = call('GET', '/quality/aql/plan?lotSize=12000&level=2.5', tok=A); ok('aql table', plan == {'sampleSize': 315, 'acceptNo': 14, 'rejectNo': 15, 'level': '2.5'}, plan)
st, mats = call('GET', '/materials?size=500', tok=V); fab = next(m for m in mats['items'] if m['code'] == 'FAB-0134')
free0 = fab['freeQty']
st, fi = call('POST', '/quality/fabric', {'materialId': fab['id'], 'lot': 'L-77', 'metersChecked': 100, 'widthInches': 58, 'defects': [{'category': 'Hole', 'p4': 20}, {'category': 'Weaving', 'p3': 10}]}, tok=A)
ok('fabric fail → hold', st == 201 and fi['result'] == 'Fail' and fi['hold'] and fi['pointsPer100'] > 20, (fi.get('pointsPer100'), fi.get('holdQty')))
st, mats = call('GET', '/materials?size=500', tok=V); fab1 = next(m for m in mats['items'] if m['code'] == 'FAB-0134'); ok('hold excluded from free stock', fab1['freeQty'] == free0 - fi['holdQty'], (free0, fab1['freeQty']))
st, rl = call('POST', f"/quality/fabric/{fi['id']}/release", {'reason': 'Re-inspected after sorting'}, tok=A); ok('release hold', st == 200 and not rl['hold'])
st, mats = call('GET', '/materials?size=500', tok=V); fab2 = next(m for m in mats['items'] if m['code'] == 'FAB-0134'); ok('free stock restored', fab2['freeQty'] == free0)
st, il = call('POST', '/quality/inline', {'orderId': oid, 'line': 'Line 5', 'checked': 200, 'defects': [{'code': 'BS', 'count': 9}, {'code': 'UT', 'count': 6}]}, tok=A); ok('inline dhu', st == 201 and il['dhu'] == 7.5 and il['totalDefects'] == 15, il.get('dhu'))
st, aq = call('POST', '/quality/aql', {'orderId': oid, 'stage': 'Final', 'lotSize': 12000, 'defects': [{'code': 'MO', 'count': 16}]}, tok=A); ok('final aql fail blocks dispatch', st == 201 and aq['result'] == 'Fail' and aq['blocksDispatch'] and aq['sampleSize'] == 315, (aq.get('result'), aq.get('majors'), aq.get('acceptNo')))
st, det = call('GET', f'/orders/{oid}', tok=V); ok('tower gate 8 bad', det['tower'][7]['k'] == 'bad' and 'blocked' in det['tower'][7]['s'], det['tower'][7])
st, aq2 = call('POST', '/quality/aql', {'orderId': oid, 'stage': 'Final', 'lotSize': 12000, 'defects': [{'code': 'UT', 'count': 5}]}, tok=A); ok('final aql pass', st == 201 and aq2['result'] == 'Pass' and not aq2['blocksDispatch'])
st, det = call('GET', f'/orders/{oid}', tok=V); ok('tower gate 8 ok + tna final_inspection done', det['tower'][7]['k'] == 'ok', det['tower'][7])
st, ot = call('GET', f'/tna/orders/{oid}', tok=V); ok('tna final inspection auto-done', next(x for x in ot['tasks'] if x['key'] == 'final_inspection')['status'] == 'Done')
st, qs = call('GET', '/quality/summary', tok=A); ok('quality summary', st == 200 and qs['dhuToday'] > 0, {k: qs[k] for k in ('dhuToday', 'dhu7', 'dhuLimit')})
st, rj = call('GET', '/quality/rejections', tok=A); ok('rejection analysis', st == 200 and rj['byType'][0]['count'] > 0 and any(l['name'] == 'Line 5' for l in rj['byLine']), rj['byType'][:2])
st, e = call('GET', '/quality/summary', tok=N); ok('neha no quality', st == 403)

# ---- alerts + my work
st, rc = call('POST', '/alerts/recompute', tok=V); ok('recompute', st == 200 and rc['open'] > 0, rc)
st, al = call('GET', '/alerts', tok=A); ok('amit alerts (jobwork/tna/quality)', st == 200 and al['total'] > 0 and any(a['ruleKey'].startswith('tna.') for a in al['items']), sorted(set(a['ruleKey'] for a in al['items'])))
st, al2 = call('GET', '/alerts?all=1', tok=V); ok('admin sees all', al2['total'] >= al['total'], al2['total'])
ok('quality.dhu alert exists', any(a['ruleKey'] == 'quality.dhu' for a in al2['items']))
ok('po.overdue alert exists', any(a['ruleKey'] == 'po.overdue' for a in al2['items']))
first = al['items'][0]
st, ak = call('POST', f"/alerts/{first['id']}/ack", tok=A); ok('acknowledge', st == 200 and ak['acknowledgedBy'] == 'Amit Prasad')
st, e = call('POST', '/alerts/recompute', tok=A); ok('non-admin cannot recompute', st == 403)
st, strip = call('GET', '/alerts?module=quality', tok=A); ok('module strip', st == 200 and all(a['module'] == 'quality' for a in strip['items']))
st, mw = call('GET', '/mywork', tok=A); ok('my work amit', st == 200 and mw['total'] > 0 and set(mw['counts']) == {'Overdue', 'Today', 'This week', 'Later'}, (mw['total'], mw['counts'], sorted(set(i['kind'] for i in mw['items']))))
st, mws = call('GET', '/mywork', tok=S); ok('my work saurav has approvals? (patterns none now) + tasks', st == 200, (mws['total'], sorted(set(i['kind'] for i in mws['items']))))
st, cnt = call('GET', '/mywork/count', tok=A); ok('count', st == 200 and cnt['total'] == mw['total'])
st, allq = call('GET', '/mywork/all', tok=V); ok('admin heatmap', st == 200 and len(allq['items']) >= 7)
st, e = call('GET', '/mywork/all', tok=A); ok('heatmap admin only', st == 403)
st, cfg = call('GET', '/settings/company', tok=V); ok('settings p4 knobs', cfg.get('tnaAmberDays') == 3 and cfg.get('aqlLevel') == '2.5' and cfg.get('fabricPointsLimit') == 20)
print('ALL PASS')
