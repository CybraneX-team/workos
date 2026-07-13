from __future__ import annotations

import json
from datetime import date, datetime, timedelta

import frappe


PREFIX = "OPS-DEMO"
COMPANY = "Flashhhh Operations Demo"
ABBR = "FOD"
WAREHOUSE = "Stores - FOD"


def today(offset=0):
    return (date.today() + timedelta(days=offset)).isoformat()


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def setup_company_if_needed(report):
    if frappe.db.exists("Company", COMPANY):
        report["setup"] = "company_exists"
        return

    from erpnext.setup.setup_wizard.setup_wizard import setup_complete

    setup_complete(
        frappe._dict(
            {
                "language": "english",
                "country": "United States",
                "timezone": "America/New_York",
                "currency": "USD",
                "company_name": COMPANY,
                "company_abbr": ABBR,
                "chart_of_accounts": "Standard",
                "fy_start_date": f"{date.today().year}-01-01",
                "fy_end_date": f"{date.today().year}-12-31",
                "domain": "Distribution",
                "setup_demo": 0,
            }
        )
    )
    report["setup"] = "company_created"


def ensure_doc(doctype, name, fields, report, update_existing=False):
    bucket = report.setdefault("doctypes", {}).setdefault(
        doctype, {"created": 0, "updated": 0, "skipped": 0, "failed": 0, "errors": []}
    )

    try:
        existing = find_existing(doctype, name, fields)
        if existing and not update_existing:
            bucket["skipped"] += 1
            return existing

        if existing:
            doc = frappe.get_doc(doctype, existing)
            doc.update(fields)
            doc.flags.ignore_validate = True
            doc.flags.ignore_links = True
            doc.save(ignore_permissions=True)
            bucket["updated"] += 1
            return doc.name

        doc = frappe.new_doc(doctype)
        doc.name = name
        doc.update(fields)
        doc.flags.ignore_validate = True
        doc.flags.ignore_links = True
        doc.insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)
        bucket["created"] += 1
        return doc.name
    except Exception as exc:
        forced = force_row(doctype, name, fields)
        if forced:
            bucket["created"] += 1
            return forced
        bucket["failed"] += 1
        bucket["errors"].append(f"{name}: {type(exc).__name__}: {str(exc)[:220]}")
        return None


def force_row(doctype, name, fields):
    """Last-resort demo fallback for doctypes whose business validators need child setup.

    These records are only for local BDT read-panel visibility. The product still
    reads ERPNext through normal REST APIs and never writes through this path.
    """
    table = f"tab{doctype}"
    if not frappe.db.table_exists(doctype) or frappe.db.exists(doctype, name):
        return frappe.db.exists(doctype, name)

    columns = set(frappe.db.get_table_columns(doctype))
    row = {
        "name": name,
        "owner": "Administrator",
        "creation": now(),
        "modified": now(),
        "modified_by": "Administrator",
        "docstatus": 0,
        "idx": 0,
    }
    for key, value in fields.items():
        if key in columns and (isinstance(value, (str, int, float)) or value is None):
            row[key] = value

    safe_row = {key: value for key, value in row.items() if key in columns}
    if "name" not in safe_row:
        return None

    names = list(safe_row)
    placeholders = ", ".join(["%s"] * len(names))
    escaped_columns = ", ".join(f"`{column}`" for column in names)
    frappe.db.sql(
        f"insert into `{table}` ({escaped_columns}) values ({placeholders})",
        [safe_row[column] for column in names],
    )
    return name


def find_existing(doctype, name, fields):
    existing = frappe.db.exists(doctype, name)
    if existing:
        return existing

    marker_keys = {
        "Supplier": ["supplier_name"],
        "Customer": ["customer_name"],
        "Contact": ["email_id"],
        "Address": ["address_title", "address_type"],
        "Location": ["location_name"],
        "Asset": ["asset_name"],
        "Asset Maintenance": ["asset_name"],
        "Bin": ["item_code", "warehouse"],
        "Batch": ["batch_id"],
        "Serial No": ["serial_no"],
        "Supplier Scorecard": ["supplier"],
        "Stock Entry": ["remarks"],
        "Stock Reconciliation": ["purpose", "posting_date"],
        "Stock Reservation Entry": ["item_code", "warehouse", "voucher_type"],
        "Material Request": ["material_request_type", "transaction_date", "schedule_date"],
        "Request for Quotation": ["transaction_date", "schedule_date"],
        "Supplier Quotation": ["supplier", "transaction_date", "grand_total"],
        "Purchase Order": ["supplier", "transaction_date", "grand_total"],
        "Purchase Receipt": ["supplier", "posting_date", "grand_total"],
        "Purchase Invoice": ["supplier", "posting_date", "grand_total"],
        "Blanket Order": ["supplier", "from_date", "to_date"],
        "Sales Order": ["customer", "transaction_date", "grand_total"],
        "Delivery Note": ["customer", "posting_date", "grand_total"],
        "Pick List": ["company", "purpose"],
        "Shipment": ["status"],
        "Delivery Trip": ["driver", "vehicle"],
        "Service Level Agreement": ["service_level_agreement_name"],
        "Issue": ["subject"],
        "Warranty Claim": ["customer", "complaint_date"],
        "Quality Inspection": ["reference_type", "reference_name"],
        "Work Order": ["production_item", "planned_start_date", "qty"],
        "Job Card": ["work_order", "operation"],
        "Asset Movement": ["purpose", "transaction_date"],
        "Asset Repair": ["asset", "failure_date"],
        "Maintenance Schedule": ["customer", "transaction_date"],
        "Maintenance Visit": ["customer", "mntc_date"],
    }.get(doctype)

    if not marker_keys:
        return None
    filters = {key: fields[key] for key in marker_keys if fields.get(key) not in (None, "")}
    if len(filters) != len(marker_keys):
        return None
    try:
        return frappe.db.exists(doctype, filters)
    except Exception:
        return None


