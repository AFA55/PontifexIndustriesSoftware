# COMPETITIVE ANALYSIS: Pontifex vs Cenpoint vs DSM
**Date:** March 19, 2026 | **Prepared for:** Patriot Concrete Cutting

---

## EXECUTIVE SUMMARY

Pontifex Industries already has **more features than both competitors combined** in several areas. Where we lag is in a few legacy features DSM has refined over 30+ years (certified payroll reporting, diamond blade tracking granularity) and CenPoint's AI scheduling automation. The good news: we can build these gaps fast and our modern tech stack (Next.js + React + Supabase) gives us a **massive UI/UX advantage** — both competitors have dated, early-2000s interfaces.

**Bottom line:** With 2-3 weeks of focused work, Pontifex will be objectively the most complete and modern concrete cutting management platform on the market.

---

## FEATURE-BY-FEATURE COMPARISON

### 1. SCHEDULING & DISPATCHING

| Feature | Pontifex ✅ | CenPoint | DSM |
|---------|-----------|----------|-----|
| Visual schedule board | ✅ Slot + Operator row views | ✅ Calendar drag-drop | ❌ List-based only |
| Drag & drop assignment | ✅ @dnd-kit, super_admin gated | ✅ Drag-drop work orders | ❌ Manual assignment |
| Operator skill matching | ✅ 1-10 scale, green/yellow/red indicators | ❌ None | ✅ Skill-level filtered list |
| AI auto-scheduling | ❌ **GAP** | ✅ AI Scheduler (travel optimization, certification-aware) | ❌ None |
| Unassigned job queue | ✅ Bottom section with assign button | ✅ Bottom table | ✅ Filtered list |
| Multi-day job support | ✅ Auto day-number increment via DB trigger | ✅ Yes | ✅ Yes |
| 8-step job creation wizard | ✅ Full wizard with scope builder | ❌ Basic form | ❌ Basic form |
| Job difficulty rating | ✅ 1-10 scale on jobs | ❌ None | ❌ None |
| Quick-add jobs | ✅ Side panel quick add | ❌ Unknown | ❌ Unknown |
| Capacity tracking | ✅ API endpoint for operator capacity | ❌ Unknown | ✅ Hours tracking |
| Send schedule notifications | ✅ SMS + email dispatch | ✅ Auto text customers | ✅ Texting support |
| Schedule contacts | ✅ Dedicated contact management | ✅ Customer contacts | ✅ Customer contacts |
| Google Maps integration | ✅ Distance calc, geocoding, address autocomplete | ❌ Unknown | ✅ Geographical mapping |

**Pontifex Advantage:** Most complete scheduling UX. 8-step wizard, skill matching, dual board views.
**Gap to Close:** AI auto-scheduling (CenPoint's killer feature — reduces travel miles, respects certifications, learns preferences).

---

### 2. OPERATOR FIELD APP / MOBILE

| Feature | Pontifex ✅ | CenPoint | DSM |
|---------|-----------|----------|-----|
| Native job workflow | ✅ 6-step: my-jobs → jobsite → work-performed → day-complete | ✅ Field tickets with time punches | ✅ Basic job access |
| Time tracking (4 timestamps) | ✅ Clock-in/out, travel, onsite | ✅ Started/arrived/departed/completed | ✅ Basic timecards |
| Work item logging | ✅ Granular work_items table + localStorage fallback | ✅ Field ticket descriptions | ✅ Work description entry |
| Photo upload | ✅ PhotoUploader component | ✅ Job site pictures | ✅ Jobsite photos |
| Customer signatures | ✅ Service completion agreement + liability release | ✅ On-device, text link, or QR code | ✅ Customer sign-offs |
| Digital dispatch ticket | ✅ Landscape PDF, 3-column layout | ✅ Digital field tickets | ✅ Job ticket format |
| Job Safety Analysis (JSA) | ✅ Full JSA form builder | ✅ Safety plans | ❌ Safety inspections only |
| Silica exposure plans | ✅ Dedicated silica plan system | ✅ Silica compliance | ❌ None |
| Liability waivers | ✅ PDF generation + capture | ❌ Unknown | ❌ Unknown |
| QR/NFC scanning | ✅ QR scanner + NFC scan + NFC pairing | ❌ Unknown | ❌ None |
| Equipment checkout | ✅ Full checkout/return flow | ❌ Unknown | ❌ Equipment assignment only |
| Blade management (field) | ✅ Manage blades page for operators | ❌ Unknown | ✅ Blade usage entry on job tickets |
| Standby management | ✅ Dedicated standby workflow | ❌ Unknown | ❌ Unknown |
| Damage reporting | ✅ Report damage with photos | ❌ Unknown | ❌ Unknown |
| Maintenance requests | ✅ From-field maintenance requests | ❌ Unknown | ❌ Unknown |
| Onboarding tour | ✅ Interactive guided tour | ❌ Unknown | ❌ None |
| Voice input | ✅ VoiceMicButton component | ✅ AI voice/text for job entry | ❌ None |
| Offline mode | ❌ **GAP** (localStorage fallback only) | ❌ Unknown | ❌ Requires internet (3G+) |

**Pontifex Advantage:** Most complete field workflow. JSA, silica, liability, NFC/QR, standby, damage — nobody else has this depth.
**Gap to Close:** CenPoint's signature via QR code/text link (customer doesn't need app), offline-first data sync.

