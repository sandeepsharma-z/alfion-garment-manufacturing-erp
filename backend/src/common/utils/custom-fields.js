const ApiError = require('./api-error');

/**
 * Admin-defined extra inputs per form (Settings → Form Fields). Definitions live on the company settings
 * document (`formFields[formKey]`); values are stored on the entity under `custom[fieldKey]`.
 */
const keyOf = (label) => String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
/* built-in inputs (label · type · system-required · aliases for labels that change with context). `fixed` = rendered by code, not a plain
   labelled input, so it is listed for completeness but cannot be overridden. */
const T = (label, type = 'text', required = false, opts = {}) => ({ key: keyOf(label), label, type, required, builtin: true, aliases: (opts.aliases || []).map(keyOf), fixed: !!opts.fixed });
const FORMS = [
  { key: 'samples', label: 'Sample Request', group: 'Merchandising', page: 'Sample Development', fields: [T('Buyer', 'select', true), T('Style No', 'text', true), T('Sample Type', 'select'), T('Product Description', 'text', true), T('Size Range'), T('Target Send Date', 'date'), T('Priority', 'select'), T('Piece / description', 'text', true), T('Fabric type'), T('Qty (pcs)', 'number'), T('Colour'), T('Sizes'), T('Notes for this piece'), T('Accessories'), T('Buyer Comments / Tech Pack Notes'), T('Specification sheet / tech pack', 'file', false, { fixed: true }), T('Courier method', 'select'), T('AWB / tracking no'), T('Receiver at buyer'), T('Courier notes')] },
  { key: 'orders', label: 'Order (convert from sample)', group: 'Merchandising', page: 'Sample Development → Convert to Order', fields: [T('Order Quantity (pcs)', 'number', true), T('Cutting Quantity (pcs)', 'number'), T('Buyer PO No'), T('FOB Price / pc (₹)', 'number'), T('Ship Date', 'date'), T('Payment Terms', 'select'), T('Shipment Mode', 'select'), T('Priority', 'select'), T('Size Breakdown %', 'list', false, { fixed: true }), T('Special Instructions')] },
  { key: 'buyer_orders', label: 'Buyer Order (purchase note)', group: 'Merchandising', page: 'Buyer Orders', fields: [T('Buyer', 'select', true), T('Buyer PO / purchase-note no', 'text', true), T('Order date', 'date'), T('Season'), T('Currency', 'select'), T('Exchange rate (₹)', 'number'), T('Payment terms'), T('Incoterm', 'select'), T('Latest shipment', 'date'), T('Delivery date', 'date'), T('Sales month'), T('Notes')] },
  { key: 'buyers', label: 'Buyer', group: 'Merchandising', page: 'Buyers', fields: [T('Brand / Trading Name', 'text', true), T('Legal Entity'), T('Country'), T('Currency'), T('Payment Terms'), T('Primary Contact'), T('Contact Role'), T('Contact Email'), T('Contact Phone'), T('Address'), T('Notes')] },
  { key: 'style_pom', label: 'Measurement Spec (POM)', group: 'Merchandising', page: 'Sample Development → Measurements', fields: [T('Size set', 'select'), T('Unit', 'select'), T('POM code'), T('POM name', 'text', true), T('Tolerance', 'number'), T('Spec per size', 'list', false, { fixed: true })] },
  { key: 'style_techpack', label: 'Tech Pack', group: 'Merchandising', page: 'Sample Development → Tech pack', fields: [T('Composition'), T('Lining'), T('Article'), T('Construction notes', 'textarea'), T('Label placement'), T('Packing method'), T('Accessory list (per pc)', 'list', false, { fixed: true })] },
  { key: 'style_approvals', label: 'Approvals Board', group: 'Merchandising', page: 'Sample Development → Approvals', fields: [T('Item', 'text', true), T('Group', 'select'), T('Due date', 'date'), T('Pcs per colour', 'number'), T('Received from factory', 'date'), T('Submitted to buyer', 'date'), T('AWB'), T('Approved on', 'date'), T('Comments received', 'date'), T('Status', 'select'), T('Comment')] },
  { key: 'patterns', label: 'Pattern', group: 'Merchandising', page: 'Patterns', fields: [T('Style', 'select', true), T('Linked sample round', 'select'), T('Pattern maker', 'select'), T('Base size'), T('Size range'), T('Grading', 'select'), T('Marker efficiency %', 'number'), T('Priority', 'select'), T('Approval due (TNA)', 'date'), T('Remarks')] },
  { key: 'materials', label: 'Material', group: 'Materials', page: 'Stock & Inventory', fields: [T('Code', 'text', true), T('Material Name', 'text', true), T('Category', 'select'), T('UOM', 'select'), T('Rate (₹ / UOM)', 'number'), T('Opening Qty', 'number'), T('Reorder Level', 'number'), T('Godown / Location', 'select'), T('Supplier', 'select'), T('Specification')] },
  { key: 'po', label: 'Purchase Order', group: 'Materials', page: 'Purchase Orders', fields: [T('Material', 'select', true), T('Quantity', 'number', true), T('Supplier', 'select', true), T('Rate (₹ / UOM)', 'number', false, { aliases: ['Rate'] }), T('Against Order', 'select'), T('Expected Delivery', 'date'), T('Payment Terms', 'select'), T('Delivery At', 'select'), T('Priority', 'select'), T('Specification & Notes')] },
  { key: 'gate', label: 'Gate Entry', group: 'Materials', page: 'Gate Entry', fields: [T('Document (PO / challan)', 'select', true), T('Current Received Qty', 'number', true, { aliases: ['Current Return Qty'] }), T('Rejected / Short', 'number'), T('Vehicle Number'), T('Driver Name'), T('Delivery Challan No', 'text', false, { aliases: ['Vendor Challan No'] }), T('Supplier Invoice No', 'text', false, { aliases: ['Vendor Invoice / Job Bill No'] }), T('Date', 'date'), T('Received By'), T('Inspection Result', 'select'), T('Store Location', 'select'), T('Remarks'), T('Photo of challan / vehicle', 'file', false, { fixed: true })] },
  { key: 'suppliers', label: 'Supplier', group: 'Production', page: 'Vendors & Suppliers', fields: [T('Supplier Name', 'text', true), T('Category', 'select'), T('Location'), T('GSTIN'), T('Payment Terms'), T('Lead Time (days)', 'number'), T('Contact Person'), T('Phone')] },
  { key: 'vendors', label: 'Job Work Vendor', group: 'Production', page: 'Vendors & Suppliers', fields: [T('Vendor Name', 'text', true), T('Process Category', 'select'), T('Location'), T('GSTIN'), T('Rate'), T('Daily Capacity'), T('On-Time %', 'number'), T('Rating (0–5)', 'number'), T('Contact Person'), T('Phone')] },
  { key: 'jobwork', label: 'Job Work Challan', group: 'Production', page: 'Job Work', fields: [T('Against Order', 'select', true), T('Process', 'select', true), T('Describe the process'), T('Vendor', 'select', true), T('Rate (₹ / unit)', 'number', false, { aliases: ['Rate'] }), T('Material Issued (from stock)', 'select'), T('UOM', 'select'), T('Item Description', 'text', true), T('Issue Quantity', 'number', true), T('Issue Date', 'date'), T('Expected Return', 'date'), T('Priority', 'select'), T('Process Instructions')] },
  { key: 'production', label: 'Production Log', group: 'Production', page: 'Production Floor', fields: [T('Order', 'select', true), T('Stage', 'select', true), T('Line / Section', 'select'), T('Date', 'date'), T('Output Quantity (pcs)', 'number', true), T('Rejection / Alter', 'number'), T('Manpower', 'number'), T('Supervisor')] },
  { key: 'cutting', label: 'Daily Cutting Report (AFN/11)', group: 'Production', page: 'Production Floor → Cutting', fields: [T('Order', 'select', true), T('Colour'), T('Fabric', 'select'), T('Lot no'), T('Thans', 'number'), T('Width (inches)', 'number'), T('Layers', 'number'), T('Fabric issued (m)', 'number'), T('Fabric consumed (m)', 'number'), T('End bits (m)', 'number'), T('Size-wise cut pcs', 'list', false, { fixed: true }), T('Cutting table', 'select'), T('Cutter'), T('Remarks')] },
  { key: 'loading', label: 'Loading Plan', group: 'Production', page: 'Production Floor → Loading plan', fields: [T('Date', 'date', true), T('Line', 'select', true), T('Process', 'select'), T('Order', 'select', true), T('Colour'), T('Target (pcs)', 'number'), T('Note')] },
  { key: 'quality_fabric', label: 'Fabric Inspection (4-point)', group: 'Quality', page: 'Quality → Fabric 4-point', fields: [T('Fabric', 'select', true), T('GRN'), T('Lot no'), T('Metres inspected', 'number', true), T('Width (inches)', 'number'), T('Colour'), T('GSM'), T('Defect points by category (1–4)', 'list', false, { fixed: true }), T('Inspector'), T('Date', 'date'), T('Remarks')] },
  { key: 'quality_inline', label: 'Inline / DHU Inspection', group: 'Quality', page: 'Quality → Inline & DHU', fields: [T('Order', 'select', true), T('Line', 'select'), T('Type', 'select'), T('Stage', 'select'), T('Pieces checked', 'number', true), T('Defect counts', 'list', false, { fixed: true }), T('Date', 'date'), T('Inspector')] },
  { key: 'quality_aql', label: 'Mid / Final AQL Inspection', group: 'Quality', page: 'Quality → Mid / Final AQL', fields: [T('Order', 'select', true), T('Stage', 'select'), T('AQL level', 'select'), T('Lot size (pcs)', 'number', true), T('Sample size', 'number'), T('Accept / Reject', 'number'), T('Sampling', 'select'), T('Inspector'), T('Inspector type', 'select'), T('Merchandiser'), T('Date', 'date'), T('Cartons opened / total', 'number'), T('Colour'), T('Site'), T('Defect counts + workmanship checks', 'list', false, { fixed: true }), T('Result / hold reason', 'select', false, { fixed: true }), T('Report / photos', 'file', false, { fixed: true })] },
  { key: 'quality_measure', label: 'Measurement Inspection (AFN/22)', group: 'Quality', page: 'Quality → Measurement', fields: [T('Order', 'select', true), T('Stage', 'select'), T('Size', 'select', true), T('Colour'), T('Date', 'date'), T('Measured pieces per POM', 'list', false, { fixed: true }), T('Inspector'), T('Remarks')] },
  { key: 'needle', label: 'Broken Needle Register (AFN/17)', group: 'Quality', page: 'Quality → Needle & blade', fields: [T('Date', 'date'), T('Time', 'time'), T('Line', 'select'), T('Machine no'), T('Operator'), T('Order'), T('Needle type'), T('Needle size'), T('Parts recovered', 'list', false, { fixed: true }), T('All parts found', 'checkbox'), T('Garment checked with detector', 'checkbox'), T('New needle issued', 'checkbox'), T('Supervisor'), T('Remarks')] },
  { key: 'blade', label: 'Blade Register (AFN/13)', group: 'Quality', page: 'Quality → Needle & blade', fields: [T('Date', 'date'), T('Kind', 'select'), T('Received', 'number'), T('Issued', 'number'), T('Broken', 'number'), T('Returned', 'number'), T('Issued to'), T('Machine no'), T('Remarks')] },
  { key: 'dispatch', label: 'Export Invoice', group: 'Outward', page: 'Dispatch', fields: [T('Order', 'select', true), T('Invoice date', 'date'), T('Shipment mode', 'select'), T('Port of loading'), T('Port of discharge'), T('Incoterm', 'select'), T('Quantity (pcs)', 'number'), T('Cartons', 'number', true), T('Gross weight (kg)', 'number'), T('Net weight (kg)', 'number'), T('Invoice value (₹)', 'number', false, { aliases: ['Invoice value'] }), T('Payment method', 'select'), T('Transporter / CHA'), T('Documents to prepare', 'list', false, { fixed: true })] },
  { key: 'compliance', label: 'Compliance Document', group: 'Outward', page: 'Compliance', fields: [T('Title', 'text', true), T('Category', 'select', true), T('Issuing authority'), T('Number'), T('Responsible user', 'select'), T('Issue date', 'date'), T('Expiry / renewal date', 'date'), T('Confidential', 'checkbox'), T('Notes')] },
  { key: 'users', label: 'User', group: 'System', page: 'Users', fields: [T('Full Name', 'text', true), T('User ID (login)', 'text', true), T('Password', 'text', true), T('Role', 'select'), T('Status', 'select'), T('Phone (optional)', 'text', false, { aliases: ['Phone'] }), T('Module Access', 'list', false, { fixed: true }), T('Confidential Access', 'list', false, { fixed: true })] },
];
const FORM_KEYS = FORMS.map((f) => f.key);
const TYPES = ['text', 'textarea', 'number', 'money', 'percent', 'date', 'datetime', 'time', 'select', 'radio', 'multiselect', 'checkbox', 'rating', 'email', 'phone', 'url', 'color', 'file'];
const NEEDS_OPTIONS = ['select', 'radio', 'multiselect'];

