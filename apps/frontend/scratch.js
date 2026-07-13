const subdomains = {
  'ind-energy': ['Carbon Management', 'Waste Systems', 'Waste Management'],
  'ind-government': ['Public Policy', 'Social Welfare', 'Public Health Systems', 'Social Systems', 'Sust Tech'],
  'ind-mobility': ['Shipping', 'Travel Infrastructure', 'Delivery Systems'],
  'ind-realestate': ['Construction', 'Facility Management', 'Smart Management'],
  'ind-agriculture': ['Fisheries', 'Supply Delivery', 'Market Discovery']
};

const offsets = [
  '[8, 2, 2]', '[-7, 4, -5]', '[7, -3, -6]', '[4, 7, -8]',
  '[-5, -6, 5]', '[6, 5, 4]', '[-4, 6, -3]', '[3, -5, 7]'
];

let out = '';
let c = 1;
for (const ind of Object.keys(subdomains)) {
  for (const sub of subdomains[ind]) {
    for (let i = 1; i <= 3; i++) {
      let r = offsets[c % offsets.length];
      out += `  {
    id: '${ind}-${sub.replace(/\s+/g, '')}-${i}', name: '${sub} Corp ${i}', industryId: '${ind}', subdomain: '${sub}',
    country: 'USA', founded: 2010 + ${i}, stage: 'Series A', isPublic: false, valuation: '100M',
    mrrUSD: 1000000, employees: 50, investors: [],
    description: 'Leading company in ${sub}.', status: 'healthy', offset3D: ${r}
  },\n`;
      c++;
    }
  }
}
const fs = require('fs');
fs.writeFileSync('missing.ts', out);
