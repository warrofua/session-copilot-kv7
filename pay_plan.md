# Session Co-Pilot Payment Plan

## Pricing Model Philosophy

**Core Anchor: Active Learners**

Session Co-Pilot is priced based on the number of **active learners** in your organization, not the number of staff members. This approach provides:

- **Predictable Costs**: Learner count is more stable than staff turnover
- **Value Alignment**: More learners = more sessions = more documentation = more value
- **No Staffing Penalties**: Hire as many therapists as needed without increasing your bill
- **Scalable Growth**: Pricing grows proportionally with your client base

## Pricing Tiers

### Starter
- **Up to 10 active learners**
- **$99/month** (or $990/year, save 17%)
- Unlimited staff seats (Manager, BCBA, RBT)
- Unlimited parent accounts
- All features included
- Email support
- 14-day free trial

### Growth
- **11-50 active learners**
- **$299/month** (or $2,990/year, save 17%)
- Unlimited staff seats
- Unlimited parent accounts
- All features included
- Priority email support
- Phone support
- 14-day free trial

### Scale
- **51-200 active learners**
- **$799/month** (or $7,990/year, save 17%)
- Unlimited staff seats
- Unlimited parent accounts
- All features included
- Priority support (phone + email)
- Dedicated onboarding session
- Quarterly business reviews
- 14-day free trial

### Enterprise
- **200+ active learners**
- **Custom pricing**
- Unlimited staff seats
- Unlimited parent accounts
- All features included
- Dedicated account manager
- Custom integration support
- SLA guarantees
- Advanced security options (SSO, audit logs)
- Custom onboarding and training

## What Counts as an "Active Learner"?

An **active learner** is a client record with `status: 'active'` in the system.

**Included in count:**
- Learners with `status: 'active'`
- Even if they have no sessions this month (e.g., vacation, illness)

**NOT included in count:**
- Learners with `status: 'inactive'`
- Learners with `status: 'discharged'`
- Deleted learner records

**Grace Period:**
When a learner is marked as discharged or inactive, they remain accessible (read-only) for 90 days before being excluded from billing counts. This allows time for final documentation and reporting.

## Account Types (All Unlimited)

### Staff Accounts (Unlimited)
- **Manager**: Full admin access, billing control, user management
- **BCBA**: Supervisor level, can view all org learners, approve notes
- **RBT**: Therapist level, can only access assigned learners

### Parent Accounts (Unlimited, Always Free)
- Parents/guardians are **not customers, they are your clients' families**
- Always free, no matter your tier
- Can only view data for their own child
- Read-only access to session summaries and progress

## Feature Comparison

All tiers include:
- Offline-first session logging
- Natural language input with AI parsing
- Behavior tracking (frequency, duration, ABC data)
- Skill trial logging with prompt levels
- Incident reporting ("Oh Crap" button)
- Session note generation
- Cloud sync across devices
- Role-based access control
- Mobile-friendly PWA
- Data export (CSV, PDF)

**Enterprise-only additions:**
- Single Sign-On (SSO)
- Advanced audit logs
- Custom data retention policies
- API access for integrations
- Dedicated account manager
- Service Level Agreement (SLA)

## Billing Implementation

### Data Model

```typescript
interface Organization {
  // ... existing fields
  subscription: {
    // Stripe integration
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;

    // Plan details
    plan: 'starter' | 'growth' | 'scale' | 'enterprise' | 'trial' | null;
    status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused';
    billingPeriod: 'monthly' | 'annual';

    // Dates
    currentPeriodStart: string; // ISO date
    currentPeriodEnd: string;   // ISO date
    trialEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: string | null;

    // Usage tracking
    activeLearnerCount: number;      // Current count
    maxActiveLearners: number;       // Plan limit
    lastCountedAt: string;           // Last time we counted
  };

  billing: {
    // Contact info
    billingEmail: string;
    billingName: string;

    // Payment
    lastPaymentDate: string | null;
    lastPaymentAmount: number | null;
    nextBillingDate: string | null;

    // Usage alerts
    alertSentAt90Percent: string | null;  // Alert when nearing limit
  };
}

interface Learner {
  // ... existing fields
  status: 'active' | 'inactive' | 'discharged';
  statusChangedAt: string;  // Track when status changed
  dischargedAt: string | null;
  dischargeReason: string | null;
}
```

### Automatic Learner Counting

**Nightly Job** (Azure Function with timer trigger):
```typescript
// Runs daily at 3 AM UTC
// api/src/functions/jobs/countActiveLearners.ts

async function countActiveLearners(orgId: string) {
  const count = await db.learners
    .where('orgId').equals(orgId)
    .and('status').equals('active')
    .count();

  await updateOrganization(orgId, {
    'subscription.activeLearnerCount': count,
    'subscription.lastCountedAt': new Date().toISOString()
  });

  // Check if approaching limit
  const org = await getOrganization(orgId);
  const usage = count / org.subscription.maxActiveLearners;

  if (usage >= 0.9 && !org.billing.alertSentAt90Percent) {
    await sendNearLimitEmail(org, count);
  }

  // Check if over limit
  if (count > org.subscription.maxActiveLearners) {
    await handleOverageScenario(org, count);
  }
}
```

