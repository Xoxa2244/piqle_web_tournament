'use client'

import { useState } from "react";
import { motion } from "motion/react";
import {
  CreditCard, Check, Crown, Zap, BarChart3,
  ArrowRight, Sparkles, ExternalLink, Loader2,
} from "lucide-react";
import { useTheme } from "../IQThemeProvider";

// ── Price IDs ──
const PRICE_IDS = {
  starterMonthly: process.env.NEXT_PUBLIC_STRIPE_STARTER_MONTHLY_PRICE_ID || 'price_1TEIpWCTZI3Qt1AsUhpavttD',
  starterAnnual: process.env.NEXT_PUBLIC_STRIPE_STARTER_ANNUAL_PRICE_ID || 'price_1TEIpXCTZI3Qt1AsOj1KEVK6',
  proMonthly: process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID || 'price_1TEIpXCTZI3Qt1AsQNaXQD4A',
  proAnnual: process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID || 'price_1TEIpXCTZI3Qt1AsdRnLn0OS',
};

// ── Plan features ──
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 129,
    annualPrice: 107,
    description: 'AI-powered analytics & engagement for growing clubs',
    features: [
      'Up to 200 members',
      'Dashboard & analytics',
      'AI health scoring (7 components)',
      'AI Slot Filler',
      'Reactivation campaigns',
      '15 campaigns / month',
      '2,000 emails / month',
      '100 SMS / month',
      'AI Advisor (20 chats/day)',
      'Email support',
    ],
    icon: BarChart3,
    color: '#06B6D4',
    priceIdMonthly: PRICE_IDS.starterMonthly,
    priceIdAnnual: PRICE_IDS.starterAnnual,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 299,
    annualPrice: 249,
    description: 'Full AI suite with unlimited campaigns & A/B testing',
    popular: true,
    features: [
      'Unlimited members',
      'Everything in Starter',
      'Unlimited campaigns',
      '10,000 emails / month',
      '500 SMS / month',
      'AI Advisor (50 chats/day)',
      'A/B testing (champion/challenger)',
      'Conversion tracking',
      'CSV import',
      'Priority support',
    ],
    icon: Zap,
    color: '#8B5CF6',
    priceIdMonthly: PRICE_IDS.proMonthly,
    priceIdAnnual: PRICE_IDS.proAnnual,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: null,
    annualPrice: null,
    description: 'Custom solutions for multi-location clubs',
    features: [
      'Everything in Pro',
      'Unlimited emails & SMS',
      'Unlimited AI Advisor',
      'Custom branding',
      'API access',
      'Dedicated account manager',
      'Custom integrations',
      'SLA guarantee',
    ],
    icon: Crown,
    color: '#F59E0B',
    priceIdMonthly: null,
    priceIdAnnual: null,
  },
];

// ── Shared Card ──
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", backdropFilter: "var(--glass-blur)", boxShadow: "var(--card-shadow)" }}>
      {children}
    </div>
  );
}

// ── Types ──
type Subscription = {
  id: string;
  plan: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
} | null;

type BillingIQProps = {
  subscription?: Subscription;
  isLoading?: boolean;
  clubId: string;
};

