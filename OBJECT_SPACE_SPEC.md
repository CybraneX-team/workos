# PMS Object Space — Design & Implementation Specification

**Document Version**: 3.0  
**Design Pattern**: Design Archetype 1 — "The Split Cockpit" with Dynamic Step Widgets  
**Primary Focus**: Desktop First with Mobile Responsive Foundation  

---

## 1. Executive Summary & User Journey

The **Object Space** is the personalized execution copilot within the PMS. It connects the user's high-level department context directly to actionable, chronological step-by-step implementation tasks.

### Core User Journey:
```
+-----------------------------------------------------------------------------------------------+
|  1. MACRO VIEW: User-Centric Department & Assigned Tasks Hub                                  |
|  - Focused on the user's active department (e.g. Sales, Engineering, Marketing)              |
|  - Orbital / Card Graph showing the user's specific Assigned Tasks, Deadlines, & Priority     |
+-----------------------------------------------+-----------------------------------------------+
                                                | (User clicks on an Assigned Task)
                                                v
+-----------------------------------------------------------------------------------------------+
|  2. MICRO VIEW: The Split Cockpit                                                             |
|  - Left Panel: Chronological Step Stepper (Checklists, Scripts, Live Forms, Connectors)       |
|  - Right Panel: Active Action Canvas (Teleprompter, Metric Loggers, 1-Click Connected Tools)  |
|  - Action Tray: Add Custom Sub-Step, Save Progress, Submit Final Report                       |
+-----------------------------------------------------------------------------------------------+
```

---

## 2. Interaction Design & Architecture: The Split Cockpit

When an assignee selects a task, the screen transitions into a high-focus **Split Cockpit**:

```
+---------------------------------------------------------------------------------------------------------------+
| [← Back to My Tasks]   Task: Outbound Prospecting & Call Blitz    [Alex Mercer • SDR]  [ ● Live ]  [ 45% ]    |
+---------------------------------------+-----------------------------------------------------------------------+
| LEFT PANEL: Implementation Stepper    | RIGHT PANEL: Active Action Workspace                                  |
| (Chronological SOP Workflow)          | (Dynamic Step Renderer)                                               |
|                                       |                                                                       |
| [✓] 1. Pre-Flight Prep                | ┌───────────────────────────────────────────────────────────────────┐ |
|     • Target ICP & Objection Sheet    | │ ACTIVE STEP: Sprint 1 Calling & Outreach                          │ |
|                                       | ├───────────────────────────────────────────────────────────────────┤ |
| [✓] 2. Pitch & Script Viewer          | │ 📖 TALK TRACK & VALUE HOOK                                        │ |
|     • 30s Elevator Hook               | │ "Hi [First Name], this is Alex with WorkOS. I noticed..."         │ |
|                                       | │                                                                   │ |
| [►] 3. Sprint 1 Calling [ACTIVE]      | │ [ 📋 Copy Pitch ]   [ 💡 Objection: 'No Budget' ] [ 'Competitor' ]│ |
|     • Log outcomes & dials            | ├───────────────────────────────────────────────────────────────────┤ |
|                                       | │ 📊 REAL-TIME LOGGING INPUTS                                       │ |
| [ ] 4. Sprint 2 Calling               | │ Dials Made: [ - 18 + ]   Connected: [ - 4 + ]                     │ |
|     • Continued outreach              | │ Gatekeeper: [ - 8 + ]    Demos Booked: [ ⭐ 2 ]                   │ |
|                                       | ├───────────────────────────────────────────────────────────────────┤ |
| [ ] 5. Schedule Demos                 | │ ⚡ CONNECTED ACTIONS                                              │ |
|     • 1-Click Calendar Invites        | │ [ 📞 Launch CRM Dialer ]   [ 📅 Send Google Calendar Invite ]     │ |
|                                       | └───────────────────────────────────────────────────────────────────┘ |
| [ ] 6. Daily Wrap-up & Submission     |                                                                       |
|                                       | [ + Add Custom Sub-Step ]                     [ Complete Step & Next →]
+---------------------------------------+-----------------------------------------------------------------------+
| FOOTER TRAY: [ ⏸ Save Draft ]         [ 📝 Assignee Notes ]                          [ 🚀 Submit Task & Report ] |
+---------------------------------------------------------------------------------------------------------------+
```

---

## 3. Dynamic Step Widgets Specification

Each step in an implementation task renders one of four specialized interactive widgets:

### 1. Script & SOP Teleprompter (`script_viewer`)
* **Purpose**: Provides instant talk tracks, guidelines, and objection responses right next to the work.
* **UI Features**:
  * Rich typography with highlighted variable tokens (e.g. `[First Name]`, `[Company Name]`).
  * Quick-switch objection chips (`"No Budget"`, `"Using Competitor"`, `"Bad Timing"`).
  * 1-Click Copy button with visual toast confirmation.

### 2. Interactive Verification Checklist (`checklist`)
* **Purpose**: Enforces standard operating procedures (SOP) and pre-flight verification before progressing.
* **UI Features**:
  * Tactile checkbox items with completion strike-throughs.
  * Real-time validation (e.g. required checkboxes before enabling the "Next Step" action).

### 3. Metric & Data Form Input (`input_form`)
* **Purpose**: Captures quantitative results and qualitative observations without switching tools.
* **UI Features**:
  * Large, tactile increment counters (`[ - ]` `[ Count ]` `[ + ]`) for high-speed logging.
  * Number inputs and structured dropdowns.
  * Live target progress bar indicator.

### 4. 1-Click Connected Actions (`connector_action`)
* **Purpose**: Triggers internal or external tools with pre-filled context in a single click.
* **Integrations**:
  * **Email / Gmail**: Opens pre-formatted email drafts via web intent or in-app modal.
  * **Dialer / VoIP**: Direct `tel:` link or integrated dialer.
  * **Calendar**: Pre-filled Google Calendar / Calendly booking links.
  * **GitHub / Git**: 1-click jump to active Pull Requests and CI checks.
  * **Figma**: Embedded component design frames.
  * **Native Sales**: 1-click Quote or Invoice PDF generation.

---

## 4. Multi-Department Implementation Tasks & Step Workflows

---

### Category A: Revenue & Commercial Operations

#### 1. Outbound Sales & Business Development (SDR/BDR)
* **Task Title**: Outbound Prospecting & Call Blitz
* **Goal**: Complete target dial volume, connect with decision-makers, and book qualified discovery demos.
* **Connectors**: CRM Dialer, Google Calendar, CRM Lead Updater

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **Pre-Flight Prep** | `Checklist` | Verify target account list in CRM and review objection cheat-sheet. |
| **2** | **Pitch & Script** | `Script Viewer` | Review standard elevator pitch, value propositions, and discovery questions. |
| **3** | **Calling Sprint 1** | `Input Form` | Dial initial batch. Log outcomes: Total Dials, Connected, Voicemails, Disqualified. |
| **4** | **Calling Sprint 2** | `Input Form` | Dial second batch with adjusted pitch based on earlier feedback. |
| **5** | **Schedule Demos** | `Connector Action` | 1-click trigger to send calendar invites for all booked demos. |
| **6** | **Wrap-up & CRM Hygiene** | `Checklist` | Update lead stages to `Contacted` / `Qualified` and submit daily summary. |

---

#### 2. Inbound Sales & Lead Qualification
* **Task Title**: Inbound Lead Triage & First-Touch Response
* **Goal**: Respond quickly to high-intent web leads, qualify fit, and route to account executives.
* **Connectors**: Gmail / Email Client, LinkedIn, CRM Deal Converter

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **Lead Enrichment** | `Checklist` | Check company size, industry vertical, and tech stack fit. |
| **2** | **Intro Email** | `Connector Action` | 1-click trigger to send personalized intro email using approved template. |
| **3** | **Discovery & Qualification** | `Input Form` | Conduct discovery call and log BANT ratings (Budget, Authority, Need, Timeline). |
| **4** | **Deal Handoff** | `Checklist` | Convert qualified lead into a Deal and assign to an Account Executive. |

---

#### 3. Customer Success & Account Management
* **Task Title**: Quarterly Business Review (QBR) Preparation
* **Goal**: Deliver executive-ready usage metrics and ROI presentation for client leadership.
* **Connectors**: Analytics Exporter, Google Slides, Email Sender

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **Usage & Health Audit** | `Checklist` | Export active user counts, feature adoption rates, and open support tickets. |
| **2** | **ROI & Value Summary** | `Input Form` | Calculate estimated business value, hours saved, and operational ROI. |
| **3** | **Build QBR Slide Deck** | `Connector Action` | Open pre-populated presentation template and embed verified data points. |
| **4** | **Send Meeting Invite** | `Checklist` | Email client stakeholders and schedule 45-minute live walkthrough. |

---

### Category B: Marketing, Growth & Brand