### Tier Migration Logic

**Automatic Upgrades:**
When active learner count exceeds current tier:
1. Send email notification to billing contact
2. Provide 7-day grace period
3. After grace period, auto-upgrade to next tier
4. Prorate the charge for current period

**Downgrades:**
When active learner count drops below current tier:
1. Allow downgrade at next billing cycle (not immediate)
2. Manager can request downgrade via billing portal
3. Takes effect at period end to avoid mid-cycle refunds

### Trial Period

**14-Day Free Trial:**
- Starts automatically on organization creation
- Full access to all features (treated as "Growth" tier during trial)
- No credit card required to start trial
- 7 days before trial ends: Email reminder with subscription prompt
- 1 day before trial ends: Final email reminder
- On trial expiration: Grace period of 3 days (read-only access)
- After grace period: Block new session creation, show "Subscribe to Continue"

### Payment Failure Handling

**Invoice Payment Failed:**
1. **Day 0**: Payment fails, Stripe retries automatically
2. **Day 3**: First retry fails, send email to billing contact
3. **Day 7**: Second retry fails, send urgent email
4. **Day 10**: Final retry fails, change status to `past_due`, block new sessions
5. **Day 14**: If still unpaid, suspend account (read-only mode)
6. **Day 30**: If still unpaid, mark as `canceled`, data retained for 90 days

**Read-Only Mode:**
- Users can view all historical data
- Cannot create new sessions
- Cannot edit existing data
- Banner: "Subscription payment failed. Update payment method to continue."

## Access Control Implementation

### Middleware Check

```typescript
// api/src/middleware/checkSubscription.ts

export function requireActiveSubscription(req, res, next) {
  const { user } = req;
  const org = await getOrganization(user.orgId);

  const validStatuses = ['active', 'trialing'];

  if (!validStatuses.includes(org.subscription.status)) {
    return res.status(402).json({
      error: 'Subscription required',
      status: org.subscription.status,
      message: getSubscriptionMessage(org)
    });
  }

  next();
}
```

### Frontend Guard

```typescript
// src/components/SubscriptionGuard.tsx

export function SubscriptionGuard({ children }) {
  const { organization } = useAuth();

  if (!organization?.subscription) {
    return <LoadingSpinner />;
  }

  const { status, plan } = organization.subscription;

  if (status === 'past_due') {
    return <PaymentFailedBanner />;
  }

  if (status === 'canceled' || status === 'paused') {
    return <SubscriptionRequiredPage />;
  }

  if (status === 'trialing') {
    return (
      <>
        <TrialCountdownBanner />
        {children}
      </>
    );
  }

  // status === 'active'
  return children;
}
```

## Stripe Product Configuration

### Products (One per tier)

```
Product: Session Co-Pilot - Starter
├── Price: $99/month (price_starter_monthly)
└── Price: $990/year (price_starter_annual)

Product: Session Co-Pilot - Growth
├── Price: $299/month (price_growth_monthly)
└── Price: $990/year (price_growth_annual)

Product: Session Co-Pilot - Scale
├── Price: $799/month (price_scale_monthly)
└── Price: $7990/year (price_scale_annual)

Product: Session Co-Pilot - Enterprise
└── Custom invoicing (managed manually)
```

### Metadata on Stripe Products

```json
{
  "tier": "growth",
  "maxLearners": 50,
  "minLearners": 11,
  "features": "unlimited_staff,unlimited_parents,priority_support"
}
```

## User Flows

### New Organization Sign-Up
1. Manager creates account → Enters org name, email, password
2. Organization created with `status: 'trialing'`, `trialEndsAt: +14 days`
3. Redirect to dashboard with "Trial Active" banner
4. Can add staff, add learners, create sessions (full access)
5. Banner shows: "14 days left in trial. Subscribe anytime."

### Subscribe During Trial
1. Manager clicks "Subscribe Now" button
2. Select plan (Starter/Growth/Scale) and billing period (monthly/annual)
3. Redirect to Stripe Checkout (hosted page)
4. Enter payment info
5. Stripe processes payment and redirects back
6. Webhook updates org: `status: 'active'`, `plan: 'growth'`
7. Confirmation email sent
8. Trial banner removed, replaced with "Active Subscription" badge

### Add Learner (Approaching Limit)
1. Manager adds 9th learner (limit is 10 for Starter)
2. System shows warning: "You have 1 learner slot remaining. Upgrade to Growth for up to 50 learners."
3. Provide "Upgrade Now" button inline

