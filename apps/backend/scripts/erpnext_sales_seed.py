from __future__ import annotations

import json
from datetime import date, datetime, timedelta

import frappe


PREFIX = "SALES-DEMO"
COMPANY = "Flashhhh Sales Demo"
ABBR = "FSD"

CUSTOMER_COUNT = 240
CONTACTS_PER_CUSTOMER = 2
LEAD_COUNT = 900
OPPORTUNITY_COUNT = 420
QUOTATION_COUNT = 300
SALES_ORDER_COUNT = 520
SALES_INVOICE_COUNT = 470

CUSTOMER_GROUPS = [
    "Sales Demo Enterprise",
    "Sales Demo Mid-Market",
    "Sales Demo SMB",
    "Sales Demo Strategic",
    "Sales Demo Startup",
    "Sales Demo Channel",
]
TERRITORIES = [
    "Sales Demo North America",
    "Sales Demo EMEA",
    "Sales Demo APAC",
    "Sales Demo LATAM",
    "Sales Demo India",
    "Sales Demo Digital",
]
CUSTOMER_TYPES = ["Company", "Individual"]
LEAD_SOURCES = ["Website", "Referral", "Partner", "Outbound", "Webinar", "Event", "Marketplace", ""]
LEAD_STATUSES = ["Lead", "Open", "Replied", "Opportunity", "Interested", "Do Not Contact", "Lost"]
OPPORTUNITY_STATUSES = ["Open", "Quotation", "Converted", "Lost", "Closed", "Replied"]
SALES_STAGES = ["Qualification", "Discovery", "Demo", "Proposal", "Negotiation", "Won", "Lost", ""]
COMMERCIAL_STATUSES = ["Draft", "To Deliver and Bill", "To Bill", "Completed", "Closed", "On Hold", "Cancelled"]
INDUSTRIES = [
    "Robotics",
    "Healthcare",
    "Fintech",
    "Logistics",
    "Manufacturing",
    "Education",
    "Retail",
    "Energy",
    "Media",
    "Agriculture",
]


def today(offset=0):
    return (date.today() + timedelta(days=offset)).isoformat()


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def setup_company_if_needed(report):
    if frappe.db.exists("Company", COMPANY):
        report["setup"] = "company_exists"
        return

    ensure_doc(
        "Company",
        COMPANY,
        {
            "company_name": COMPANY,
            "abbr": ABBR,
            "default_currency": "USD",
            "country": "United States",
        },
        report,
    )
    report["setup"] = "company_created_direct"


def bucket_for(report, doctype):
    return report.setdefault("doctypes", {}).setdefault(
        doctype, {"created": 0, "updated": 0, "skipped": 0, "failed": 0, "errors": []}
    )


def ensure_doc(doctype, name, fields, report, update_existing=False):
    bucket = bucket_for(report, doctype)

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
        forced = force_row(doctype, name, fields, update_existing=update_existing)
        if forced:
            if frappe.db.exists(doctype, name) and update_existing:
                bucket["updated"] += 1
            else:
                bucket["created"] += 1
            return forced
        bucket["failed"] += 1
        bucket["errors"].append(f"{name}: {type(exc).__name__}: {str(exc)[:220]}")
        return None


def force_row(doctype, name, fields, update_existing=False):
    """Last-resort local seed fallback for read-panel demo data.

    The Sales panels read via ERPNext REST. For heavily-linked transactional doctypes,
    local demo inserts can be blocked by accounting/item child validators; direct rows
    keep the analytics surface realistic without pretending to be posted accounting.
    """
    if not frappe.db.table_exists(doctype):
        return None

    table = f"tab{doctype}"
    columns = set(frappe.db.get_table_columns(doctype))
    existing = frappe.db.exists(doctype, name)

    row = {
        "name": name,
        "owner": "Administrator",
        "creation": now(),
        "modified": now(),
        "modified_by": "Administrator",
        "docstatus": fields.get("docstatus", 0),
        "idx": 0,
    }
    for key, value in fields.items():
        if key in columns and (isinstance(value, (str, int, float)) or value is None):
            row[key] = value

    safe_row = {key: value for key, value in row.items() if key in columns}
    if "name" not in safe_row:
        return None

    if existing:
        if update_existing:
            assignments = ", ".join(f"`{column}` = %s" for column in safe_row if column != "name")
            values = [safe_row[column] for column in safe_row if column != "name"]
            values.append(name)
            frappe.db.sql(f"update `{table}` set {assignments} where name = %s", values)
        return name

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
        "Customer Group": ["customer_group_name"],
        "Territory": ["territory_name"],
        "Customer": ["customer_name"],
        "Contact": ["email_id"],
        "Lead": ["lead_name", "company_name"],
        "Opportunity": ["party_name", "transaction_date", "opportunity_amount"],
        "Quotation": ["party_name", "transaction_date", "grand_total"],
        "Sales Order": ["customer", "transaction_date", "grand_total"],
        "Sales Invoice": ["customer", "posting_date", "grand_total"],
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


