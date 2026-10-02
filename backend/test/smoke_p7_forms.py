import json, os, sys, urllib.request, urllib.error, uuid
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

adm = login('vikram'); saurav = login('saurav'); meena = login('meena'); amit = login('amit'); sunita = login('sunita'); neha = login('neha')

print('P7 · form-field registry')
s, r = call('GET', '/settings/forms', token=meena)
keys = [f['key'] for f in r.get('forms', [])] if s == 200 else []
check('26 forms listed with group + page', s == 200 and len(keys) == 26 and all('group' in f and 'page' in f for f in r['forms']), f'{s} {len(keys)}')
FF = {
    'buyers': [{'label': 'Buyer code', 'type': 'text', 'required': True}, {'label': 'Audit due', 'type': 'date'}],
    'po': [{'label': 'Delivery slot', 'type': 'select', 'options': 'Morning, Afternoon', 'required': True}],
    'users': [{'label': 'Shift worker', 'type': 'checkbox'}],
    'compliance': [{'label': 'Renewal fee (INR)', 'type': 'number'}],
    'production': [{'label': 'Machine no', 'type': 'text', 'required': True}],
    'quality_inline': [{'label': 'Auditor remarks', 'type': 'textarea'}],
    'vendors': [{'label': 'Vehicle access', 'type': 'select', 'options': 'Yes, No'}],
    'materials': [{'label': 'Shelf life (days)', 'type': 'number'}],
    'gate': [{'label': 'Seal intact', 'type': 'checkbox', 'required': True}],
    'jobwork': [{'label': 'Vendor PO ref', 'type': 'text'}],
    'dispatch': [{'label': 'Forwarder job no', 'type': 'text'}],
    'patterns': [{'label': 'CAD file ref', 'type': 'text'}],
    'orders': [{'label': 'Buyer season', 'type': 'select', 'options': 'SS27, AW27'}],
}
s, r = call('PUT', '/settings/company', {'formFields': FF}, token=adm)
check('define fields for 13 forms', s == 200 and len(r['formFields']) == 13, f'{s} {r if s != 200 else list(r["formFields"])}')
check('keys derived per form', s == 200 and r['formFields']['po'][0]['key'] == 'delivery_slot' and r['formFields']['buyers'][0]['key'] == 'buyer_code')
check('company payload no longer carries legacy sampleFields values', s == 200 and not r.get('sampleFields'))
s, r2 = call('PUT', '/settings/company', {'formFields': {'nope': [{'label': 'x', 'type': 'text'}]}}, token=adm)
check('unknown form key rejected', s == 400, f'{s} {r2}')
s, r2 = call('PUT', '/settings/company', {'formFields': {'po': [{'label': 'A', 'type': 'text'}, {'label': 'a', 'type': 'text'}]}}, token=adm)
check('duplicate key inside a form rejected', s == 400 and 'Purchase Order' in r2.get('message', ''), f'{s} {r2}')

