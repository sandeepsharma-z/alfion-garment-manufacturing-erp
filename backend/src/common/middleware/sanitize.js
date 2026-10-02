/** Mongo operator-injection guard (P7): drops "$"-prefixed / dotted keys, and any field whose value is an operator object
 *  ({ status: { $ne: 'x' } } → status removed), from body, query and params. */
const clean = (v) => {
  if (Array.isArray(v)) return v.map(clean);
  if (!v || typeof v !== 'object' || v instanceof Date) return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith('$') || k.includes('.')) continue;
    if (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).some((kk) => kk.startsWith('$'))) continue;
    out[k] = clean(x);
  }
  return out;
};
module.exports = (req, res, next) => {
  if (req.body) req.body = clean(req.body);
  if (req.query) req.query = clean(req.query);
  if (req.params) req.params = clean(req.params);
  next();
};