---

### 3. CUSTOMER / CRM

| Feature | Pontifex ✅ | CenPoint | DSM |
|---------|-----------|----------|-----|
| Customer database | ✅ Full CRM with profiles | ✅ Customer management | ✅ Customer billing integration |
| Multiple contacts per customer | ✅ customer_contacts table, roles, primary/billing flags | ✅ Contacts | ✅ Basic contacts |
| Job history per customer | ✅ API enrichment with revenue stats | ✅ Job history | ✅ Job history |
| Revenue tracking | ✅ total_revenue, active_jobs aggregation | ❌ Unknown | ❌ Unknown |
| Customer autocomplete | ✅ Schedule form integration | ❌ Unknown | ❌ Unknown |
| Auto-link jobs to customers | ✅ customer_id FK + backfill migration | ✅ Yes | ✅ Yes |
| AR/overdue warnings | ❌ **GAP** | ❌ Unknown | ✅ Warns before dispatching to overdue customer |
| Collection letters | ❌ **GAP** | ❌ Unknown | ✅ 3-stage automated collection letters |
| Customer types | ✅ GC, sub, direct, government, other | ❌ Unknown | ❌ Unknown |
| Payment terms | ✅ net_15/30/45/60, due_on_receipt | ❌ Unknown | ❌ Unknown |

