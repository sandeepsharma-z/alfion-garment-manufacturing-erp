/**
 * The client's material / accessory master by category (their "Possible Materials / Accessories" sheet).
 * This is THE list of possible values everywhere in the software — sample material sheet, BOM,
 * material master, job work. Every group also says where such an item lives in the stock master
 * (category + suggested item type + unit), so a line typed once can create its stock item by itself.
 */
const CATALOG = [
  { group: 'Fabric', category: 'Fabric', itemType: 'Main fabric (FAB-A)', unit: 'mtr',
    items: ['Main Fabric', 'Lining Fabric', 'Rib Fabric', 'Interlining', 'Fusing Fabric', 'Pocketing Fabric', 'Mesh Fabric', 'Net Fabric', 'Fleece Fabric', 'Denim Fabric', 'Canvas Fabric',
      'Fabric 2', 'Moon Fabric', 'Embroidery Backing Material'] },
  { group: 'Yarn / Thread', category: 'Accessory', itemType: 'Sewing thread', unit: 'cone',
    items: ['Sewing Thread', 'Embroidery Thread', 'Overlock Thread', 'Elastic Thread', 'Quilting Thread'] },
  { group: 'Trims', category: 'Accessory', itemType: 'Tape / twill tape', unit: 'mtr',
    items: ['Lace', 'Piping', 'Tape', 'Twill Tape', 'Velcro', 'Drawcord', 'Rope', 'Elastic', 'Braid', 'Fringe',
      'Sequin', 'Beads', 'Stone', 'Patch'] },
  { group: 'Buttons & Closures', category: 'Accessory', itemType: 'Button', unit: 'pcs',
    items: ['Buttons', 'Snap Buttons', 'Rivets', 'Hooks', 'Eyelets', 'Zippers', 'Sliders', 'Buckles', 'Toggles',
      'Button', 'Snap Button', 'Rivet', 'Hook & Eye', 'Eyelet', 'Zipper', 'Slider', 'Buckle', 'Toggle'] },
  { group: 'Labels', category: 'Accessory', itemType: 'Main label', unit: 'pcs',
    items: ['Main Label', 'Size Label', 'Wash Care Label', 'Brand Label', 'Barcode Sticker', 'Price Tag', 'RFID Tag'] },
  { group: 'Packing Materials', category: 'Packing', itemType: 'Poly bag', unit: 'pcs',
    items: ['Poly Bag', 'Master Carton', 'Tissue Paper', 'Butter Paper', 'Hangtag', 'Tag Pin', 'Silica Gel', 'Packing Tape', 'Strapping Roll'] },
  { group: 'Printing Materials', category: 'Accessory', itemType: 'Print / transfer', unit: 'pcs',
    items: ['Printing Ink', 'Foil Paper', 'Sublimation Paper', 'Screen Printing Chemical', 'Heat Transfer Sheet', 'Sticker Print'] },
  { group: 'Embroidery Materials', category: 'Accessory', itemType: 'Embroidery thread', unit: 'pcs',
    items: ['Embroidery Backing', 'Embroidery Film', 'Sequin', 'Beads', 'Stones', 'Patch'] },
  { group: 'Washing / Finishing', category: 'Accessory', itemType: 'Wash / dyeing chemical', unit: 'kg',
    items: ['Softener', 'Enzyme', 'Silicon', 'Bleach', 'Finishing Spray', 'Stain Remover'] },
  { group: 'Filling Materials', category: 'Accessory', itemType: 'Shoulder pad', unit: 'kg',
    items: ['Fiber Filling', 'Foam', 'Cotton Filling', 'Polyfill', 'Wadding', 'Quilt Layer'] },
  { group: 'Sofa Cover Materials', category: 'Accessory', itemType: 'Elastic', unit: 'mtr',
    items: ['Sofa Elastic', 'Sofa Foam Sheet', 'Sofa Piping', 'Sofa Zipper', 'Sofa Velcro'] },
  { group: 'Cushion Cover Materials', category: 'Accessory', itemType: 'Zipper', unit: 'pcs',
    items: ['Cushion Zipper', 'Cushion Filler', 'Decorative Tassels', 'Cushion Piping'] },
  { group: 'Quilted Carpet Materials', category: 'Fabric', itemType: 'Mesh / net', unit: 'mtr',
    items: ['Nonwoven Base', 'Carpet Backing', 'Anti-skid Sheet', 'Quilt Wadding', 'Lamination Sheet'] },
  { group: 'Measurement / QC Items', category: 'Accessory', itemType: 'Fabric swatch card', unit: 'pcs',
    items: ['Measuring Tape', 'Shade Card', 'GSM Slip', 'Needle', 'Cutter Blade'] },
  { group: 'Carton & Dispatch', category: 'Packing', itemType: 'Carton', unit: 'pcs',
    items: ['Export Carton', 'Barcode Label', 'Shipping Mark Sticker', 'Pallet Wrap', 'Corner Protector'] },
  { group: 'Safety / Miscellaneous', category: 'Accessory', itemType: 'Other', unit: 'pcs',
    items: ['Needle Guard', 'Machine Oil', 'Lubricant', 'Cleaning Cloth', 'PPE Items'] },
];

const byGroup = Object.fromEntries(CATALOG.map((g) => [g.group, g]));
/** Where a sheet line belongs in the stock master (falls back to an accessory). */
const stockMapping = (group) => {
  const g = byGroup[group];
  return g ? { category: g.category, itemType: g.itemType, unit: g.unit } : { category: 'Accessory', itemType: '', unit: 'pcs' };
};
/** Flat list for the "type or pick" boxes, and the group an item belongs to. */
const ITEMS = [...new Set(CATALOG.flatMap((g) => g.items))].sort((a, b) => a.localeCompare(b));
const groupOfItem = (name) => (CATALOG.find((g) => g.items.some((i) => i.toLowerCase() === String(name || '').trim().toLowerCase())) || {}).group || '';
const CODE_PREFIX = { Fabric: 'FAB', Accessory: 'ACC', Packing: 'PKG' };

module.exports = { CATALOG, ITEMS, stockMapping, groupOfItem, CODE_PREFIX };