def weighted(items, index):
    return items[index % len(items)]


def customer_name(i):
    industry = weighted(INDUSTRIES, i)
    suffix = ["Labs", "Systems", "Works", "Cloud", "Health", "Robotics", "Logistics", "AI"][i % 8]
    return f"{industry} {suffix} {i:03d}"


def customer_id(i):
    return f"{PREFIX}-CUST-{i:04d}"


def seed_masters(report):
    for group in CUSTOMER_GROUPS:
        ensure_doc(
            "Customer Group",
            group,
            {"customer_group_name": group, "parent_customer_group": "All Customer Groups", "is_group": 0},
            report,
        )

    for territory in TERRITORIES:
        ensure_doc(
            "Territory",
            territory,
            {"territory_name": territory, "parent_territory": "All Territories", "is_group": 0},
            report,
        )


def seed_customers_and_contacts(report):
    for i in range(1, CUSTOMER_COUNT + 1):
        group = "" if i % 23 == 0 else weighted(CUSTOMER_GROUPS, i)
        territory = "" if i % 19 == 0 else weighted(TERRITORIES, i * 2)
        customer_type = "" if i % 29 == 0 else weighted(CUSTOMER_TYPES, i)
        name = customer_id(i)
        label = customer_name(i)
        ensure_doc(
            "Customer",
            name,
            {
                "customer_name": label,
                "customer_group": group,
                "territory": territory,
                "customer_type": customer_type,
                "disabled": 1 if i % 97 == 0 else 0,
            },
            report,
        )

        for j in range(1, CONTACTS_PER_CUSTOMER + 1):
            missing_email = i % 31 == 0 and j == 2
            missing_phone = i % 37 == 0 and j == 1
            ensure_doc(
                "Contact",
                f"{name}-CONTACT-{j}",
                {
                    "first_name": ["Avery", "Jordan", "Riley", "Morgan", "Casey", "Taylor"][(i + j) % 6],
                    "last_name": label.split()[0],
                    "email_id": "" if missing_email else f"buyer{j}.{name.lower()}@sales-demo.example.com",
                    "phone": "" if missing_phone else f"+1-555-{(1000 + i * 3 + j) % 9999:04d}",
                    "company_name": label,
                },
                report,
            )


def seed_leads(report):
    for i in range(1, LEAD_COUNT + 1):
        source = weighted(LEAD_SOURCES, i * 3)
        status = weighted(LEAD_STATUSES, i)
        ensure_doc(
            "Lead",
            f"{PREFIX}-LEAD-{i:04d}",
            {
                "lead_name": f"{weighted(['Alex', 'Sam', 'Priya', 'Mina', 'Owen', 'Nora', 'Ivy', 'Leo'], i)} {weighted(['North', 'Stone', 'Reed', 'Khan', 'Patel', 'Chen', 'Rivera'], i * 2)}",
                "company_name": "" if i % 41 == 0 else f"{weighted(INDUSTRIES, i)} Prospect {i:04d}",
                "status": status,
                "utm_source": source,
                "email_id": f"lead{i:04d}@sales-demo.example.com",
                "phone": f"+1-555-{(3000 + i) % 9999:04d}",
                "territory": weighted(TERRITORIES, i),
            },
            report,
            update_existing=True,
        )


