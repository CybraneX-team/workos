export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹', USD: '$', GBP: '£', EUR: '€', JPY: '¥', CNY: '¥', KRW: '₩',
  AED: 'د.إ', SAR: '﷼', BDT: '৳', PKR: '₨', IDR: 'Rp', MYR: 'RM',
  THB: '฿', PHP: '₱', BRL: 'R$', MXN: '$', ZAR: 'R', SGD: 'S$',
  HKD: 'HK$', CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', CHF: 'CHF',
  SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł', RUB: '₽', TRY: '₺',
  ILS: '₪', NGN: '₦', KES: 'KSh', GHS: 'GH₵', EGP: 'E£', VND: '₫',
  TWD: 'NT$', UAH: '₴', CZK: 'Kč', HUF: 'Ft', RON: 'lei', ARS: 'AR$',
  CLP: 'CL$', COP: 'COL$', PEN: 'S/', QAR: 'QR', KWD: 'KD', BHD: 'BD',
  OMR: 'OMR', LKR: 'Rs', NPR: 'Rs',
};

export const COUNTRY_CURRENCIES = {
  Argentina: 'ARS', Australia: 'AUD', Austria: 'EUR', Bahrain: 'BHD',
  Bangladesh: 'BDT', Belgium: 'EUR', Brazil: 'BRL', Canada: 'CAD',
  Chile: 'CLP', China: 'CNY', Colombia: 'COP', 'Czech Republic': 'CZK',
  Denmark: 'DKK', Egypt: 'EGP', Finland: 'EUR', France: 'EUR', Germany: 'EUR',
  Ghana: 'GHS', Greece: 'EUR', 'Hong Kong': 'HKD', Hungary: 'HUF', India: 'INR',
  Indonesia: 'IDR', Ireland: 'EUR', Israel: 'ILS', Italy: 'EUR', Japan: 'JPY',
  Kenya: 'KES', Kuwait: 'KWD', Malaysia: 'MYR', Mexico: 'MXN', Nepal: 'NPR',
  Netherlands: 'EUR', 'New Zealand': 'NZD', Nigeria: 'NGN', Norway: 'NOK',
  Oman: 'OMR', Pakistan: 'PKR', Peru: 'PEN', Philippines: 'PHP', Poland: 'PLN',
  Portugal: 'EUR', Qatar: 'QAR', Romania: 'RON', Russia: 'RUB',
  'Saudi Arabia': 'SAR', Singapore: 'SGD', 'South Africa': 'ZAR',
  'South Korea': 'KRW', Spain: 'EUR', 'Sri Lanka': 'LKR', Sweden: 'SEK',
  Switzerland: 'CHF', Taiwan: 'TWD', Thailand: 'THB', Turkey: 'TRY', UAE: 'AED',
  UK: 'GBP', Ukraine: 'UAH', USA: 'USD', Vietnam: 'VND', Other: 'USD',
} as const;

export const COUNTRIES = Object.keys(COUNTRY_CURRENCIES);

const COUNTRY_ALIASES: Record<string, keyof typeof COUNTRY_CURRENCIES> = {
  'united states': 'USA',
  'united states of america': 'USA',
  us: 'USA',
  'united kingdom': 'UK',
  gb: 'UK',
  'great britain': 'UK',
  'united arab emirates': 'UAE',
  korea: 'South Korea',
  'republic of korea': 'South Korea',
  'russian federation': 'Russia',
  czechia: 'Czech Republic',
};

export function getCurrencyCodeForCountry(country: string | null | undefined): string {
  if (!country) return 'USD';
  const normalized = country.trim().toLowerCase();
  const canonical = COUNTRY_ALIASES[normalized]
    ?? COUNTRIES.find((item) => item.toLowerCase() === normalized);
  return canonical ? COUNTRY_CURRENCIES[canonical as keyof typeof COUNTRY_CURRENCIES] : 'USD';
}

/** Units that render as suffix labels (not currency prefixes). */
export const LABEL_UNITS = new Set(['%', 'people', 'months', '/mo', 'count', 'x', '$/mo', '$/wk']);

export function getCurrencySymbol(currencyCode: string | null | undefined): string {
  if (!currencyCode) return '$';
  const normalized = currencyCode.trim().toUpperCase();
  return CURRENCY_SYMBOLS[normalized] ?? normalized;
}

/** True if the unit string should be displayed as a prefix (before the number). */
export function isCurrencyPrefix(unit: string | undefined): boolean {
  return !!unit && unit !== '%' && !LABEL_UNITS.has(unit);
}
