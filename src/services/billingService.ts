/**
 * Billing Service - Frontend API calls for Stripe integration
 */

const API_BASE = '/api';

export interface SubscriptionStatus {
    plan: 'starter' | 'growth' | 'scale' | 'enterprise' | 'trial' | null;
    status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused';
    billingPeriod: 'monthly' | 'annual' | null;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    trialDaysRemaining: number | null;
    cancelAtPeriodEnd: boolean;
    activeLearnerCount: number;
    maxActiveLearners: number;
    usagePercent: number;
}

export interface BillingInfo {
    billingEmail: string;
    nextBillingDate: string | null;
}

export interface SubscriptionResponse {
    subscription: SubscriptionStatus;
    billing: BillingInfo;
    planLimits: Record<string, number>;
    planOverageRates: Record<string, number>;
}

export interface CheckoutResponse {
    sessionId: string;
    url: string;
}

export interface PortalResponse {
    url: string;
}

/**
 * Get current subscription status
 */
export async function getSubscriptionStatus(): Promise<SubscriptionResponse> {
    const response = await fetch(`${API_BASE}/stripe/subscription`, {
        method: 'GET',
        credentials: 'include'
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get subscription status');
    }

    return response.json();
}

/**
 * Create a Stripe Checkout session for subscription
 */
export async function createCheckoutSession(
    plan: 'starter' | 'growth' | 'scale',
    period: 'monthly' | 'annual'
): Promise<CheckoutResponse> {
    const response = await fetch(`${API_BASE}/stripe/create-checkout-session`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, period })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create checkout session');
    }

    return response.json();
}

/**
 * Create a Stripe Customer Portal session for managing billing
 */
export async function createPortalSession(): Promise<PortalResponse> {
    const response = await fetch(`${API_BASE}/stripe/create-portal-session`, {
        method: 'POST',
        credentials: 'include'
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create portal session');
    }

    return response.json();
}

/**
 * Redirect to Stripe Checkout for subscription
 */
export async function redirectToCheckout(
    plan: 'starter' | 'growth' | 'scale',
    period: 'monthly' | 'annual'
): Promise<void> {
    const { url } = await createCheckoutSession(plan, period);
    window.location.href = url;
}

/**
 * Redirect to Stripe Customer Portal
 */
export async function redirectToPortal(): Promise<void> {
    const { url } = await createPortalSession();
    window.location.href = url;
}
