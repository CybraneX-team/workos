import assert from 'node:assert/strict';
import {
  erpnextDeskBaseUrl,
  erpnextDeskDoctypeSlug,
  erpnextDeskListUrl,
  erpnextDeskNewUrl,
  erpnextDeskRecordUrl,
} from '../dist/lib/erpnextDeskLinks.js';

const localCreds = {
  siteUrl: 'http://localhost:8081',
  siteName: 'erp-test-su0f.localhost',
};

assert.equal(erpnextDeskDoctypeSlug('Sales Invoice'), 'sales-invoice');
assert.equal(erpnextDeskDoctypeSlug('  Customer Group  '), 'customer-group');
assert.equal(erpnextDeskBaseUrl(localCreds), 'http://erp-test-su0f.localhost:8081');
assert.equal(erpnextDeskListUrl(localCreds, 'Lead'), 'http://erp-test-su0f.localhost:8081/app/lead');
assert.equal(erpnextDeskNewUrl(localCreds, 'Sales Order'), 'http://erp-test-su0f.localhost:8081/app/sales-order/new-sales-order');
assert.equal(
  erpnextDeskRecordUrl(localCreds, 'Sales Invoice', 'ACC-SINV-2026/0001'),
  'http://erp-test-su0f.localhost:8081/app/sales-invoice/ACC-SINV-2026%2F0001',
);

const deskUrlCreds = {
  siteUrl: 'https://shared-erp.example.com',
  siteName: 'erp-acme.example.com',
  deskUrl: 'https://acme.erp.example.com/',
};

assert.equal(erpnextDeskListUrl(deskUrlCreds, 'Opportunity'), 'https://acme.erp.example.com/app/opportunity');

console.log('erpnextDeskLinks.test.mjs passed');