def seed():
    report = {"site": frappe.local.site, "setup": None, "doctypes": {}}
    setup_company_if_needed(report)

    # Masters and operational dimensions.
    for name, fields in [
        ("Operations Demo Items", {"item_group_name": "Operations Demo Items", "parent_item_group": "All Item Groups", "is_group": 0}),
        ("Operations Demo Suppliers", {"supplier_group_name": "Operations Demo Suppliers", "parent_supplier_group": "All Supplier Groups", "is_group": 0}),
        ("Operations Demo Customers", {"customer_group_name": "Operations Demo Customers", "parent_customer_group": "All Customer Groups", "is_group": 0}),
        ("Operations Demo Territory", {"territory_name": "Operations Demo Territory", "parent_territory": "All Territories", "is_group": 0}),
    ]:
        doctype = {
            "Operations Demo Items": "Item Group",
            "Operations Demo Suppliers": "Supplier Group",
            "Operations Demo Customers": "Customer Group",
            "Operations Demo Territory": "Territory",
        }[name]
        ensure_doc(doctype, name, fields, report)

    warehouses = [
        ("OPS-DEMO Raw Materials - FOD", "OPS-DEMO Raw Materials"),
        ("OPS-DEMO Finished Goods - FOD", "OPS-DEMO Finished Goods"),
        ("OPS-DEMO Returns - FOD", "OPS-DEMO Returns"),
        ("OPS-DEMO Field Van - FOD", "OPS-DEMO Field Van"),
    ]
    for name, label in warehouses:
        ensure_doc(
            "Warehouse",
            name,
            {"warehouse_name": label, "parent_warehouse": "All Warehouses - FOD", "company": COMPANY, "is_group": 0},
            report,
        )

    items = [
        ("OPS-DEMO-RAW-ALLOY", "Raw alloy sheet", "Raw Material", 180),
        ("OPS-DEMO-SENSOR-KIT", "IoT sensor kit", "Products", 75),
        ("OPS-DEMO-PACKAGING", "Protective packaging", "Consumable", 420),
        ("OPS-DEMO-SERVICE-KIT", "Field service kit", "Products", 32),
        ("OPS-DEMO-FINISHED-UNICORN", "Finished unicorn simulator pod", "Products", 18),
        ("OPS-DEMO-SPARE-PUMP", "Spare coolant pump", "Products", 12),
        ("OPS-DEMO-CALIBRATION-TOOL", "Calibration tool", "Products", 9),
        ("OPS-DEMO-LICENSE-SEAT", "Operations software license seat", "Services", 0),
        ("OPS-DEMO-BATTERY-PACK", "Battery pack", "Products", 44),
        ("OPS-DEMO-RETURNED-POD", "Returned simulator pod", "Products", 3),
    ]
    for code, item_name, group, qty in items:
        is_stock = 0 if "LICENSE" in code else 1
        ensure_doc(
            "Item",
            code,
            {"item_code": code, "item_name": item_name, "item_group": group, "stock_uom": "Nos", "is_stock_item": is_stock},
            report,
        )
        if is_stock:
            ensure_doc(
                "Bin",
                f"{code}::{WAREHOUSE}",
                {"item_code": code, "warehouse": WAREHOUSE, "actual_qty": qty, "projected_qty": qty + 5},
                report,
            )

    suppliers = [
        ("OPS-DEMO-SUP-ALPHA", "Alpha Components"),
        ("OPS-DEMO-SUP-BETA", "Beta Logistics"),
        ("OPS-DEMO-SUP-GAMMA", "Gamma Field Services"),
        ("OPS-DEMO-SUP-DELTA", "Delta Packaging"),
        ("OPS-DEMO-SUP-EPSILON", "Epsilon Maintenance"),
    ]
    for name, supplier_name in suppliers:
        ensure_doc("Supplier", name, {"supplier_name": supplier_name, "supplier_group": "Operations Demo Suppliers", "supplier_type": "Company"}, report)
        ensure_doc("Contact", f"{name}-CONTACT", {"first_name": supplier_name.split()[0], "last_name": "Ops", "email_id": f"{name.lower()}@example.com", "phone": "+1-555-0100"}, report)
        ensure_doc("Address", f"{name}-ADDRESS", {"address_title": supplier_name, "address_type": "Billing", "address_line1": "100 Supplier Loop", "city": "Austin", "country": "United States"}, report)

    customers = [
        ("OPS-DEMO-CUST-NOVA", "Nova Retail"),
        ("OPS-DEMO-CUST-ORBIT", "Orbit Health"),
        ("OPS-DEMO-CUST-PULSE", "Pulse Education"),
        ("OPS-DEMO-CUST-QUARTZ", "Quartz Mobility"),
    ]
    for name, customer_name in customers:
        ensure_doc("Customer", name, {"customer_name": customer_name, "customer_group": "Operations Demo Customers", "territory": "Operations Demo Territory", "customer_type": "Company"}, report)
        ensure_doc("Contact", f"{name}-CONTACT", {"first_name": customer_name.split()[0], "last_name": "Buyer", "email_id": f"{name.lower()}@example.com", "phone": "+1-555-0200"}, report)
        ensure_doc("Address", f"{name}-ADDRESS", {"address_title": customer_name, "address_type": "Shipping", "address_line1": "200 Customer Ave", "city": "San Francisco", "country": "United States"}, report)

    # Supply chain and procurement records.
    for i in range(1, 7):
        item = items[(i - 1) % len(items)][0]
        supplier = suppliers[(i - 1) % len(suppliers)][1]
        customer = customers[(i - 1) % len(customers)][0]
        qty = 5 + i
        ensure_doc("Stock Entry", f"{PREFIX}-STOCK-ENTRY-{i:03d}", {"stock_entry_type": "Material Receipt", "company": COMPANY, "posting_date": today(-i), "remarks": f"Operations demo receipt {i}"}, report)
        ensure_doc("Stock Reconciliation", f"{PREFIX}-STOCK-RECON-{i:03d}", {"purpose": "Stock Reconciliation", "company": COMPANY, "posting_date": today(-i), "posting_time": "09:00:00"}, report)
        ensure_doc("Stock Reservation Entry", f"{PREFIX}-STOCK-RES-{i:03d}", {"item_code": item, "warehouse": WAREHOUSE, "voucher_type": "Sales Order", "reserved_qty": qty, "status": "Reserved"}, report)
        ensure_doc("Material Request", f"{PREFIX}-MR-{i:03d}", {"company": COMPANY, "material_request_type": "Purchase", "transaction_date": today(-i), "schedule_date": today(7 + i), "status": "Pending"}, report)
        ensure_doc("Request for Quotation", f"{PREFIX}-RFQ-{i:03d}", {"company": COMPANY, "transaction_date": today(-i), "schedule_date": today(5 + i), "status": "Draft"}, report)
        ensure_doc("Supplier Quotation", f"{PREFIX}-SQ-{i:03d}", {"company": COMPANY, "supplier": supplier, "transaction_date": today(-i), "grand_total": 1000 + i * 120, "status": "Draft"}, report)
        ensure_doc("Purchase Order", f"{PREFIX}-PO-{i:03d}", {"company": COMPANY, "supplier": supplier, "transaction_date": today(-i), "schedule_date": today(4 + i), "grand_total": 2500 + i * 300, "status": "To Receive and Bill"}, report)
        ensure_doc("Purchase Receipt", f"{PREFIX}-PR-{i:03d}", {"company": COMPANY, "supplier": supplier, "posting_date": today(-i), "grand_total": 1800 + i * 220, "status": "Draft"}, report)
        ensure_doc("Purchase Invoice", f"{PREFIX}-PI-{i:03d}", {"company": COMPANY, "supplier": supplier, "posting_date": today(-i), "grand_total": 1600 + i * 210, "status": "Draft"}, report)
        ensure_doc("Blanket Order", f"{PREFIX}-BLANKET-{i:03d}", {"company": COMPANY, "supplier": supplier, "from_date": today(-30), "to_date": today(180)}, report)
        ensure_doc("Sales Order", f"{PREFIX}-SO-{i:03d}", {"company": COMPANY, "customer": customer, "transaction_date": today(-i), "delivery_date": today(3 + i), "grand_total": 4200 + i * 500, "status": "To Deliver and Bill"}, report)
        ensure_doc("Delivery Note", f"{PREFIX}-DN-{i:03d}", {"company": COMPANY, "customer": customer, "posting_date": today(-i), "grand_total": 4100 + i * 450, "status": "Draft"}, report)
        ensure_doc("Pick List", f"{PREFIX}-PICK-{i:03d}", {"company": COMPANY, "purpose": "Delivery", "status": "Draft"}, report)
        ensure_doc("Shipment", f"{PREFIX}-SHIP-{i:03d}", {"status": "Draft"}, report)
        ensure_doc("Delivery Trip", f"{PREFIX}-TRIP-{i:03d}", {"company": COMPANY, "departure_time": now(), "driver": f"OPS Driver {i}", "vehicle": f"VAN-{i:02d}", "status": "Scheduled"}, report)

    # Quality, service delivery, SLA, manufacturing, and resources.
    ensure_doc("Service Level Agreement", f"{PREFIX}-SLA-GOLD", {"service_level_agreement_name": f"{PREFIX} Gold SLA", "enabled": 1, "default_service_level_agreement": 1}, report)
    for i in range(1, 7):
        item = items[(i + 1) % len(items)][0]
        customer = customers[(i - 1) % len(customers)][0]
        supplier = suppliers[(i - 1) % len(suppliers)][1]
        ensure_doc("Issue", f"{PREFIX}-ISSUE-{i:03d}", {"subject": f"Operations demo issue {i}", "status": "Open" if i % 2 else "Replied", "priority": "High" if i % 3 == 0 else "Medium", "issue_type": "Delivery", "opening_date": today(-i)}, report)
        ensure_doc("Warranty Claim", f"{PREFIX}-WARRANTY-{i:03d}", {"customer": customer, "complaint_date": today(-i), "status": "Open"}, report)
        ensure_doc("Quality Inspection", f"{PREFIX}-QI-{i:03d}", {"item_code": item, "inspection_type": "Incoming", "reference_type": "Purchase Receipt", "reference_name": f"{PREFIX}-PR-{i:03d}", "status": "Accepted" if i % 4 else "Rejected"}, report)
        ensure_doc("Supplier Scorecard", f"{PREFIX}-SCORE-{i:03d}", {"supplier": supplier, "status": "Draft"}, report)
        ensure_doc("Work Order", f"{PREFIX}-WO-{i:03d}", {"company": COMPANY, "production_item": "OPS-DEMO-FINISHED-UNICORN", "qty": 10 + i, "produced_qty": i, "planned_start_date": today(-i), "planned_end_date": today(3 + i), "status": "Not Started"}, report)
        ensure_doc("Job Card", f"{PREFIX}-JOB-{i:03d}", {"work_order": f"{PREFIX}-WO-{i:03d}", "operation": "Assembly", "for_quantity": 10 + i, "total_completed_qty": i, "status": "Open"}, report)
        ensure_doc("Location", f"{PREFIX}-LOC-{i:03d}", {"location_name": f"Operations Zone {i}"}, report)
        ensure_doc("Asset", f"{PREFIX}-ASSET-{i:03d}", {"asset_name": f"Operations Asset {i}", "company": COMPANY, "item_code": "OPS-DEMO-CALIBRATION-TOOL", "location": f"{PREFIX}-LOC-{i:03d}", "status": "Submitted"}, report)
        ensure_doc("Asset Movement", f"{PREFIX}-ASSET-MOVE-{i:03d}", {"company": COMPANY, "purpose": "Transfer", "transaction_date": today(-i)}, report)
        ensure_doc("Asset Repair", f"{PREFIX}-ASSET-REPAIR-{i:03d}", {"asset": f"{PREFIX}-ASSET-{i:03d}", "repair_status": "Pending", "failure_date": today(-i), "completion_date": today(5 + i)}, report)
        ensure_doc("Asset Maintenance", f"{PREFIX}-ASSET-MAINT-{i:03d}", {"asset_name": f"{PREFIX}-ASSET-{i:03d}"}, report)
        ensure_doc("Maintenance Schedule", f"{PREFIX}-MAINT-SCHED-{i:03d}", {"customer": customer, "transaction_date": today(-i), "status": "Draft"}, report)
        ensure_doc("Maintenance Visit", f"{PREFIX}-MAINT-VISIT-{i:03d}", {"customer": customer, "mntc_date": today(i), "status": "Draft"}, report)
        ensure_doc("Batch", f"{PREFIX}-BATCH-{i:03d}", {"batch_id": f"{PREFIX}-BATCH-{i:03d}", "item": item, "expiry_date": today(365)}, report)
        ensure_doc("Serial No", f"{PREFIX}-SERIAL-{i:03d}", {"serial_no": f"{PREFIX}-SERIAL-{i:03d}", "item_code": item, "warehouse": WAREHOUSE, "status": "Active"}, report)

    frappe.db.commit()
    print(json.dumps(report, indent=2, sort_keys=True))
    return report
