# WorkOS ERP projections

This domain owns WorkOS-specific ERPNext projections, BDT rollups, recommendations,
stories, and browser-facing ERP routes. It may call the authenticated internal
control-plane client, but it must not contain Frappe credentials or call Frappe
HTTP endpoints directly.
