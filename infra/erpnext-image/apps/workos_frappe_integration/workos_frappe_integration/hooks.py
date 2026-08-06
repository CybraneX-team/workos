app_name = "workos_frappe_integration"
app_title = "WorkOS Frappe Integration"
app_publisher = "Cybranex"
app_description = "Cybranex-owned ERPNext and Frappe CRM integration hooks"
app_email = "engineering@cybranex.com"
app_license = "MIT"

required_apps = ["erpnext", "crm"]

doc_events = {
	"Item Price": {
		"after_insert": "workos_frappe_integration.item_price.on_change",
		"on_update": "workos_frappe_integration.item_price.on_change",
		"on_trash": "workos_frappe_integration.item_price.on_change",
	},
}
