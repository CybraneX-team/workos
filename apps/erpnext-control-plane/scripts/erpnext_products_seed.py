from __future__ import annotations

import json

import frappe


PREFIX = "PL-DEMO"
ROOT_GROUP = "All Item Groups"
PRICE_LIST = "Standard Selling"
CURRENCY = "INR"


def ensure_item_group(name, parent, is_group, report):
    if frappe.db.exists("Item Group", name):
        report["item_groups"]["skipped"] += 1
        return name
    doc = frappe.get_doc(
        {
            "doctype": "Item Group",
            "item_group_name": name,
            "parent_item_group": parent,
            "is_group": is_group,
        }
    )
    doc.insert(ignore_permissions=True)
    report["item_groups"]["created"] += 1
    return doc.name


def ensure_item(code, label, item_group, price, disabled, report):
    if frappe.db.exists("Item", code):
        report["items"]["skipped"] += 1
    else:
        frappe.get_doc(
            {
                "doctype": "Item",
                "item_code": code,
                "item_name": label,
                "item_group": item_group,
                "stock_uom": "Nos",
                "is_stock_item": 0,
                "is_sales_item": 1,
                "disabled": 1 if disabled else 0,
            }
        ).insert(ignore_permissions=True)
        report["items"]["created"] += 1

    if price is None:
        report["prices"]["intentionally_unpriced"] += 1
        return

    existing = frappe.db.exists(
        "Item Price", {"item_code": code, "price_list": PRICE_LIST, "currency": CURRENCY}
    )
    if existing:
        report["prices"]["skipped"] += 1
        return
    frappe.get_doc(
        {
            "doctype": "Item Price",
            "item_code": code,
            "price_list": PRICE_LIST,
            "price_list_rate": price,
            "currency": CURRENCY,
            "selling": 1,
        }
    ).insert(ignore_permissions=True)
    report["prices"]["created"] += 1


