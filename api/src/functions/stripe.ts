import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import Stripe from 'stripe';
import { findOrganizationById, updateOrganization, countActiveLearnersByOrg } from '../services/cosmosDb.js';
import { verifyToken, parseCookies } from '../utils/auth.js';

const COOKIE_NAME = 'session_token';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://agentsofaba.com';

// Stripe price IDs (configure in Stripe Dashboard)
const PRICE_IDS = {
    starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || 'price_starter_monthly',
    starter_annual: process.env.STRIPE_PRICE_STARTER_ANNUAL || 'price_starter_annual',
    growth_monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY || 'price_growth_monthly',
    growth_annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL || 'price_growth_annual',
    scale_monthly: process.env.STRIPE_PRICE_SCALE_MONTHLY || 'price_scale_monthly',
    scale_annual: process.env.STRIPE_PRICE_SCALE_ANNUAL || 'price_scale_annual',
};

const PLAN_LIMITS: Record<string, number> = {
    starter: 10,
    growth: 50,
    scale: 200,
    enterprise: Infinity,
    trial: 50 // Same as growth during trial
};

function getStripe(): Stripe {
    if (!STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY not configured');
    }
    return new Stripe(STRIPE_SECRET_KEY);
}

interface CheckoutRequest {
    plan: 'starter' | 'growth' | 'scale';
    period: 'monthly' | 'annual';
}

/**
 * POST /api/stripe/create-checkout-session
 * Creates a Stripe Checkout session for subscription
 */
async function createCheckoutSessionHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Creating Stripe checkout session');

    try {
        // Verify auth
        const cookies = parseCookies(request.headers.get('cookie') || '');
        const token = cookies[COOKIE_NAME];
        if (!token) {
            return { status: 401, jsonBody: { error: 'Authentication required' } };
        }

        const decoded = verifyToken(token);
        if (!decoded || !decoded.orgId) {
            return { status: 401, jsonBody: { error: 'Invalid token or no organization' } };
        }

        const org = await findOrganizationById(decoded.orgId);
        if (!org) {
            return { status: 404, jsonBody: { error: 'Organization not found' } };
        }

        const body = await request.json() as CheckoutRequest;
        const { plan, period } = body;

        if (!plan || !period) {
            return { status: 400, jsonBody: { error: 'Plan and period are required' } };
        }

        const priceKey = `${plan}_${period}` as keyof typeof PRICE_IDS;
        const priceId = PRICE_IDS[priceKey];

        if (!priceId) {
            return { status: 400, jsonBody: { error: 'Invalid plan or period' } };
        }

        const stripe = getStripe();

        // Create or retrieve Stripe customer
        let customerId = org.subscription.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: org.billing.billingEmail,
                name: org.billing.billingName,
                metadata: {
                    orgId: org.id,
                    orgName: org.name
                }
            });
            customerId = customer.id;

            // Save customer ID to org
            await updateOrganization(org.id, {
                subscription: {
                    ...org.subscription,
                    stripeCustomerId: customerId
                }
            });
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1
                }
            ],
            success_url: `${FRONTEND_URL}/admin/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${FRONTEND_URL}/admin/billing?canceled=true`,
            metadata: {
                orgId: org.id,
                plan,
                period
            },
            subscription_data: {
                metadata: {
                    orgId: org.id,
                    plan
                }
            }
        });

        return {
            status: 200,
            jsonBody: {
                sessionId: session.id,
                url: session.url
            }
        };
    } catch (error) {
        context.error('Checkout session error:', error);
        return {
            status: 500,
            jsonBody: { error: 'Failed to create checkout session' }
        };
    }
}

/**
 * POST /api/stripe/create-portal-session
 * Creates a Stripe Customer Portal session for managing billing
 */
async function createPortalSessionHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Creating Stripe portal session');

    try {
        // Verify auth
        const cookies = parseCookies(request.headers.get('cookie') || '');
        const token = cookies[COOKIE_NAME];
        if (!token) {
            return { status: 401, jsonBody: { error: 'Authentication required' } };
        }

        const decoded = verifyToken(token);
        if (!decoded || !decoded.orgId) {
            return { status: 401, jsonBody: { error: 'Invalid token or no organization' } };
        }

        const org = await findOrganizationById(decoded.orgId);
        if (!org) {
            return { status: 404, jsonBody: { error: 'Organization not found' } };
        }

        if (!org.subscription.stripeCustomerId) {
            return { status: 400, jsonBody: { error: 'No billing account found. Please subscribe first.' } };
        }

        const stripe = getStripe();

        const session = await stripe.billingPortal.sessions.create({
            customer: org.subscription.stripeCustomerId,
            return_url: `${FRONTEND_URL}/admin/billing`
        });

        return {
            status: 200,
            jsonBody: { url: session.url }
        };
    } catch (error) {
        context.error('Portal session error:', error);
        return {
            status: 500,
            jsonBody: { error: 'Failed to create portal session' }
        };
    }
}

/**
 * GET /api/stripe/subscription
 * Returns current subscription status for the organization
 */
async function getSubscriptionHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('Getting subscription status');

    try {
        // Verify auth
        const cookies = parseCookies(request.headers.get('cookie') || '');
        const token = cookies[COOKIE_NAME];
        if (!token) {
            return { status: 401, jsonBody: { error: 'Authentication required' } };
        }

        const decoded = verifyToken(token);
        if (!decoded || !decoded.orgId) {
            return { status: 401, jsonBody: { error: 'Invalid token or no organization' } };
        }

        const org = await findOrganizationById(decoded.orgId);
        if (!org) {
            return { status: 404, jsonBody: { error: 'Organization not found' } };
        }

        // Get current active learner count
        const activeLearnerCount = await countActiveLearnersByOrg(org.id);

        // Calculate days remaining in trial
        let trialDaysRemaining: number | null = null;
        if (org.subscription.status === 'trialing' && org.subscription.trialEndsAt) {
            const trialEnd = new Date(org.subscription.trialEndsAt);
            const now = new Date();
            trialDaysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        }

        return {
            status: 200,
            jsonBody: {
                subscription: {
                    plan: org.subscription.plan,
                    status: org.subscription.status,
                    billingPeriod: org.subscription.billingPeriod,
                    currentPeriodEnd: org.subscription.currentPeriodEnd,
                    trialEndsAt: org.subscription.trialEndsAt,
                    trialDaysRemaining,
                    cancelAtPeriodEnd: org.subscription.cancelAtPeriodEnd,
                    activeLearnerCount,
                    maxActiveLearners: org.subscription.maxActiveLearners,
                    usagePercent: Math.round((activeLearnerCount / org.subscription.maxActiveLearners) * 100)
                },
                billing: {
                    billingEmail: org.billing.billingEmail,
                    nextBillingDate: org.billing.nextBillingDate
                },
                planLimits: PLAN_LIMITS
            }
        };
    } catch (error) {
        context.error('Get subscription error:', error);
        return {
            status: 500,
            jsonBody: { error: 'Failed to get subscription status' }
        };
    }
}

// Register endpoints
app.http('stripeCheckout', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'stripe/create-checkout-session',
    handler: createCheckoutSessionHandler
});

app.http('stripePortal', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'stripe/create-portal-session',
    handler: createPortalSessionHandler
});

app.http('stripeSubscription', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'stripe/subscription',
    handler: getSubscriptionHandler
});