def seed_opportunities(report):
    for i in range(1, OPPORTUNITY_COUNT + 1):
        customer = customer_id(((i * 7) % CUSTOMER_COUNT) + 1)
        stage = weighted(SALES_STAGES, i)
        status = "Lost" if stage == "Lost" else ("Converted" if stage == "Won" else weighted(OPPORTUNITY_STATUSES, i * 2))
        amount = 8_000 + ((i * 1379) % 240_000)
        ensure_doc(
            "Opportunity",
            f"{PREFIX}-OPP-{i:04d}",
            {
                "opportunity_from": "Customer",
                "party_name": customer,
                "customer_name": customer,
                "status": status,
                "sales_stage": stage,
                "opportunity_amount": amount,
                "transaction_date": today(-((i * 2) % 180)),
                "expected_closing": today(((i * 5) % 140) - 45),
                "source": weighted(LEAD_SOURCES[:-1], i),
                "company": COMPANY,
            },
            report,
        )


def seed_quotations(report):
    for i in range(1, QUOTATION_COUNT + 1):
        customer = customer_id(((i * 11) % CUSTOMER_COUNT) + 1)
        status = weighted(["Draft", "Submitted", "Ordered", "Lost", "Cancelled", "Open"], i)
        ensure_doc(
            "Quotation",
            f"{PREFIX}-QUOTE-{i:04d}",
            {
                "company": COMPANY,
                "quotation_to": "Customer",
                "party_name": customer,
                "transaction_date": today(-((i * 3) % 160)),
                "valid_till": today(((i * 7) % 90) - 15),
                "grand_total": 12_000 + ((i * 991) % 180_000),
                "status": status,
                "docstatus": 1 if status in ("Submitted", "Ordered", "Lost") else 0,
            },
            report,
        )


def seed_commercial_records(report):
    for i in range(1, SALES_ORDER_COUNT + 1):
        customer = customer_id(((i * 13) % CUSTOMER_COUNT) + 1)
        status = weighted(COMMERCIAL_STATUSES, i)
        ensure_doc(
            "Sales Order",
            f"{PREFIX}-SO-{i:04d}",
            {
                "company": COMPANY,
                "customer": customer,
                "transaction_date": today(-((i * 2) % 240)),
                "delivery_date": today(((i * 3) % 90) - 20),
                "grand_total": 6_000 + ((i * 1789) % 260_000),
                "status": status,
                "docstatus": 1 if status not in ("Draft", "Cancelled") else 0,
            },
            report,
        )

    for i in range(1, SALES_INVOICE_COUNT + 1):
        customer = customer_id(((i * 17) % CUSTOMER_COUNT) + 1)
        status = weighted(["Draft", "Paid", "Unpaid", "Overdue", "Return", "Cancelled"], i)
        ensure_doc(
            "Sales Invoice",
            f"{PREFIX}-SI-{i:04d}",
            {
                "company": COMPANY,
                "customer": customer,
                "posting_date": today(-((i * 3) % 260)),
                "grand_total": 4_000 + ((i * 1607) % 240_000),
                "status": status,
                "docstatus": 1 if status not in ("Draft", "Cancelled") else 0,
            },
            report,
        )


def seed():
    report = {
        "site": frappe.local.site,
        "setup": None,
        "profile": "sales_prod_level",
        "target_counts": {
            "Customer": CUSTOMER_COUNT,
            "Contact": CUSTOMER_COUNT * CONTACTS_PER_CUSTOMER,
            "Lead": LEAD_COUNT,
            "Opportunity": OPPORTUNITY_COUNT,
            "Quotation": QUOTATION_COUNT,
            "Sales Order": SALES_ORDER_COUNT,
            "Sales Invoice": SALES_INVOICE_COUNT,
        },
        "doctypes": {},
    }
    setup_company_if_needed(report)
    seed_masters(report)
    seed_customers_and_contacts(report)
    seed_leads(report)
    seed_opportunities(report)
    seed_quotations(report)
    seed_commercial_records(report)
    frappe.db.commit()
    print(json.dumps(report, indent=2, sort_keys=True))
    return report