def seed():
    """Create an idempotent rich catalog fixture for the live Product Lines BDT view.

    It deliberately contains nested groups, direct line items, disabled items, unpriced
    items, and root-level items so the UI's hierarchy and readiness states are testable.
    """
    report = {
        "site": frappe.local.site,
        "item_groups": {"created": 0, "skipped": 0},
        "items": {"created": 0, "skipped": 0},
        "prices": {"created": 0, "skipped": 0, "intentionally_unpriced": 0},
    }

    lines = [
        ("PL-DEMO Platform", ["PL-DEMO Platform Core", "PL-DEMO Platform Add-ons"]),
        ("PL-DEMO Analytics", ["PL-DEMO Analytics Reporting", "PL-DEMO Analytics AI"]),
        ("PL-DEMO Services", ["PL-DEMO Services Implementation", "PL-DEMO Services Support"]),
        ("PL-DEMO Hardware", ["PL-DEMO Hardware Sensors", "PL-DEMO Hardware Accessories"]),
    ]
    for line, groups in lines:
        ensure_item_group(line, ROOT_GROUP, 1, report)
        for group in groups:
            ensure_item_group(group, line, 0, report)

    items = [
        # Platform: direct items plus nested core and add-on products.
        ("PL-DEMO-PLATFORM-STARTER", "Platform Starter", "PL-DEMO Platform", 14900, False),
        ("PL-DEMO-PLATFORM-SCALE", "Platform Scale", "PL-DEMO Platform", 34900, False),
        ("PL-DEMO-CORE-API", "Core API Access", "PL-DEMO Platform Core", 9900, False),
        ("PL-DEMO-CORE-WORKFLOW", "Workflow Engine", "PL-DEMO Platform Core", 17900, False),
        ("PL-DEMO-CORE-AUDIT", "Audit Trail Module", "PL-DEMO Platform Core", None, False),
        ("PL-DEMO-ADDON-SSO", "Enterprise SSO Add-on", "PL-DEMO Platform Add-ons", 7900, False),
        ("PL-DEMO-ADDON-EXPORT", "Data Export Add-on", "PL-DEMO Platform Add-ons", 4900, False),
        ("PL-DEMO-ADDON-LEGACY", "Legacy Connector Add-on", "PL-DEMO Platform Add-ons", 2900, True),
        # Analytics: reporting and AI products.
        ("PL-DEMO-ANALYTICS-ESSENTIALS", "Analytics Essentials", "PL-DEMO Analytics", 11900, False),
        ("PL-DEMO-ANALYTICS-EXEC", "Executive Analytics", "PL-DEMO Analytics", 22900, False),
        ("PL-DEMO-REPORT-DASHBOARDS", "Operational Dashboards", "PL-DEMO Analytics Reporting", 6900, False),
        ("PL-DEMO-REPORT-SCHEDULED", "Scheduled Reports", "PL-DEMO Analytics Reporting", None, False),
        ("PL-DEMO-REPORT-EMBEDDED", "Embedded Reporting", "PL-DEMO Analytics Reporting", 9900, False),
        ("PL-DEMO-AI-FORECAST", "Forecasting Models", "PL-DEMO Analytics AI", 15900, False),
        ("PL-DEMO-AI-COPILOT", "Analytics Copilot", "PL-DEMO Analytics AI", 19900, False),
        ("PL-DEMO-AI-CLASSIC", "Classic ML Pack", "PL-DEMO Analytics AI", 12900, True),
        # Services: implementation and support offerings.
        ("PL-DEMO-SERVICES-ONBOARD", "Launch Onboarding", "PL-DEMO Services", 25000, False),
        ("PL-DEMO-SERVICES-ADVISORY", "Product Advisory", "PL-DEMO Services", None, False),
        ("PL-DEMO-IMPLEMENT-DISCOVERY", "Implementation Discovery", "PL-DEMO Services Implementation", 18000, False),
        ("PL-DEMO-IMPLEMENT-MIGRATION", "Data Migration Service", "PL-DEMO Services Implementation", 42000, False),
        ("PL-DEMO-IMPLEMENT-TRAINING", "Team Enablement", "PL-DEMO Services Implementation", 15000, False),
        ("PL-DEMO-SUPPORT-STANDARD", "Standard Support Plan", "PL-DEMO Services Support", 7900, False),
        ("PL-DEMO-SUPPORT-PRIORITY", "Priority Support Plan", "PL-DEMO Services Support", 17900, False),
        ("PL-DEMO-SUPPORT-ARCHIVED", "Archived Support Plan", "PL-DEMO Services Support", None, True),
        # Hardware: sensor and accessory catalog.
        ("PL-DEMO-HARDWARE-STARTER", "Connected Hardware Starter Kit", "PL-DEMO Hardware", 28900, False),
        ("PL-DEMO-HARDWARE-PRO", "Connected Hardware Pro Kit", "PL-DEMO Hardware", 54900, False),
        ("PL-DEMO-SENSOR-INDOOR", "Indoor Environment Sensor", "PL-DEMO Hardware Sensors", 6900, False),
        ("PL-DEMO-SENSOR-OUTDOOR", "Outdoor Environment Sensor", "PL-DEMO Hardware Sensors", 9900, False),
        ("PL-DEMO-SENSOR-LEGACY", "Legacy Temperature Sensor", "PL-DEMO Hardware Sensors", None, True),
        ("PL-DEMO-ACCESSORY-MOUNT", "Universal Mount", "PL-DEMO Hardware Accessories", 1900, False),
        ("PL-DEMO-ACCESSORY-POWER", "Extended Power Pack", "PL-DEMO Hardware Accessories", 3900, False),
        ("PL-DEMO-ACCESSORY-CABLE", "Industrial Cable Set", "PL-DEMO Hardware Accessories", None, False),
        # Root assignments intentionally exercise the virtual Unclassified line.
        ("PL-DEMO-UNCLASSIFIED-TRIAL", "Unclassified Trial Product", ROOT_GROUP, None, False),
        ("PL-DEMO-UNCLASSIFIED-RETIRED", "Retired Unclassified Product", ROOT_GROUP, 1000, True),
    ]
    for entry in items:
        ensure_item(*entry, report)

    frappe.db.commit()
    report["summary"] = {
        "top_level_product_lines": len(lines),
        "nested_item_groups": sum(len(groups) for _, groups in lines),
        "products": len(items),
        "disabled_products": sum(1 for *_, disabled in items if disabled),
        "unpriced_products": sum(1 for *_, price, _ in items if price is None),
        "unclassified_products": sum(1 for _, _, group, _, _ in items if group == ROOT_GROUP),
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    return report
