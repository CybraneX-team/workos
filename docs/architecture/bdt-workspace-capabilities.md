# BDT V4 workspace capabilities

| Department | Focus area | Connected evidence |
| --- | --- | --- |
| Product | Product Portfolio | ERPNext product catalogue |
| Sales | Deal Execution | ERPNext sales / CRM |
| Operations | Process & Capacity | ERPNext Operations exception-to-improvement snapshot |
| Marketing | Paid Acquisition | Meta Ads |
| All other canonical departments | Their named focus area | No provider-specific adapter yet |

The Systems node always remains visible. It presents an honest unsupported or
not-connected state where no provider data is available; it does not lock the
department graph.

Projects are kept in browser local storage under a V4 key scoped to the active
company and user. They are not shared with teammates or synchronized to the
backend. The UI must retain the “Saved on this device” notice anywhere projects
are created or viewed.

Operations has a dedicated workspace model documented in
[`operations-v4.md`](operations-v4.md): Systems is the ERPNext lifecycle and
Desk gateway; Metrics holds user-configured ERP-backed KPIs; Process & Capacity
is a read-only control tower rather than a synthetic health dashboard.