### Add Learner (Over Limit)
1. Manager tries to add 11th learner (over Starter limit)
2. System blocks: "You've reached your plan limit (10 active learners). Upgrade to continue."
3. Show upgrade modal with next tier pricing
4. One-click upgrade flow

### Manage Billing
1. Manager goes to Settings → Billing
2. Shows current plan, active learner count, next billing date
3. "Manage Billing" button → Stripe Customer Portal
4. Can update payment method, view invoices, cancel subscription

### Cancel Subscription
1. Manager clicks "Cancel Subscription" in Stripe portal
2. Confirmation modal: "Your subscription will remain active until [date]"
3. Stripe sets `cancel_at_period_end: true`
4. Webhook updates org record
5. Email confirmation sent
6. On period end date: Subscription ends, account goes to read-only mode

### Reactivate After Cancellation
1. Canceled org tries to create new session
2. Blocked with message: "Your subscription ended on [date]. Reactivate to continue."
3. "Reactivate Subscription" button
4. Redirect to Stripe Checkout with previous plan pre-selected
5. After payment, full access restored

## Email Notifications

**Automated Emails:**
1. **Trial Started**: Welcome email with trial end date
2. **Trial 7 Days Left**: Reminder to subscribe
3. **Trial 1 Day Left**: Urgent reminder
4. **Trial Ended**: "Your trial has ended. Subscribe to continue."
5. **Subscription Activated**: Confirmation with receipt
6. **Approaching Learner Limit**: "You're using 9 of 10 learner slots"
7. **Payment Failed**: "We couldn't process your payment"
8. **Subscription Canceled**: Confirmation with data access details
9. **Monthly Receipt**: Sent after each successful payment

## FAQ & Edge Cases

### What if my learner count fluctuates?
Your plan is based on the **peak** active learner count for the billing period. If you temporarily have 12 learners (over Starter limit), we'll notify you and provide a grace period to either upgrade or reduce active learners.

### What happens to parent accounts if we cancel?
Parent accounts retain access to their child's historical data for 90 days after cancellation. After 90 days, all data is archived but not deleted (HIPAA compliance).

### Can we switch from monthly to annual?
Yes, via the Stripe Customer Portal. The switch takes effect at your next billing date.

### What if we're enterprise and need custom terms?
Contact us directly. Enterprise plans can include custom contracts, payment terms (net-30), purchase orders, and custom SLAs.

### Do discharged learners count toward our limit?
No. Once a learner is marked as `discharged`, they stop counting toward your active learner limit immediately. However, their data remains accessible for 90 days for compliance purposes.

## Implementation Checklist

- [ ] Update Organization schema in Cosmos DB
- [ ] Update Learner schema with status tracking
- [ ] Create Stripe products and prices
- [ ] Build Azure Functions for billing endpoints
- [ ] Implement webhook handler with signature verification
- [ ] Build nightly job to count active learners
- [ ] Create frontend billing page
- [ ] Implement SubscriptionGuard component
- [ ] Build trial countdown UI
- [ ] Set up email notification service
- [ ] Create subscription middleware for API routes
- [ ] Add overage detection and alerts
- [ ] Build admin panel to view all org subscriptions
- [ ] Test all payment flows in Stripe test mode
- [ ] Document customer support procedures
- [ ] Set up monitoring for webhook failures

## Metrics to Track

**Business Metrics:**
- Monthly Recurring Revenue (MRR)
- Annual Recurring Revenue (ARR)
- Customer Lifetime Value (LTV)
- Churn rate
- Average learners per organization
- Trial-to-paid conversion rate

**Product Metrics:**
- Active organizations by tier
- Average active learner count by tier
- Tier migration frequency (upgrades vs downgrades)
- Payment failure rate
- Cancellation reasons (exit survey)

## Compliance Notes

**HIPAA Considerations:**
- Payment data (credit cards) never touches our servers (Stripe handles it)
- No PHI sent to Stripe (only org name, billing email)
- Canceled accounts retain data for 90 days minimum (documentation access)
- Data deletion requests honored within 30 days of cancellation

**Tax Handling:**
- Stripe Tax automatically calculates sales tax, VAT, GST based on customer location
- Enable Stripe Tax in dashboard
- Set tax behavior to "inclusive" or "exclusive" based on region

## Future Enhancements

**Phase 2 Features:**
- Usage-based add-ons (e.g., +$5 for advanced reporting)
- White-label option for large enterprises
- Referral program (give 1 month free, get 1 month free)
- Non-profit discount (20% off)
- Multi-organization accounts (for franchises)
- API access tier for EHR integrations

**Phase 3 Features:**
- Marketplace for templates and resources
- Premium training modules (a la carte pricing)
- Custom branding per organization
