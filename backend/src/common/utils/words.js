/** Amount in words for invoices — Indian grouping (lakh / crore) for INR, thousands / millions for other currencies. */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below1000 = (n) => {
  const h = Math.floor(n / 100), r = n % 100;
  const tail = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ' ' + ONES[r % 10] : ''}`;
  return [h ? `${ONES[h]} Hundred` : '', tail].filter(Boolean).join(' ');
};
const indian = (n) => {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${indian(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return parts.join(' ');
};
const intl = (n) => {
  if (n === 0) return 'Zero';
  const parts = [];
  const scales = [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
  for (const [v, name] of scales) { const q = Math.floor(n / v); if (q) { parts.push(`${below1000(q)} ${name}`); n %= v; } }
  if (n) parts.push(below1000(n));
  return parts.join(' ');
};
const NAMES = { INR: ['Rupees', 'Paise'], USD: ['US Dollars', 'Cents'], EUR: ['Euros', 'Cents'], GBP: ['Pounds Sterling', 'Pence'], JPY: ['Japanese Yen', 'Sen'] };

const amountInWords = (amount, currency = 'INR') => {
  const [unit, sub] = NAMES[currency] || [currency, 'Cents'];
  const whole = Math.floor(Math.abs(+amount || 0)), frac = Math.round((Math.abs(+amount || 0) - whole) * 100);
  const words = currency === 'INR' ? indian(whole) : intl(whole);
  return `${unit} ${words}${frac ? ` and ${sub} ${below1000(frac)}` : ''} Only`;
};

module.exports = { amountInWords };