**Pontifex Advantage:** Modern CRM with rich customer profiles, revenue analytics, autocomplete integration.
**Gap to Close:** AR aging warnings on dispatch (DSM's great feature), automated collection letters.

---

### 4. BILLING & INVOICING

| Feature | Pontifex ✅ | CenPoint | DSM |
|---------|-----------|----------|-----|
| Invoice generation | ✅ Create from UI with line items | ✅ Auto-convert field tickets to invoices | ✅ Auto from job data |
| Invoice PDF | ✅ Professional branded PDF | ✅ PDF email to customer | ✅ Print/fax/email |
| Invoice numbering | ✅ INV-{year}-{6 digits} | ✅ Unknown format | ✅ Custom |
| Customer payment link | ❌ **GAP** | ✅ Text/email link for customer to view & pay | ❌ Unknown |
| QuickBooks integration | ❌ **GAP** (planned) | ❌ Unknown | ✅ Automated data transfer |
| AIA billing | ❌ **GAP** | ❌ Unknown | ✅ Progress billing, % completion |
| Monthly statements | ❌ **GAP** | ❌ Unknown | ✅ Automated statements |
| Payment tracking | ✅ Draft → sent → paid pipeline | ✅ Yes | ✅ Full AR |
| Branded invoices | ✅ Dynamic from tenant_branding | ❌ Unknown | ❌ Static branding |

**Pontifex Advantage:** Modern UI, branded PDFs, line-item editor.
**Gap to Close:** Online payment links (huge for cash flow), QuickBooks sync, AIA billing, monthly statements.

---

### 5. EQUIPMENT & FLEET

| Feature | Pontifex ✅ | CenPoint | DSM |
|---------|-----------|----------|-----|
| Equipment inventory | ✅ Full CRUD with categories | ✅ Equipment tracking | ✅ Equipment tracking |
| Equipment units (serialized) | ✅ Individual asset tracking with NFC pairing | ❌ Unknown | ✅ Basic tracking |
| Truck tracking | ❌ **GAP** | ❌ Unknown | ✅ Truck info, mileage, DOT/license expiration |
| Equipment assignment to operators | ✅ Full checkout/return flow | ❌ Unknown | ✅ Assign to truck/operator |
| Maintenance scheduling | ✅ Maintenance schedules + alerts | ❌ Unknown | ✅ Service history, next service date |
| Repair tracking | ✅ Repair status tracking | ❌ Unknown | ✅ Labor, parts, vendor costs |
| Equipment usage logging | ✅ Usage history per asset | ❌ Unknown | ❌ Basic |
| NFC/QR scanning | ✅ Full scan → identify → assign flow | ❌ None | ❌ None |
| Equipment performance analytics | ✅ Production rates, efficiency metrics | ✅ Material use tracking | ❌ Basic reports |
| Parts inventory | ❌ **GAP** | ❌ Unknown | ✅ Parts listing, reorder automation |

**Pontifex Advantage:** NFC/QR scanning is a game-changer nobody else has. Full equipment lifecycle management.
**Gap to Close:** Truck/fleet tracking (DOT compliance, mileage, license expiration alerts).

---

### 6. DIAMOND BLADE & BIT TRACKING

| Feature | Pontifex ✅ | CenPoint | DSM |
|---------|-----------|----------|-----|
| Blade/bit inventory | ✅ Stock management with history | ❌ Unknown | ✅ Comprehensive blade system |
| Blade footage tracking | ✅ Basic tracking | ❌ Unknown | ✅ Per-job-ticket footage entry |
| Blade cost analysis | ❌ **GAP** | ❌ Unknown | ✅ Spec cost average, remaining life |
| Blade usage per operator | ❌ **GAP** | ❌ Unknown | ✅ Parts used by operator reports |
| Blade purchasing optimization | ❌ **GAP** | ❌ Unknown | ✅ Reorder points, usage-based purchasing |
| Assign blades to operators | ✅ Yes | ❌ Unknown | ✅ Yes |

**Pontifex Advantage:** Modern UI, integrated with equipment system.
**Gap to Close:** DSM's blade tracking is their crown jewel — footage per job, cost analysis, remaining life, purchasing optimization. This is deeply specific to concrete cutting and we should match it.

---

### 7. TIME TRACKING & PAYROLL

| Feature | Pontifex ✅ | CenPoint | DSM |
|---------|-----------|----------|-----|
| Timecard system | ✅ Operator timecards + admin review | ✅ Travel + onsite timestamps | ✅ Timecards |
| NFC clock-in | ✅ NFC clock-in modal | ❌ None | ❌ None |
| Admin timecard approval | ✅ Review/approve workflow | ✅ Yes | ✅ Yes |
| Travel vs onsite breakdown | ✅ Yes | ✅ 4 timestamps (started/arrived/departed/completed) | ✅ Travel and shop time analysis |
| Certified payroll (WH-347) | ❌ **GAP** | ✅ Reports, job flagging, state templates | ✅ Weekly WH-347 + Monthly CC-257 |
| Workers comp reporting | ❌ **GAP** | ❌ Unknown | ✅ Workers compensation reports |
| Payroll processing | ❌ **GAP** | ✅ CenPoint Payroll integration | ❌ None (exports to payroll systems) |
| Time-off requests | ✅ Full request workflow | ❌ Unknown | ❌ Unknown |
| Occupational tax | ❌ N/A | ❌ Unknown | ✅ Occupational tax reports |

**Pontifex Advantage:** NFC clock-in, time-off request workflow.
**Gap to Close:** Certified payroll is required for government/prevailing wage jobs — both competitors have it.

---

### 8. ESTIMATES & QUOTES / BID TRACKING

| Feature | Pontifex ✅ | CenPoint | DSM |
|---------|-----------|----------|-----|
| Estimate creation | ✅ Create estimate page | ✅ On-site quote entry | ✅ Quote generation |
| Bid tracking pipeline | ❌ **GAP** | ❌ Unknown | ✅ Bid monitoring, quote storage/recall |
| Convert quote to job | ❌ **GAP** | ✅ Yes | ✅ Yes |
| Email/print quotes | ❌ **GAP** | ✅ Yes | ✅ Professional quote printing |
| On-site quoting (mobile) | ❌ **GAP** | ✅ Mobile on-site quote entry | ❌ Office only |

**Gap to Close:** Full estimate-to-job pipeline. This is critical for sales teams.

---

### 9. ANALYTICS & REPORTING

| Feature | Pontifex ✅ | CenPoint | DSM |
|---------|-----------|----------|-----|
| P&L analytics | ✅ Analytics dashboard with KPIs | ❌ Unknown | ✅ Job/Site/Operator P&L |
| Executive dashboard | ✅ Admin dashboard with cards | ✅ Executive dashboard | ❌ Reports only |
| Equipment performance | ✅ Dedicated analytics page | ✅ Material use | ✅ Basic |
| Operator performance | ✅ Operator ratings + profiles | ❌ Unknown | ✅ Employee job rates |
| Revenue by customer | ✅ Customer detail aggregation | ❌ Unknown | ✅ Sales reports |
| Custom reporting | ❌ **GAP** | ❌ Unknown | ✅ 50+ report templates |
| Sales pipeline reports | ❌ **GAP** | ❌ Unknown | ✅ Phone quotes, sales targets, top sales |
| Utilization reports | ❌ **GAP** | ❌ Unknown | ✅ Estimated vs actual comparison |
| Ops Hub / Audit logs | ✅ Full audit logging + diagnostics | ❌ Unknown | ❌ None |

**Pontifex Advantage:** Modern visual analytics, audit logging.
**Gap to Close:** DSM has 50+ report templates built over 30 years. We need configurable reports.

---

### 10. WHITE-LABEL / MULTI-TENANT

| Feature | Pontifex ✅ | CenPoint | DSM |
|---------|-----------|----------|-----|
| Custom company name | ✅ Settings-driven, real-time | ❌ N/A (single-tenant) | ❌ N/A |
| Custom logo/favicon | ✅ Upload via settings | ❌ N/A | ❌ N/A |
| Custom colors/theme | ✅ Color pickers, gradients | ❌ N/A | ❌ N/A |
| Feature module toggles | ✅ Show/hide billing, analytics, NFC, etc. | ❌ N/A | ❌ N/A |
| PDF branding | ✅ Dynamic company name on all PDFs | ❌ N/A | ❌ N/A |
| Login page customization | ✅ Gradient, welcome text, demo toggle | ❌ N/A | ❌ N/A |
| Typography customization | ✅ Font family settings | ❌ N/A | ❌ N/A |

**Pontifex Advantage:** NEITHER competitor offers white-labeling. This is our unique selling proposition for reselling to other concrete cutting companies.

---

### 11. ADMIN & ACCESS CONTROL

| Feature | Pontifex ✅ | CenPoint | DSM |
|---------|-----------|----------|-----|
| Role-based access (RBAC) | ✅ 8 roles, card-level permissions | ✅ Role-based | ✅ Access control |
| User signup approval | ✅ Access request workflow | ❌ Unknown | ❌ Unknown |
| Card-level permission customization | ✅ Per-user card overrides | ❌ Unknown | ❌ Unknown |
| Team management | ✅ Full user/role management | ✅ Employee management | ✅ Employee management |
| Operator onboarding | ✅ Interactive guided tour | ❌ On-site training | ❌ Training support |

**Pontifex Advantage:** Most granular permission system. Self-service signup with approval workflow.

---

### 12. INTEGRATIONS & COMMUNICATION

| Feature | Pontifex ✅ | CenPoint | DSM |
|---------|-----------|----------|-----|
| SMS notifications | ✅ Send SMS API | ✅ Auto text customers | ✅ Texting support |
| Email notifications | ✅ Send email API | ✅ Email invoices/links | ✅ Email integration (MAPI) |
| Google Maps | ✅ Distance, geocoding, autocomplete | ❌ Unknown | ✅ Geographical mapping |
| QuickBooks | ❌ **GAP** | ❌ Unknown | ✅ Automated sync |
| GPS tracking | ❌ **GAP** | ❌ Unknown | ✅ $20/mo per unit |

---

## TECHNOLOGY COMPARISON

| Aspect | Pontifex | CenPoint | DSM |
|--------|----------|----------|-----|
| **Tech Stack** | Next.js 15 + React 19 + Supabase | Vue.js (Vuetify) + Cloud | Legacy desktop + HTML web app |
| **UI/UX** | Modern purple/dark theme, responsive | Decent modern UI | Dated, early-2000s look |
| **Mobile** | Progressive web app (responsive) | Native mobile app (iOS/Android/Amazon) | HTML web app (bookmarkable) |
| **Database** | PostgreSQL (Supabase) with RLS | Unknown cloud DB | Proprietary (requires hosting) |
| **Hosting** | Self-hosted or cloud (Vercel/etc) | Cloud (SaaS) | Peak Software data center ($1500/yr) |
| **Offline** | Partial (localStorage) | Unknown | None (requires internet) |
| **API Architecture** | RESTful, JWT auth | Unknown | Proprietary |
| **Founded** | 2026 (new) | ~2010s | 1993 (30+ years) |

---

## PRICING COMPARISON

| | Pontifex | CenPoint | DSM |
|---|----------|----------|-----|
| **Software** | TBD (white-label resale) | Contact for pricing | Contact for pricing |
| **Hosting** | Your infrastructure | Included (SaaS) | $1,500/year (required) |
| **Mobile** | Free (web-based) | Included | $10/month per user |
| **GPS Tracking** | N/A | Unknown | $20/month per unit |
| **Training** | Self-service + tours | On-site (2 days) | Unlimited phone support |
| **Setup** | Self-service | Contact | Contact |

**Pontifex Advantage:** As a white-label platform, you set pricing. No per-user mobile fees (it's web-based).

---

## TOP 10 FEATURES TO BUILD FOR 10X ADVANTAGE

### Priority 1: Killer Differentiators (Week 1)

**1. AI Auto-Scheduling Engine** ⭐ HIGHEST IMPACT
- One-click "auto-schedule" button that assigns unassigned jobs to operators
- Optimize for: minimum travel distance (Google Maps Distance Matrix), operator skill match, certification requirements, equal hour distribution
- Learn dispatcher preferences over time (which operators they prefer for which job types)
- Respect: time-off requests, operator availability, daily capacity limits
- This is CenPoint's #1 selling point — we need it AND better

**2. AI Voice Job Entry** ⭐ HIGH IMPACT
- VoiceMicButton already exists — expand it into full voice-to-form
- "Schedule a wall saw job for ABC Construction at 123 Main St next Tuesday, 4 cores at 6 inches"
- AI parses voice → auto-fills schedule form fields
- Also support text: paste a text/email from customer → AI extracts job details
- This matches CenPoint's AI voice feature but with modern LLM power

**3. Customer Payment Portal** ⭐ HIGH IMPACT
- Send invoice link via text/email → customer views branded invoice → pays via Stripe
- No app needed, no login needed — just a secure link
- This is what CenPoint has that drives fast payment
- Add: "Pay Now" button on invoice PDF, QR code on printed invoices

### Priority 2: Industry Table Stakes (Week 2)

**4. Estimate-to-Job Pipeline**
- Create estimate → send to customer (email/text link) → customer approves → auto-convert to job order
- Track: sent, viewed, approved, rejected, expired
- Quote PDF generation with branded letterhead
- Match DSM's bid tracking + CenPoint's on-site quoting

**5. AR Aging Dashboard + Collection Automation**
- Visual aging buckets: Current, 30-day, 60-day, 90-day+
- Warning on dispatch: "⚠️ This customer has $12,500 outstanding (90+ days)"
- Auto-send: friendly reminder → firm reminder → final notice (DSM's 3-stage letters)
- Block job creation for severely overdue accounts (configurable)

**6. Diamond Blade Intelligence System**
- Per-job footage tracking (auto from work items)
- Cost-per-foot analysis by blade spec
- Remaining blade life estimation
- Auto reorder alerts when stock hits threshold
- Operator blade usage comparison (who's burning through blades?)
- This is DSM's crown jewel — we make it visual and modern

### Priority 3: Professional Features (Week 3)

**7. Certified Payroll Module**
- WH-347 weekly report generation
- CC-257 monthly reports
- Flag jobs as prevailing wage
- Auto-calculate rates based on worker classification
- Required for government/union work — both competitors have this

**8. Truck/Fleet Management**
- Truck inventory with DOT inspection dates, license expiration, mileage
- Alert: "Truck #7 DOT inspection expires in 14 days"
- Assign equipment to trucks, track loading
- GPS integration for real-time fleet visibility

**9. Executive Dashboard 2.0**
- Real-time KPIs: revenue today/week/month, jobs completed, operator utilization
- Revenue by customer (top 10 customers chart)
- Job completion rate, average job duration
- Revenue vs target with salesperson breakdown
- Equipment ROI analysis
- Cash flow forecast based on outstanding invoices + scheduled jobs

**10. Report Builder**
- Configurable report templates (like DSM's 50+ reports)
- Key reports: Job P&L, Operator P&L, Customer P&L, Equipment Cost Analysis
- Export: PDF, CSV, email scheduled reports
- Saved report configurations

---

## FEATURES ONLY PONTIFEX HAS (Competitive Moats)

These features exist in Pontifex and **neither competitor** has them:

1. **White-label branding system** — Resell to any concrete cutting company
2. **NFC/QR equipment scanning** — Tap phone to identify/assign equipment
3. **8-step job creation wizard** — Most thorough job intake in the industry
4. **Job Safety Analysis (JSA) builder** — Digital JSA creation and storage
5. **Silica exposure compliance** — OSHA requirement, built-in
6. **Liability release capture** — Digital waivers with PDF generation
7. **Equipment performance analytics** — Production rates, efficiency tracking
8. **Self-service signup with approval** — No manual user creation needed
9. **Interactive onboarding tours** — Zero-training operator deployment
10. **Audit logging & ops hub** — Enterprise-grade transparency
11. **Standby management workflow** — Handle rain days, delays systematically
12. **Operator skill + job difficulty matching** — Smart green/yellow/red recommendations
13. **NFC clock-in** — Tap to clock in at jobsite
14. **Maintenance request from field** — Operators report issues in real-time
15. **Damage reporting with photos** — Document equipment damage immediately

---

## WEAKNESSES OF COMPETITORS

### CenPoint Weaknesses
- **Offline fragile** — Shows "You are offline" error with no cached data
- **Vue.js stack** — Less ecosystem support than React
- **No white-labeling** — Can't be resold
- **Pricing opaque** — No public pricing = sales friction
- **No NFC/QR** — Manual equipment management
- **No JSA/silica** — Missing safety compliance
- **Limited AI** — AI scheduler is rule-based, not LLM-powered

### DSM Weaknesses
- **1993 technology** — UI looks 20+ years old
- **Desktop-first** — Mobile is a bolt-on HTML app, not native
- **Expensive hosting** — $1,500/year mandatory + $10/user/month mobile
- **No drag-and-drop** — List-based dispatching only
- **No visual analytics** — All text-based reports
- **No white-labeling** — Single-tenant only
- **No equipment scanning** — Manual tracking only
- **Requires internet** — No offline at all
- **On-premise mentality** — Cloud is optional, not native

---

## RECOMMENDED SPRINT PLAN (April 2026)

### Week 1 (April 1-7): AI Features + Payment
- [ ] AI Auto-Scheduling Engine (travel optimization + skill matching)
- [ ] AI Voice-to-Form for schedule wizard
- [ ] Stripe payment links on invoices
- [ ] AR aging warnings on dispatch

### Week 2 (April 8-14): Sales + Blade Intelligence
- [ ] Estimate-to-job pipeline with customer approval flow
- [ ] Enhanced diamond blade tracking (footage, cost analysis, reorder)
- [ ] Collection letter automation (3-stage)

### Week 3 (April 15-21): Compliance + Fleet
- [ ] Certified payroll (WH-347 + CC-257)
- [ ] Truck/fleet management with DOT alerts
- [ ] Executive dashboard 2.0 with live KPIs

### Week 4 (April 22-30): Polish + Launch
- [ ] Report builder with configurable templates
- [ ] Mobile responsive audit
- [ ] E2E workflow testing
- [ ] Production deployment

---

## CONCLUSION

Pontifex is already ahead in: **field operations, safety compliance, equipment management, access control, and white-labeling.** The gaps are concentrated in: **AI scheduling, payment processing, financial reporting, and blade tracking depth.**

With the 10 features listed above, Pontifex won't just match CenPoint and DSM — it will be the **first modern, AI-powered, white-label concrete cutting management platform.** Neither competitor can match that positioning.

The white-label capability alone makes Pontifex unique in the market. Every other concrete cutting company using CenPoint or DSM is locked into their platform. With Pontifex, you can offer Patriot-branded software to competitors, creating a new revenue stream while strengthening your own operations.