print('P7 · values on crud forms')
s, r = call('POST', '/buyers', {'brand': 'FormTest Retail', 'country': 'Spain'}, token=saurav)
check('buyer: required custom enforced', s == 400 and 'Buyer code' in r.get('message', ''), f'{s} {r}')
s, buyer = call('POST', '/buyers', {'brand': 'FormTest Retail', 'country': 'Spain', 'custom': {'buyer_code': 'FT-01', 'audit_due': '2026-12-01', 'junk': 1}}, token=saurav)
check('buyer created with custom (junk dropped)', s == 201 and buyer['custom']['buyer_code'] == 'FT-01' and buyer['custom']['audit_due'].startswith('2026-12-01') and 'junk' not in buyer['custom'], f'{s} {buyer}')
s, r = call('PATCH', f"/buyers/{buyer['id']}", {'country': 'Portugal'}, token=saurav)
check('buyer PATCH without custom keeps values', s == 200 and r['custom']['buyer_code'] == 'FT-01' and r['country'] == 'Portugal', f'{s} {r.get("custom")}')
s, r = call('PATCH', f"/buyers/{buyer['id']}", {'custom': {'audit_due': ''}}, token=saurav)
check('buyer PATCH partial custom merges (required kept, date cleared)', s == 200 and r['custom']['buyer_code'] == 'FT-01' and 'audit_due' not in r['custom'], f'{s} {r.get("custom")}')
s, r = call('GET', '/buyers?q=FormTest', token=neha)
check('masked users never see custom values', s == 200 and 'custom' not in r['items'][0], s)
s, mats = call('GET', '/materials?size=5', token=meena); mat = mats['items'][0]
s, r = call('PATCH', f"/materials/{mat['id']}", {'custom': {'shelf_life_days': '180'}}, token=meena)
check('material: number coerced', s == 200 and r['custom']['shelf_life_days'] == 180, f'{s} {r.get("custom") if s == 200 else r}')
s, vend = call('GET', '/vendors?size=5', token=amit); v = vend['items'][0]
s, r = call('PATCH', f"/vendors/{v['id']}", {'custom': {'vehicle_access': 'Maybe'}}, token=amit)
check('vendor: dropdown value validated', s == 400, f'{s} {r}')
s, r = call('PATCH', f"/vendors/{v['id']}", {'custom': {'vehicle_access': 'Yes'}}, token=amit)
check('vendor: dropdown value saved', s == 200 and r['custom']['vehicle_access'] == 'Yes', f'{s} {r if s != 200 else ""}')
s, sups = call('GET', '/suppliers?size=5', token=amit); sup = sups['items'][0]
s, r = call('POST', '/po', {'materialId': mat['id'], 'supplierId': sup['id'], 'orderedQty': 100, 'rate': 10}, token=meena)
check('po: required dropdown enforced', s == 400 and 'Delivery slot' in r.get('message', ''), f'{s} {r}')
s, po = call('POST', '/po', {'materialId': mat['id'], 'supplierId': sup['id'], 'orderedQty': 100, 'rate': 10, 'custom': {'delivery_slot': 'Morning'}}, token=meena)
check('po: created with custom', s == 201 and po['custom']['delivery_slot'] == 'Morning', f'{s} {po}')

print('P7 · values on non-crud forms')
s, r = call('POST', '/users', {'name': 'Form Tester', 'uid': 'formtest', 'password': 'Afion@123', 'role': 'Gate Man', 'custom': {'shift_worker': True}}, token=adm)
check('user: checkbox custom saved and returned', s == 201 and r['custom']['shift_worker'] is True, f'{s} {r}')
uid = r['id'] if s == 201 else None
if uid:
    s, r = call('PATCH', f'/users/{uid}', {'custom': {'shift_worker': False}}, token=adm)
    check('user: custom updated', s == 200 and r['custom']['shift_worker'] is False, f'{s} {r}')
s, doc = call('POST', '/compliance', {'title': 'Form test licence', 'category': 'Company licence', 'custom': {'renewal_fee_inr': '2500'}}, token=sunita)
check('compliance: custom number on create', s == 201 and doc['custom']['renewal_fee_inr'] == 2500, f'{s} {doc}')
s, r = call('PATCH', f"/compliance/{doc['id']}", {'custom': {'renewal_fee_inr': 3000}}, token=sunita)
check('compliance: custom on patch', s == 200 and r['custom']['renewal_fee_inr'] == 3000, f'{s} {r if s != 200 else ""}')
s, o = call('GET', '/orders?q=AFI-1043', token=adm); oid = o['items'][0]['id']
s, r = call('POST', '/production/logs', {'orderId': oid, 'op': 'Stitching', 'output': 10, 'where': 'Line 3'}, token=amit)
check('production log: required custom enforced', s == 400 and 'Machine no' in r.get('message', ''), f'{s} {r}')
s, r = call('POST', '/production/logs', {'orderId': oid, 'op': 'Stitching', 'output': 10, 'where': 'Line 3', 'custom': {'machine_no': 'M-14'}}, token=amit)
check('production log: created with custom', s in (200, 201), f'{s} {r}')
s, logs = call('GET', f'/production/logs?orderId={oid}', token=amit)
check('production log: custom stored', s == 200 and any((l.get('custom') or {}).get('machine_no') == 'M-14' for l in logs.get('items', logs if isinstance(logs, list) else [])), s)
s, r = call('POST', '/quality/inline', {'orderId': oid, 'line': 'Line 3', 'checked': 50, 'defects': [], 'custom': {'auditor_remarks': 'clean run'}}, token=amit)
check('inline inspection: textarea custom', s in (200, 201) and r['custom']['auditor_remarks'] == 'clean run', f'{s} {r}')
s, gp = call('GET', '/gate/pending', token=meena)
pend = next((x for x in gp['items'] if x.get('kind', 'po') == 'po' and x.get('pendingQty', 0) > 1), None)
if pend:
    s, r = call('POST', '/gate', {'clientUuid': str(uuid.uuid4()), 'kind': 'po', 'refId': pend['id'], 'receivedQty': 1}, token=meena)
    check('gate entry: required checkbox enforced', s == 400 and 'Seal intact' in r.get('message', ''), f'{s} {r}')
    s, r = call('POST', '/gate', {'clientUuid': str(uuid.uuid4()), 'kind': 'po', 'refId': pend['id'], 'receivedQty': 1, 'custom': {'seal_intact': True}}, token=meena)
    check('gate entry: created with custom', s == 201 and r['entry']['custom']['seal_intact'] is True, f'{s} {r}')