export function BillingIQ({ subscription, isLoading, clubId }: BillingIQProps) {
  const { isDark } = useTheme();
  const [annual, setAnnual] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const currentPlan = subscription?.plan || 'free';
  const status = subscription?.status || 'none';

  const trialDaysRemaining = (() => {
    if (status !== 'trialing' || !subscription?.trialEndsAt) return 0;
    const diff = new Date(subscription.trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  const handleManageBilling = async () => {
    setLoadingAction('portal');
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Portal error:', err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleUpgrade = async (priceId: string) => {
    setLoadingAction(priceId);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, clubId }),
      });
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleContactSales = () => {
    window.open('mailto:hello@iqsport.ai?subject=Enterprise%20Plan%20Inquiry', '_blank');
  };

  const statusLabel = (() => {
    switch (status) {
      case 'trialing': return 'Trial';
      case 'active': return 'Active';
      case 'past_due': return 'Past Due';
      case 'canceled': return 'Canceled';
      default: return 'Free';
    }
  })();

  const statusColor = (() => {
    switch (status) {
      case 'trialing': return '#F59E0B';
      case 'active': return '#10B981';
      case 'past_due': return '#EF4444';
      case 'canceled': return '#6B7280';
      default: return '#6B7280';
    }
  })();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--t4)" }} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 max-w-[1100px] mx-auto"
    >
      {/* Header */}
      <div>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--heading)" }}>Billing</h1>
        <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>
          Manage your subscription and billing details
        </p>
      </div>

      {/* Current Plan Card */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}
            >
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--heading)" }}>
                  {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} Plan
                </h2>
                <span
                  className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full"
                  style={{
                    background: `${statusColor}20`,
                    color: statusColor,
                    fontWeight: 700,
                  }}
                >
                  {statusLabel}
                </span>
              </div>
              {status === 'trialing' && trialDaysRemaining > 0 && (
                <p className="text-sm mt-0.5" style={{ color: "#F59E0B" }}>
                  {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} remaining in trial
                </p>
              )}
              {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
                <p className="text-sm mt-0.5" style={{ color: "#EF4444" }}>
                  Cancels on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
              {status === 'active' && !subscription?.cancelAtPeriodEnd && subscription?.currentPeriodEnd && (
                <p className="text-sm mt-0.5" style={{ color: "var(--t4)" }}>
                  Next billing: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {(status === 'active' || status === 'trialing' || status === 'past_due') && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleManageBilling}
              disabled={loadingAction === 'portal'}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm shrink-0"
              style={{
                background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                border: "1px solid var(--card-border)",
                color: "var(--t1)",
                fontWeight: 600,
              }}
            >
              {loadingAction === 'portal' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
              Manage Billing
            </motion.button>
          )}
        </div>
      </Card>

      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-3">
        <span
          className="text-sm"
          style={{ color: !annual ? "var(--heading)" : "var(--t4)", fontWeight: !annual ? 600 : 400 }}
        >
          Monthly
        </span>
        <button
          onClick={() => setAnnual(!annual)}
          className="w-14 h-7 rounded-full transition-all relative"
          style={{
            background: annual ? "linear-gradient(135deg, #8B5CF6, #06B6D4)" : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
          }}
        >
          <motion.div
            animate={{ x: annual ? 30 : 4 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="absolute top-1 w-5 h-5 rounded-full bg-white"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
          />
        </button>
        <span
          className="text-sm"
          style={{ color: annual ? "var(--heading)" : "var(--t4)", fontWeight: annual ? 600 : 400 }}
        >
          Annual
        </span>
        {annual && (
          <span
            className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(16,185,129,0.15)",
              color: "#10B981",
              fontWeight: 700,
            }}
          >
            Save 17%
          </span>
        )}
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PLANS.map((plan) => {
          const isCurrentPlan = currentPlan === plan.id;
          const price = annual ? plan.annualPrice : plan.monthlyPrice;
          const PlanIcon = plan.icon;

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: PLANS.indexOf(plan) * 0.1 }}
              className="rounded-2xl p-5 relative flex flex-col"
              style={{
                background: "var(--card-bg)",
                border: plan.popular
                  ? "2px solid rgba(139,92,246,0.5)"
                  : "1px solid var(--card-border)",
                backdropFilter: "var(--glass-blur)",
                boxShadow: plan.popular
                  ? "0 0 30px rgba(139,92,246,0.15)"
                  : "var(--card-shadow)",
              }}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] tracking-wider uppercase"
                  style={{
                    background: "linear-gradient(135deg, #8B5CF6, #06B6D4)",
                    color: "#fff",
                    fontWeight: 700,
                  }}
                >
                  <Sparkles className="w-3 h-3" /> Most Popular
                </div>
              )}

              {/* Plan header */}
              <div className="flex items-center gap-3 mb-4 mt-1">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${plan.color}20` }}
                >
                  <PlanIcon className="w-5 h-5" style={{ color: plan.color }} />
                </div>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--heading)" }}>
                    {plan.name}
                  </h3>
                  <p className="text-[11px]" style={{ color: "var(--t4)" }}>
                    {plan.description}
                  </p>
                </div>
              </div>

              {/* Price */}
              <div className="mb-5">
                {price !== null ? (
                  <div className="flex items-baseline gap-1">
                    <span style={{ fontSize: "36px", fontWeight: 800, color: "var(--heading)" }}>
                      ${price}
                    </span>
                    <span className="text-sm" style={{ color: "var(--t4)" }}>/mo</span>
                    {annual && (
                      <span className="text-xs ml-1" style={{ color: "var(--t4)" }}>
                        billed annually
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span style={{ fontSize: "28px", fontWeight: 800, color: "var(--heading)" }}>
                      Custom
                    </span>
                  </div>
                )}
              </div>

              {/* Features */}
              <div className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2.5">
                    <Check
                      className="w-4 h-4 shrink-0 mt-0.5"
                      style={{ color: plan.color }}
                    />
                    <span className="text-sm" style={{ color: "var(--t2)" }}>
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              {isCurrentPlan ? (
                <div
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm"
                  style={{
                    background: isDark ? "rgba(139,92,246,0.1)" : "rgba(139,92,246,0.05)",
                    border: "1px solid rgba(139,92,246,0.2)",
                    color: "#A78BFA",
                    fontWeight: 600,
                  }}
                >
                  <Check className="w-4 h-4" /> Current Plan
                </div>
              ) : plan.id === 'enterprise' ? (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleContactSales}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm"
                  style={{
                    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                    border: "1px solid var(--card-border)",
                    color: "var(--t1)",
                    fontWeight: 600,
                  }}
                >
                  Contact Sales <ArrowRight className="w-4 h-4" />
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    const priceId = annual ? plan.priceIdAnnual : plan.priceIdMonthly;
                    if (priceId) handleUpgrade(priceId);
                  }}
                  disabled={loadingAction !== null}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-white"
                  style={{
                    background: plan.popular
                      ? "linear-gradient(135deg, #8B5CF6, #06B6D4)"
                      : `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)`,
                    fontWeight: 600,
                    boxShadow: `0 4px 15px ${plan.color}30`,
                    opacity: loadingAction !== null ? 0.7 : 1,
                  }}
                >
                  {loadingAction === (annual ? plan.priceIdAnnual : plan.priceIdMonthly) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>Upgrade <ArrowRight className="w-4 h-4" /></>
                  )}
                </motion.button>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Bottom spacer */}
      <div className="pb-8" />
    </motion.div>
  );
}
