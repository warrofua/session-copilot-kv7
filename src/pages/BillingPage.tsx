import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    getSubscriptionStatus,
    redirectToCheckout,
    redirectToPortal,
    type SubscriptionResponse
} from '../services/billingService';
import './AdminPages.css';
import './BillingPage.css';

const PLANS = [
    {
        id: 'starter',
        name: 'Starter',
        description: 'For small practices',
        learnerLimit: 10,
        overagePerLearner: 15,
        features: ['10 active learners included', '$15 per additional learner', 'Unlimited staff seats', 'Email support'],
        monthlyPrice: 99,
    },
    {
        id: 'growth',
        name: 'Growth',
        description: 'For growing practices',
        learnerLimit: 50,
        overagePerLearner: 10,
        features: ['50 active learners included', '$10 per additional learner', 'Unlimited staff seats', 'Priority email & phone support'],
        monthlyPrice: 399,
        popular: true
    },
    {
        id: 'scale',
        name: 'Scale',
        description: 'For large organizations',
        learnerLimit: 150,
        overagePerLearner: 8,
        features: ['150 active learners included', '$8 per additional learner', 'Dedicated onboarding', 'Priority support'],
        monthlyPrice: 1299,
    }
];

export default function BillingPage() {
    const { user, isLoading: isAuthLoading } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        if (isAuthLoading) return;
        if (!user || user.role !== 'manager') {
            navigate('/app');
            return;
        }
        loadSubscription();

        // Check for success/canceled from Stripe
        if (searchParams.get('success') === 'true') {
            setSuccessMessage('Your subscription has been activated! Thank you.');
        }
    }, [user, isAuthLoading, navigate, searchParams]);

    async function loadSubscription() {
        try {
            setIsLoading(true);
            const data = await getSubscriptionStatus();
            setSubscription(data);
        } catch (err) {
            setError('Failed to load subscription status');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }

    async function handleUpgrade(plan: 'starter' | 'growth' | 'scale') {
        try {
            setIsProcessing(true);
            setError('');
            await redirectToCheckout(plan, 'monthly');
        } catch (err) {
            setError('Failed to start checkout. Please try again.');
            console.error(err);
            setIsProcessing(false);
        }
    }

    async function handleManageBilling() {
        try {
            setIsProcessing(true);
            setError('');
            await redirectToPortal();
        } catch (err) {
            setError('Failed to open billing portal. Please try again.');
            console.error(err);
            setIsProcessing(false);
        }
    }

    if (isAuthLoading || isLoading) {
        return <div className="admin-loading">Loading billing...</div>;
    }

    const sub = subscription?.subscription;
    const isTrialing = sub?.status === 'trialing';
    const isPastDue = sub?.status === 'past_due';
    const isCanceled = sub?.status === 'canceled';
    const hasActiveSubscription = sub?.status === 'active' && sub?.plan && sub.plan !== 'trial';

    return (
        <div className="admin-page billing-page">
            <div className="admin-page-shell">
                <div className="admin-page-header">
                    <div>
                        <button onClick={() => navigate('/app')} className="admin-back-btn">
                            ← Back to Session
                        </button>
                        <h1 className="admin-page-title">Billing & Subscription</h1>
                        <p className="admin-page-subtitle">
                            Manage your subscription plan and billing details.
                        </p>
                    </div>
                    {hasActiveSubscription && (
                        <button
                            onClick={handleManageBilling}
                            disabled={isProcessing}
                            className="admin-secondary-btn"
                        >
                            {isProcessing ? 'Loading...' : 'Manage Billing'}
                        </button>
                    )}
                </div>

                <div className="admin-content">
                    {error && <div className="admin-error">{error}</div>}
                    {successMessage && (
                        <div className="billing-success">
                            ✓ {successMessage}
                        </div>
                    )}

                    {/* Current Status Card */}
                    <div className="billing-status-card">
                        <div className="billing-status-header">
                            <h2>Current Plan</h2>
                            <span className={`billing-status-badge ${sub?.status}`}>
                                {sub?.status === 'trialing' ? 'Trial' : sub?.status}
                            </span>
                        </div>

                        <div className="billing-status-details">
                            <div className="billing-stat">
                                <span className="billing-stat-value">
                                    {sub?.plan ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1) : 'None'}
                                </span>
                                <span className="billing-stat-label">Plan</span>
                            </div>

                            <div className="billing-stat">
                                <span className="billing-stat-value">
                                    {sub?.activeLearnerCount ?? 0} / {sub?.maxActiveLearners ?? 0}
                                </span>
                                <span className="billing-stat-label">Active Learners</span>
                            </div>

                            {isTrialing && sub?.trialDaysRemaining !== null && (
                                <div className="billing-stat trial-warning">
                                    <span className="billing-stat-value">
                                        {sub.trialDaysRemaining} days
                                    </span>
                                    <span className="billing-stat-label">Trial Remaining</span>
                                </div>
                            )}

                            {sub?.usagePercent !== undefined && (
                                <div className="billing-usage-bar">
                                    <div
                                        className="billing-usage-fill"
                                        style={{ width: `${Math.min(100, sub.usagePercent)}%` }}
                                    />
                                </div>
                            )}
                        </div>

                        {isPastDue && (
                            <div className="billing-warning">
                                ⚠️ Your payment is past due. Please update your payment method to avoid service interruption.
                                <button onClick={handleManageBilling} className="billing-warning-btn">
                                    Update Payment
                                </button>
                            </div>
                        )}

                        {isCanceled && (
                            <div className="billing-error-banner">
                                Your subscription has been canceled. Choose a plan below to reactivate.
                            </div>
                        )}
                    </div>

                    {/* Pricing Cards */}
                    <div className="billing-plans">
                        {PLANS.map((plan) => {
                            const price = plan.monthlyPrice;
                            const isCurrentPlan = sub?.plan === plan.id && hasActiveSubscription;
                            const extraLearners = Math.max(0, (sub?.activeLearnerCount ?? 0) - plan.learnerLimit);
                            const projectedMonthly = price + extraLearners * plan.overagePerLearner;

                            return (
                                <div
                                    key={plan.id}
                                    className={`billing-plan-card ${plan.popular ? 'popular' : ''} ${isCurrentPlan ? 'current' : ''}`}
                                >
                                    {plan.popular && <div className="billing-popular-badge">Most Popular</div>}
                                    <h3>{plan.name}</h3>
                                    <p className="billing-plan-desc">{plan.description}</p>
                                    <div className="billing-plan-price">
                                        <span className="billing-price-amount">${price}</span>
                                        <span className="billing-price-period">/mo</span>
                                    </div>
                                    <p className="billing-plan-overage">
                                        Includes {plan.learnerLimit} learners, then ${plan.overagePerLearner}/learner.
                                    </p>
                                    {(sub?.activeLearnerCount ?? 0) > 0 && (
                                        <p className="billing-plan-estimate">
                                            At {sub?.activeLearnerCount} active learners: ${projectedMonthly.toLocaleString()}/mo
                                        </p>
                                    )}
                                    <ul className="billing-plan-features">
                                        {plan.features.map((feature, i) => (
                                            <li key={i}>✓ {feature}</li>
                                        ))}
                                    </ul>
                                    {isCurrentPlan ? (
                                        <button className="billing-plan-btn current" disabled>
                                            Current Plan
                                        </button>
                                    ) : (
                                        <button
                                            className="billing-plan-btn"
                                            onClick={() => handleUpgrade(plan.id as 'starter' | 'growth' | 'scale')}
                                            disabled={isProcessing}
                                        >
                                            {isProcessing ? 'Loading...' : isTrialing || isCanceled ? 'Choose Plan' : 'Upgrade'}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Enterprise callout */}
                    <div className="billing-enterprise">
                        <h3>Need custom enterprise terms?</h3>
                        <p>For very large organizations, custom SLAs, or procurement workflows, contact sales for enterprise pricing.</p>
                        <a href="mailto:sales@agentsofaba.com" className="billing-enterprise-btn">
                            Contact Sales
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