else:
    check('gate: open PO available for test', False, 'none pending')

print('P7 · removing a field hides it but keeps stored values')
s, r = call('PUT', '/settings/company', {'formFields': {**FF, 'buyers': [{'label': 'Audit due', 'type': 'date'}]}}, token=adm)
check('buyer code field removed', s == 200 and [x['key'] for x in r['formFields']['buyers']] == ['audit_due'])
s, r = call('GET', f"/buyers/{buyer['id']}", token=saurav)
check('old value still on the record', s == 200 and r['custom'].get('buyer_code') == 'FT-01', f'{s} {r.get("custom")}')
s, r = call('POST', '/buyers', {'brand': 'FormTest Two', 'country': 'Italy'}, token=saurav)
check('new buyer no longer needs the removed field', s == 201 and r.get('custom', {}) == {}, f'{s} {r}')

print('P7 · more field types')
s, r = call('GET', '/settings/forms', token=adm)
check('registry lists 18 field types and built-in fields with keys', s == 200 and len(r.get('types', [])) == 18 and all(all('key' in x for x in f['fields']) for f in r['forms']), f'{s}')
TYPES = {'buyers': [{'label': 'Contact e-mail 2', 'type': 'email'}, {'label': 'Hotline', 'type': 'phone'}, {'label': 'Website', 'type': 'url'}, {'label': 'Credit limit', 'type': 'money'}, {'label': 'Margin', 'type': 'percent'},
          {'label': 'Service rating', 'type': 'rating'}, {'label': 'Markets', 'type': 'multiselect', 'options': 'EU, UK, US'}, {'label': 'Tier', 'type': 'radio', 'options': 'A, B, C'}, {'label': 'Brand colour', 'type': 'color'},
          {'label': 'Cut-off time', 'type': 'time'}, {'label': 'Next call', 'type': 'datetime'}, {'label': 'Agreement', 'type': 'file'}]}
s, r = call('PUT', '/settings/company', {'formFields': TYPES}, token=adm)
check('12 typed fields defined', s == 200 and len(r['formFields']['buyers']) == 12, f'{s} {r if s != 200 else ""}')
ok = {'contact_e_mail_2': 'Anna@Test.COM', 'hotline': '+34 600 123 456', 'website': 'https://testmart.example', 'credit_limit': '12500.456', 'margin': 32.5, 'service_rating': 4,
      'markets': ['EU', 'UK'], 'tier': 'B', 'brand_colour': '#E0813F', 'cut_off_time': '14:30', 'next_call': '2026-10-05T10:30:00.000Z', 'agreement': {'id': '6aa3d28efcaa79363ba59fcf', 'name': 'agreement.pdf', 'size': 1234}}