#### 4. Paid Performance Marketing (PPC / Paid Social)
* **Task Title**: Paid Ads Creative & Budget Optimization
* **Goal**: Audit active campaigns, retire underperforming ad sets, and launch fresh creative assets.
* **Connectors**: Meta Ads Manager, UTM Validator, Analytics Dashboard

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **Metrics Capture** | `Input Form` | Record spend, blended CAC, CTR, and ROAS across all active campaigns. |
| **2** | **Fatigue Audit** | `Checklist` | Identify and pause ad sets with high frequency and declining click-through rates. |
| **3** | **Upload New Creatives** | `Connector Action` | Open Campaign Studio to upload approved video/image assets and ad copy. |
| **4** | **Pre-Flight Verification** | `Checklist` | Verify tracking UTMs, lead form webhooks, and daily spending caps. |
| **5** | **Optimization Notes** | `Input Form` | Document budget reallocations and target audience adjustments. |

---

#### 5. Content, SEO & Social Media
* **Task Title**: SEO Article Publishing & Multi-Channel Distribution
* **Goal**: Publish an SEO-optimized pillar blog post and distribute across social channels and newsletter.
* **Connectors**: Web CMS, Social Scheduler, SEO Analyzer

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **On-Page SEO Review** | `Checklist` | Check target keywords in headings, clean URL slug, meta description, and image alt tags. |
| **2** | **Publish Article** | `Connector Action` | 1-click trigger to publish the draft to the live CMS. |
| **3** | **Social Repurposing** | `Input Form` | Draft social teaser posts, discussion threads, and newsletter summary blurb. |
| **4** | **Internal Backlinking** | `Checklist` | Add links from existing high-traffic articles to the newly published piece. |

---

### Category C: Product, Design & Engineering

#### 6. Software Engineering (Frontend & Backend)
* **Task Title**: Daily Pull Request Triage & Code Review
* **Goal**: Review assigned pull requests promptly, maintain high code quality, and prevent regressions.
* **Connectors**: GitHub PR Viewer, CI Pipeline Runner

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **Open Review Queue** | `Connector Action` | Fetch and open assigned pull requests in GitHub. |
| **2** | **Quality Checklist** | `Checklist` | Verify test coverage, strict TypeScript typing, security sanity, and edge-case handling. |
| **3** | **Submit Verdict** | `Input Form` | Submit official PR approval or document specific line-item change requests. |

---

#### 7. Quality Assurance & Release Engineering
* **Task Title**: Production Release Smoke & Regression Test
* **Goal**: Complete end-to-end smoke test validation across core flows prior to production deployment.
* **Connectors**: Staging Environment, Automated Test Runner, Release Dashboard

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **Auth & Access Test** | `Checklist` | Verify Login, Magic Link, SSO, and RBAC permission redirects on staging. |
| **2** | **Core Workflows Test** | `Checklist` | Test lead creation, document generation, and data export flows. |
| **3** | **Bug Triage Log** | `Input Form` | Log any blocking regressions with video recording links and error payloads. |
| **4** | **Release Sign-Off** | `Checklist` | Approve production deployment in the release dashboard. |

---

#### 8. Product UI/UX Design
* **Task Title**: Design Token & Component Handoff Package
* **Goal**: Deliver complete component states, responsive layouts, and token specs for engineering handoff.
* **Connectors**: Figma Viewer, Design Token Exporter

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **Open Workspace** | `Connector Action` | Open component prototype workspace in Figma. |
| **2** | **States & Specs Audit** | `Checklist` | Verify color contrast (WCAG AA), responsive breakpoints, hover, active, and loading states. |
| **3** | **Props & Tokens Export** | `Input Form` | Document spacing, border radius, typography tokens, and component props. |

---

### Category D: Operations, Supply Chain & Legal

#### 9. Inventory, Procurement & Logistics
* **Task Title**: Stock Level Audit & Reorder Point Check
* **Goal**: Identify SKUs below minimum buffer threshold and generate supplier purchase orders.
* **Connectors**: Catalogue Stock Manager, Purchase Order Generator, Email Sender

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **Stock Balance Pull** | `Input Form` | Record physical inventory counts vs. system recorded balances. |
| **2** | **Reorder Check** | `Checklist` | Flag all SKUs currently below designated safety stock buffer levels. |
| **3** | **Generate PO** | `Connector Action` | Create formal supplier Purchase Order with required quantities and lead times. |
| **4** | **Supplier Dispatch** | `Checklist` | Email PO to supplier and confirm expected warehouse delivery date. |

---