/** Field definitions: keys are derived from labels (stable, url-safe); duplicates and empty dropdowns are rejected. */
const cleanFields = (list, formLabel = '') => {
  const out = []; const seen = new Set();
  for (const f of Array.isArray(list) ? list : []) {
    const label = String(f.label || '').trim(); if (!label) continue;
    const key = String(f.key || '').trim() || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || `field_${out.length + 1}`;
    if (seen.has(key)) throw ApiError.badRequest(`${formLabel ? `${formLabel}: ` : ''}two fields resolve to the same key "${key}" — rename one of them`);
    seen.add(key);
    const type = TYPES.includes(f.type) ? f.type : 'text';
    const options = NEEDS_OPTIONS.includes(type) ? [...new Set((Array.isArray(f.options) ? f.options : String(f.options || '').split(',')).map((o) => String(o).trim()).filter(Boolean))] : [];
    if (NEEDS_OPTIONS.includes(type) && !options.length) throw ApiError.badRequest(`${formLabel ? `${formLabel}: ` : ''}field "${label}" needs a list of options`);
    out.push({ key, label, type, options, required: !!f.required, placeholder: String(f.placeholder || ''), hint: String(f.hint || '') });
  }
  return out;
};
const cleanFormFields = (obj) => {
  const out = {};
  for (const [form, list] of Object.entries(obj && typeof obj === 'object' ? obj : {})) {
    if (!FORM_KEYS.includes(form)) throw ApiError.badRequest(`Unknown form "${form}"`);
    const fields = cleanFields(list, FORMS.find((f) => f.key === form).label);
    if (fields.length) out[form] = fields;
  }
  return out;
};

