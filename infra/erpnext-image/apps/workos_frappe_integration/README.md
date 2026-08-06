# WorkOS Frappe Integration

Cybranex-owned Frappe hooks that coordinate ERPNext and Frappe CRM behavior.

It requires the `erpnext` and `crm` apps and is installed on every tenant site during
provisioning. Keeping these hooks here, rather than patching upstream CRM source, makes
upgrades explicit and keeps the integration ownership in this repository.