#### 10. Legal & Corporate Compliance
* **Task Title**: Enterprise Agreement & Contract Compliance Review
* **Goal**: Review contract redlines, verify liability caps, and confirm SLA clauses within turnaround window.
* **Connectors**: DocuSign, Document Redline Viewer

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **Standard Terms Audit** | `Checklist` | Verify liability caps, payment terms (Net 30), DPA compliance, and IP ownership. |
| **2** | **Risk Evaluation** | `Input Form` | Note requested deviations, assess exposure, and assign overall risk rating. |
| **3** | **Dispatch for Signature**| `Connector Action` | Send finalized agreement to authorized signatories via DocuSign. |

---

### Category E: People, Talent & HR

#### 11. Talent Acquisition & Technical Recruiting
* **Task Title**: Candidate Pipeline Review & Initial Screen Cadence
* **Goal**: Review active applicant pipeline, conduct initial qualification screens, and advance qualified talent.
* **Connectors**: ATS Tracker, Calendly Link, Email Sender

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **Resume Screening** | `Checklist` | Evaluate candidate technical skills, relevant domain background, and portfolio work. |
| **2** | **Batch Triage** | `Input Form` | Mark applicants as Advance or Reject with standardized disposition tags. |
| **3** | **Conduct Screens** | `Script Viewer` | Use standard interview talk track to evaluate motivations, compensation, and availability. |
| **4** | **Schedule Next Round** | `Connector Action` | 1-click trigger to send interview scheduling links to advancing candidates. |

---

#### 12. People Operations & Onboarding
* **Task Title**: New Hire Day-1 Provisioning & Workspace Setup
* **Goal**: Ensure 100% of accounts, hardware, and access permissions are active on the employee start date.
* **Connectors**: Google Admin Console, WorkOS RBAC Manager, Email Sender

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **Account Provisioning** | `Checklist` | Create company email (enforce 2FA), assign Slack channels, tool seats, and RBAC role. |
| **2** | **Welcome Packet** | `Connector Action` | Dispatch Day-1 welcome guide, team intro schedule, and manager check-in invite. |
| **3** | **Compliance Verification**| `Checklist` | Verify signed offer letter, NDA, and tax/direct deposit details. |

---

### Category F: Finance, Accounting & RevOps

#### 13. Accounts Receivable & Billing
* **Task Title**: Recurring Billing & Customer Invoice Run
* **Goal**: Generate and deliver customer invoices accurately according to contract terms.
* **Connectors**: WorkOS Native Sales (`/api/sales`), Stripe Billing, PDF Generator

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **Sales Order Audit** | `Checklist` | Pull active confirmed sales orders from Native Sales. |
| **2** | **Usage Calculations** | `Input Form` | Input metered usage or overage units for tiered accounts. |
| **3** | **Issue Invoices** | `Connector Action` | Generate official PDF invoices and dispatch Stripe payment links to billing contacts. |
| **4** | **Reconciliation** | `Checklist` | Match issued invoice totals against accounting sub-ledger records. |

---

#### 14. Accounts Payable & Expense Audit
* **Task Title**: Vendor Invoice Verification & Payment Approval
* **Goal**: Match vendor invoices against approved Purchase Orders and schedule payment runs.
* **Connectors**: Banking Portal, PO Reconciliation Tool

| # | Step Name | Step Type | What the User Does |
| :-: | :--- | :--- | :--- |
| **1** | **3-Way Match Audit** | `Checklist` | Verify vendor invoice matches PO item numbers, unit price, and receipt confirmation. |
| **2** | **Payment Authorization**| `Input Form` | Enter disbursement amount and departmental approval sign-off. |
| **3** | **Release Payment** | `Connector Action` | Schedule ACH / wire transfer in banking portal. |

---

## 5. UI Layout & Responsive Design Guidelines

### Desktop View (Primary Target)
* **Left Stepper Column**: Fixed width (360px - 400px), custom scrollbar, active step highlight with ambient glow.
* **Right Canvas Column**: Flexible viewport fill with glassmorphic cards (`backdrop-blur-md`, subtle 1px border `rgba(255,255,255,0.08)`).
* **Footer Tray**: Sticky bottom action bar with `Save Draft`, `Assignee Notes`, and `Submit Task & Report`.

### Mobile / Tablet Adaptation (Foundation)
* **Stack Layout**: On screens $< 768px$, the Left Stepper converts into a horizontal top progress ribbon or collapsible drawer.
* **Touch-Friendly Controls**: Minimum 44px tap targets for increment counters, checkboxes, and connector buttons.
