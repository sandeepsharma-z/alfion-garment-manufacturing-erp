const { cleanCustom } = require('./custom-fields');
const ApiError = require('./api-error');
const audit = require('../../modules/audit/audit.service');
const { plain } = require('./mask');

/**
 * NestJS-style generic service: crud(Model, opts) → { list, get, create, update, toggle }
 *   opts.search   – fields matched by ?q=
 *   opts.filters  – query params copied into the filter (e.g. ['status','category'])
 *   opts.present  – (doc, user) => object  (masking hook, SEC-3)
 *   opts.beforeCreate / beforeUpdate – async (body, req, doc?) => data
 */
module.exports = (Model, opt = {}) => {
  const present = opt.present || ((d) => plain(d));
  const label = opt.label || Model.modelName.toLowerCase();

  const list = async (req) => {
    const { q = '', page = 1, size = 50, sort = opt.sort || '-createdAt' } = req.query;
    const filter = {};
    if (q && opt.search) filter.$or = opt.search.map((f) => ({ [f]: { $regex: q, $options: 'i' } }));
    (opt.filters || []).forEach((f) => { if (req.query[f]) filter[f] = req.query[f]; });
    const items = await Model.find(filter).sort(sort).skip((page - 1) * size).limit(Math.min(+size, 500));
    const total = await Model.countDocuments(filter);
    return { items: items.map((d) => present(d, req.user)), total, page: +page, size: +size };
  };

  const get = async (req, id) => {
    const doc = await Model.findById(id);
    if (!doc) throw ApiError.notFound(`${label} not found`);
    return present(doc, req.user);
  };

  const create = async (req, body) => {
    const data = opt.beforeCreate ? await opt.beforeCreate(body || {}, req) : { ...(body || {}) };
    if (opt.form) data.custom = await cleanCustom(opt.form, (body || {}).custom);   // admin-defined extra fields (Settings → Form Fields)
    const doc = await Model.create(data);
    audit.record(req, `${label}.create`, `${Model.modelName}:${doc._id}`, null, doc.toObject());
    return present(doc, req.user);
  };

  const update = async (req, id, body) => {
    const doc = await Model.findById(id);
    if (!doc) throw ApiError.notFound(`${label} not found`);
    const before = doc.toObject();
    const data = opt.beforeUpdate ? await opt.beforeUpdate(body || {}, req, doc) : { ...(body || {}) };
    if (opt.form) { if ((body || {}).custom !== undefined) data.custom = await cleanCustom(opt.form, body.custom, doc.custom || {}); else delete data.custom; }
    Object.entries(data).forEach(([k, v]) => {
      if (!['_id', 'id', '__v', 'createdAt', 'updatedAt'].includes(k)) doc.set(k, v);
    });
    if (data.custom !== undefined) doc.markModified('custom');
    await doc.save();
    audit.record(req, `${label}.update`, `${Model.modelName}:${doc._id}`, before, doc.toObject());
    return present(doc, req.user);
  };

  const toggle = async (req, id) => {
    const doc = await Model.findById(id);
    if (!doc) throw ApiError.notFound(`${label} not found`);
    doc.status = doc.status === 'Inactive' ? 'Active' : 'Inactive';
    await doc.save();
    audit.record(req, `${label}.toggle`, `${Model.modelName}:${doc._id}`, null, { status: doc.status });
    return present(doc, req.user);
  };

  return { list, get, create, update, toggle, Model, present };
};