const fieldsFor = async (form) => {
  const { getCompany } = require('../../modules/settings/settings.routes');   // lazy — settings.routes requires this file
  return ((await getCompany()).formFields || {})[form] || [];
};

/** Validate + coerce the values submitted for a form; `existing` lets a partial PATCH keep untouched keys. */
const cleanCustom = async (form, raw, existing = {}) => {
  const fields = await fieldsFor(form);
  if (!fields.length) return existing && typeof existing === 'object' ? existing : {};
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const f of fields) {
    let v = src[f.key] !== undefined ? src[f.key] : existing ? existing[f.key] : undefined;
    const bad = (msg) => ApiError.badRequest(`${f.label}: ${msg}`);
    const blank = v === undefined || v === null || v === '';
    switch (f.type) {
      case 'checkbox': v = v === true || v === 'true' || v === 'yes'; break;
      case 'number': case 'money': case 'percent': case 'rating':
        v = blank ? undefined : Number(v);
        if (v !== undefined && Number.isNaN(v)) throw bad('must be a number');
        if (f.type === 'percent' && v !== undefined && (v < 0 || v > 100)) throw bad('must be between 0 and 100');
        if (f.type === 'rating' && v !== undefined && (v < 0 || v > 5 || !Number.isInteger(v))) throw bad('must be a whole number from 0 to 5');
        if (f.type === 'money' && v !== undefined) v = Math.round(v * 100) / 100;
        break;
      case 'date': case 'datetime':
        v = blank ? undefined : new Date(v);
        if (v && Number.isNaN(+v)) throw bad('must be a valid date');
        break;
      case 'time':
        v = blank ? undefined : String(v).trim();
        if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad('must be a time like 14:30');
        break;
      case 'select': case 'radio':
        v = blank ? undefined : String(v);
        if (v && !f.options.includes(v)) throw bad(`"${v}" is not one of the allowed options`);
        break;
      case 'multiselect': {
        const arr = Array.isArray(v) ? v : blank ? [] : String(v).split(',');
        v = [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))];
        const rogue = v.find((x) => !f.options.includes(x));
        if (rogue) throw bad(`"${rogue}" is not one of the allowed options`);
        if (!v.length) v = undefined;
        break;
      }
      case 'email':
        v = blank ? undefined : String(v).trim().toLowerCase();
        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw bad('must be a valid e-mail address');
        break;
      case 'phone':
        v = blank ? undefined : String(v).trim();
        if (v && !/^\+?[\d\s\-()]{6,20}$/.test(v)) throw bad('must be a phone number (digits, spaces, +, -)');
        break;
      case 'url':
        v = blank ? undefined : String(v).trim();
        if (v && !/^https?:\/\/\S+$/i.test(v)) throw bad('must start with http:// or https://');
        break;
      case 'color':
        v = blank ? undefined : String(v).trim().toLowerCase();
        if (v && !/^#[0-9a-f]{6}$/.test(v)) throw bad('must be a colour like #a05aff');
        break;
      case 'file':
        if (blank) v = undefined;
        else {
          const id = typeof v === 'object' ? v.id || v.fileId : v;
          if (!/^[0-9a-f]{24}$/i.test(String(id || ''))) throw bad('uploaded file is missing');
          v = { id: String(id), name: typeof v === 'object' ? String(v.name || '') : '', size: typeof v === 'object' ? Number(v.size) || 0 : 0 };
        }
        break;
      default:
        v = blank ? undefined : String(v).trim();
    }
    if (f.required && (v === undefined || v === '' || (f.type === 'checkbox' && !v))) throw ApiError.badRequest(`${f.label} is required`);
    if (v !== undefined && v !== '') out[f.key] = v;
  }
  return out;
};

