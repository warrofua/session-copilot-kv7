import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import Stripe from 'stripe';
import { findOrganizationById, updateOrganization, logAuditEvent, getContainer, CONTAINERS } from '../services/cosmosDb.js';
import type { Organization } from '../services/cosmosDb.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

const PLAN_LIMITS: Record<string, number> = {
    starter: 10,
    growth: 50,
    scale: 200,
    enterprise: Infinity,
    trial: 50
};

function getStripe(): Stripe {
    if (!STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY not configured');
    }
    return new Stripe(STRIPE_SECRET_KEY);
}

/**
 * Find organization by Stripe customer ID
 */
async function findOrgByStripeCustomerId(customerId: string): Promise<Organization | null> {
    const container = getContainer(CONTAINERS.ORGANIZATIONS);
    const { resources } = await container.items
        .query({
            query: 'SELECT * FROM c WHERE c.subscription.stripeCustomerId = @customerId',
            parameters: [{ name: '@customerId', value: customerId }]
        })
        .fetchAll();
    return resources[0] || null;
}

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events for subscription lifecycle
 */
async function webhookHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Stripe webhook received');

    try {
        const stripe = getStripe();
        const sig = request.headers.get('stripe-signature');

        if (!sig) {
            context.warn('Missing Stripe signature');
            return { status: 400, jsonBody: { error: 'Missing signature' } };
        }

        const rawBody = await request.text();

        let event: Stripe.Event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
        } catch (err) {
            context.error('Webhook signature verification failed:', err);
            return { status: 400, jsonBody: { error: 'Invalid signature' } };
        }

        context.log(`Processing event: ${event.type}`);

        switch (event.type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionChange(subscription, context);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionCanceled(subscription, context);
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object as Stripe.Invoice;
                await handlePaymentSucceeded(invoice, context);
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                await handlePaymentFailed(invoice, context);
                break;
            }

            default:
                context.log(`Unhandled event type: ${event.type}`);
        }

        return { status: 200, jsonBody: { received: true } };
    } catch (error) {
        context.error('Webhook error:', error);
        return { status: 500, jsonBody: { error: 'Webhook handler failed' } };
    }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription, context: InvocationContext): Promise<void> {
    const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;

    const org = await findOrgByStripeCustomerId(customerId);
    if (!org) {
        context.warn(`No organization found for customer: ${customerId}`);
        return;
    }

    // Extract plan from subscription metadata or price lookup
    const planMeta = subscription.metadata?.plan as Organization['subscription']['plan'] || 'growth';
    const plan = planMeta || 'growth';

    const status = mapStripeStatus(subscription.status);
    // Stripe v17 types use camelCase but webhook payload uses snake_case - use type assertion
    const subAny = subscription as unknown as { current_period_start: number; current_period_end: number };
    const currentPeriodStart = new Date(subAny.current_period_start * 1000).toISOString();
    const currentPeriodEnd = new Date(subAny.current_period_end * 1000).toISOString();

    // Determine billing period from price interval
    const priceItem = subscription.items.data[0];
    const interval = priceItem?.price?.recurring?.interval;
    const billingPeriod: 'monthly' | 'annual' | null =
        interval === 'year' ? 'annual' :
            interval === 'month' ? 'monthly' : null;

    await updateOrganization(org.id, {
        subscription: {
            ...org.subscription,
            stripeSubscriptionId: subscription.id,
            plan,
            status,
            billingPeriod,
            currentPeriodStart,
            currentPeriodEnd,
            trialEndsAt: subscription.trial_end
                ? new Date(subscription.trial_end * 1000).toISOString()
                : null,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            canceledAt: subscription.canceled_at
                ? new Date(subscription.canceled_at * 1000).toISOString()
                : null,
            maxActiveLearners: PLAN_LIMITS[plan] || 50
        }
    });

    await logAuditEvent({
        userId: 'stripe_webhook',
        userEmail: 'system@stripe.com',
        action: 'subscription_updated',
        entityType: 'organization',
        entityId: org.id,
        orgId: org.id,
        ipAddress: 'stripe_webhook',
        userAgent: 'Stripe Webhook',
        success: true,
        details: {
            subscriptionId: subscription.id,
            plan,
            status,
            currentPeriodEnd
        }
    });

    context.log(`Updated subscription for org ${org.id}: ${plan} (${status})`);
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription, context: InvocationContext): Promise<void> {
    const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;

    const org = await findOrgByStripeCustomerId(customerId);
    if (!org) {
        context.warn(`No organization found for customer: ${customerId}`);
        return;
    }

    await updateOrganization(org.id, {
        subscription: {
            ...org.subscription,
            status: 'canceled',
            canceledAt: new Date().toISOString()
        }
    });

    await logAuditEvent({
        userId: 'stripe_webhook',
        userEmail: 'system@stripe.com',
        action: 'subscription_canceled',
        entityType: 'organization',
        entityId: org.id,
        orgId: org.id,
        ipAddress: 'stripe_webhook',
        userAgent: 'Stripe Webhook',
        success: true,
        details: { subscriptionId: subscription.id }
    });

    context.log(`Subscription canceled for org ${org.id}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice, context: InvocationContext): Promise<void> {
    const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    if (!customerId) return;

    const org = await findOrgByStripeCustomerId(customerId);
    if (!org) {
        context.warn(`No organization found for customer: ${customerId}`);
        return;
    }

    await updateOrganization(org.id, {
        billing: {
            ...org.billing,
            lastPaymentDate: new Date().toISOString(),
            lastPaymentAmount: invoice.amount_paid / 100, // Convert from cents
            nextBillingDate: invoice.lines.data[0]?.period?.end
                ? new Date(invoice.lines.data[0].period.end * 1000).toISOString()
                : null
        }
    });

    await logAuditEvent({
        userId: 'stripe_webhook',
        userEmail: 'system@stripe.com',
        action: 'payment_succeeded',
        entityType: 'organization',
        entityId: org.id,
        orgId: org.id,
        ipAddress: 'stripe_webhook',
        userAgent: 'Stripe Webhook',
        success: true,
        details: {
            invoiceId: invoice.id,
            amount: invoice.amount_paid / 100,
            currency: invoice.currency
        }
    });

    context.log(`Payment succeeded for org ${org.id}: $${invoice.amount_paid / 100}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice, context: InvocationContext): Promise<void> {
    const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    if (!customerId) return;

    const org = await findOrgByStripeCustomerId(customerId);
    if (!org) {
        context.warn(`No organization found for customer: ${customerId}`);
        return;
    }

    // Mark subscription as past_due
    await updateOrganization(org.id, {
        subscription: {
            ...org.subscription,
            status: 'past_due'
        }
    });

    await logAuditEvent({
        userId: 'stripe_webhook',
        userEmail: 'system@stripe.com',
        action: 'payment_failed',
        entityType: 'organization',
        entityId: org.id,
        orgId: org.id,
        ipAddress: 'stripe_webhook',
        userAgent: 'Stripe Webhook',
        success: false,
        failureReason: 'Payment failed',
        details: {
            invoiceId: invoice.id,
            amount: invoice.amount_due / 100
        }
    });

    context.log(`Payment failed for org ${org.id}`);
}

function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): Organization['subscription']['status'] {
    switch (stripeStatus) {
        case 'active':
            return 'active';
        case 'trialing':
            return 'trialing';
        case 'past_due':
            return 'past_due';
        case 'canceled':
        case 'unpaid':
        case 'incomplete_expired':
            return 'canceled';
        case 'paused':
            return 'paused';
        default:
            return 'active';
    }
}

// Register webhook endpoint
app.http('stripeWebhook', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'stripe/webhook',
    handler: webhookHandler
});
