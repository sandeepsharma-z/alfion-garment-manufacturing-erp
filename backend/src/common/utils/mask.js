const { hasFlag } = require('../../modules/users/roles');

const plain = (doc) => {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.id = o._id; delete o._id; delete o.__v;
  return o;
};

/** Buyers (SEC-3): without the flag only alias + country survive; brand shown as alias. */
const presentBuyer = (doc, user) => {
  const b = plain(doc);
  if (hasFlag(user, 'buyer.confidential')) return { ...b, displayName: b.brand, masked: false };
  return {
    id: b.id, alias: b.alias, country: b.country, status: b.status, createdAt: b.createdAt,
    displayName: `${b.alias} · ${b.country || '—'}`, masked: true,
  };
};

/** Vendors (SEC-3): identity, contacts, GST, bank and rates hidden; category/capacity/performance stay. */
const presentVendor = (doc, user) => {
  const v = plain(doc);
  if (hasFlag(user, 'vendor.confidential')) return { ...v, displayName: v.name, masked: false };
  return {
    id: v.id, alias: v.alias, category: v.category, capacity: v.capacity, onTimePct: v.onTimePct,
    rating: v.rating, status: v.status, createdAt: v.createdAt,
    location: v.location ? String(v.location).split(',')[0] : '',
    displayName: `${v.alias} · ${v.category}`, masked: true,
  };
};

/** Vendor as it should appear inside another record (challan / operation / log). */
const vendorLabel = (user, name, alias, category) => (hasFlag(user, 'vendor.confidential') && name ? name : `${alias || 'V-??'} · ${category || 'vendor'}`);

/** Buyer name as it should appear inside another record (sample / order / style). */
const buyerLabel = (user, brand, alias) => (hasFlag(user, 'buyer.confidential') ? brand : alias);

module.exports = { plain, presentBuyer, presentVendor, buyerLabel, vendorLabel };
