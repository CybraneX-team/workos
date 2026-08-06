"""ERPNext Item Price events owned by Cybranex's Frappe integration app."""

import frappe


def on_change(doc, method=None):
	"""Refresh the linked CRM Product after a committed Item Price mutation.

	Frappe CRM owns Item-to-Product mapping and price resolution. Item Price is a
	separate DocType, so CRM does not receive an Item event when a selling price
	changes. Queue after commit so the resolver sees the committed state, including
	after a price row is deleted.
	"""
	item_code = doc.get("item_code")
	if not item_code:
		return

	frappe.enqueue(
		"workos_frappe_integration.item_price.refresh_crm_product",
		queue="short",
		enqueue_after_commit=True,
		item_code=item_code,
	)


def refresh_crm_product(item_code: str):
	"""Delegate the authoritative CRM catalogue update to the installed CRM app."""
	if not frappe.db.exists("Item", item_code):
		return

	from crm.integrations.erpnext.item import on_update
	from crm.integrations.erpnext.utils import should_sync

	if should_sync():
		on_update(frappe.get_doc("Item", item_code))