const TEXT_DISPLAY = ['text', 'textarea', 'select', 'email', 'phone', 'url'];   // display types a plain text built-in may switch to
/** Built-in field overrides: { [form]: { [builtinKey]: { label?, placeholder?, hint?, required?, hidden?, type?, options? } } }.
 *  System-required fields can be renamed but never hidden or made optional; `fixed` fields cannot be overridden at all. */
const cleanOverrides = (obj) => {
  const out = {};
  for (const [form, map] of Object.entries(obj && typeof obj === 'object' ? obj : {})) {
    const def = FORMS.find((f) => f.key === form);
    if (!def) throw ApiError.badRequest(`Unknown form "${form}"`);
    const clean = {};
    for (const [key, o] of Object.entries(map && typeof map === 'object' ? map : {})) {
      const bf = def.fields.find((x) => x.key === key);
      if (!bf) throw ApiError.badRequest(`${def.label}: unknown built-in field "${key}"`);
      if (bf.fixed) throw ApiError.badRequest(`${def.label}: "${bf.label}" is rendered by the system and cannot be changed`);
      const ov = {};
      if (o && typeof o === 'object') {
        if (String(o.label || '').trim() && String(o.label).trim() !== bf.label) ov.label = String(o.label).trim().slice(0, 60);
        if (String(o.placeholder || '').trim()) ov.placeholder = String(o.placeholder).trim().slice(0, 120);
        if (String(o.hint || '').trim()) ov.hint = String(o.hint).trim().slice(0, 160);
        if (o.required !== undefined && !!o.required !== bf.required) {
          if (bf.required) throw ApiError.badRequest(`${def.label}: "${bf.label}" is required by the system and cannot be made optional`);
          ov.required = !!o.required;
        }
        if (o.hidden) {
          if (bf.required) throw ApiError.badRequest(`${def.label}: "${bf.label}" is required by the system and cannot be hidden`);
          ov.hidden = true;
        }
        if (o.type && o.type !== bf.type) {
          if (bf.type !== 'text' || !TEXT_DISPLAY.includes(o.type)) throw ApiError.badRequest(`${def.label}: "${bf.label}" is a ${bf.type} field — only plain text fields can change type (long text, dropdown, e-mail, phone, web link)`);
          ov.type = o.type;
          if (o.type === 'select') {
            const options = [...new Set((Array.isArray(o.options) ? o.options : String(o.options || '').split(',')).map((x) => String(x).trim()).filter(Boolean))];
            if (!options.length) throw ApiError.badRequest(`${def.label}: "${bf.label}" as a dropdown needs a list of options`);
            ov.options = options;
          }
        }
      }
      if (Object.keys(ov).length) clean[key] = ov;
    }
    if (Object.keys(clean).length) out[form] = clean;
  }
  return out;
};

module.exports = { FORMS, FORM_KEYS, TYPES, TEXT_DISPLAY, cleanFields, cleanFormFields, cleanCustom, cleanOverrides, fieldsFor, keyOf };