s, r = call('PATCH', f"/buyers/{buyer['id']}", {'custom': ok}, token=saurav)
c = r.get('custom', {}) if s == 200 else {}
check('all types accepted and coerced', s == 200 and c.get('contact_e_mail_2') == 'anna@test.com' and c.get('credit_limit') == 12500.46 and c.get('markets') == ['EU', 'UK'] and c.get('brand_colour') == '#e0813f' and c.get('agreement', {}).get('name') == 'agreement.pdf' and c.get('service_rating') == 4, f'{s} {r}')
for label, bad in [('email', {'contact_e_mail_2': 'not-an-email'}), ('phone', {'hotline': 'call me'}), ('url', {'website': 'testmart.example'}), ('percent', {'margin': 120}), ('rating', {'service_rating': 7}),
                   ('multiselect', {'markets': ['EU', 'Mars']}), ('radio', {'tier': 'D'}), ('colour', {'brand_colour': 'orange'}), ('time', {'cut_off_time': '25:99'}), ('file', {'agreement': 'nope'})]:
    s, r = call('PATCH', f"/buyers/{buyer['id']}", {'custom': bad}, token=saurav)
    check(f'{label}: invalid value rejected', s == 400, f'{s} {r}')

print('P7 · built-in field overrides')
ov = {'po': {'rate_uom': {'label': 'Unit rate', 'placeholder': '₹ per UOM'}, 'against_order': {'hidden': True}, 'expected_delivery': {'required': True, 'hint': 'ETA promised by supplier'}}}
s, r = call('PUT', '/settings/company', {'fieldOverrides': ov}, token=adm)
check('overrides saved', s == 200 and r['fieldOverrides']['po']['rate_uom']['label'] == 'Unit rate' and r['fieldOverrides']['po']['against_order']['hidden'] is True, f'{s} {r if s != 200 else r.get("fieldOverrides")}')
s, r = call('PUT', '/settings/company', {'fieldOverrides': {'po': {'material': {'hidden': True}}}}, token=adm)
check('system-required field cannot be hidden', s == 400, f'{s} {r}')
s, r = call('PUT', '/settings/company', {'fieldOverrides': {'po': {'material': {'required': False}}}}, token=adm)
check('system-required field cannot be made optional', s == 400, f'{s} {r}')
s, r = call('PUT', '/settings/company', {'fieldOverrides': {'po': {'material': {'label': 'Fabric / trim'}}}}, token=adm)
check('system-required field can still be renamed', s == 200 and r['fieldOverrides']['po']['material']['label'] == 'Fabric / trim', f'{s} {r}')
s, r = call('PUT', '/settings/company', {'fieldOverrides': {'gate': {'photo_of_challan_vehicle': {'label': 'x'}}}}, token=adm)
check('fixed system control cannot be overridden', s == 400, f'{s} {r}')
s, r = call('PUT', '/settings/company', {'fieldOverrides': {'po': {'nope': {'label': 'x'}}}}, token=adm)
check('unknown built-in key rejected', s == 400, f'{s} {r}')
s, r = call('PUT', '/settings/company', {'fieldOverrides': {'samples': {'courier_notes': {'type': 'select', 'options': 'Box, Envelope'}, 'accessories': {'type': 'textarea'}}}}, token=adm)
check('text built-in can become dropdown / long text', s == 200 and r['fieldOverrides']['samples']['courier_notes']['options'] == ['Box', 'Envelope'] and r['fieldOverrides']['samples']['accessories']['type'] == 'textarea', f'{s} {r if s != 200 else ""}')
s, r = call('PUT', '/settings/company', {'fieldOverrides': {'po': {'quantity': {'type': 'textarea'}}}}, token=adm)
check('number built-in cannot change type', s == 400, f'{s} {r}')
s, r = call('PUT', '/settings/company', {'fieldOverrides': {'samples': {'courier_notes': {'type': 'select'}}}}, token=adm)
check('dropdown conversion needs options', s == 400, f'{s} {r}')
s, r = call('PUT', '/settings/company', {'fieldOverrides': {'po': {'rate_uom': {'label': 'Rate (₹ / UOM)'}}}}, token=adm)
check('override equal to the default is dropped', s == 200 and r.get('fieldOverrides', {}) == {}, f'{s} {r.get("fieldOverrides") if s == 200 else r}')

s, r = call('PUT', '/settings/company', {'formFields': {}, 'fieldOverrides': {}}, token=adm)
check('all form fields cleared', s == 200 and r.get('formFields', {}) == {} and r.get('fieldOverrides', {}) == {})
print(f"\n{len(FAILS)} failures" + (': ' + ', '.join(FAILS) if FAILS else ' — form fields on all forms OK'))
sys.exit(1 if FAILS else 0)
