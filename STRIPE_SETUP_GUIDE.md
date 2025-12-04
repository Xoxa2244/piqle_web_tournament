# Stripe Setup Guide - Quick Start

## 🚀 Super Fast Setup (5 minutes)

### Step 1: Get Your Stripe Keys

Go to https://dashboard.stripe.com/test/apikeys and copy:
- **Publishable key** → starts with `pk_test_`
- **Secret key** → starts with `sk_test_`

### Step 2: Enable Stripe Connect

1. Go to https://dashboard.stripe.com/settings/connect
2. Click **Get Started**
3. Choose **Express** accounts
4. Fill in your platform details:
   - Platform name: **Piqle Tournament Platform**
   - Support email: your email
5. Save and get your **Client ID** → starts with `ca_`

### Step 3: Create Webhook

1. Go to https://dashboard.stripe.com/test/webhooks
2. Click **Add endpoint**
3. Enter webhook URL: `https://stest.piqle.io/api/stripe/webhook`
4. Select events:
   - `checkout.session.completed`
   - `payment_intent.payment_failed`  
   - `charge.refunded`
   - `account.updated`
5. Click **Add endpoint**
6. Copy **Signing secret** → starts with `whsec_`

### Step 4: Add to Vercel

1. Go to Vercel Dashboard → your project → **Settings** → **Environment Variables**
2. Add these 4 variables (for Production, Preview, Development):

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_test_YOUR_KEY_HERE
STRIPE_SECRET_KEY = sk_test_YOUR_KEY_HERE
STRIPE_WEBHOOK_SECRET = whsec_YOUR_SECRET_HERE
STRIPE_CONNECT_CLIENT_ID = ca_YOUR_CLIENT_ID_HERE
```

3. Click **Save**
4. Go to **Deployments** → Click **...** → **Redeploy**

### Step 5: Test It

1. After redeploy, go to your tournament
2. Click **"Connect / Update Stripe"** in TD Console
3. Complete Stripe onboarding
4. Try player registration with payment
5. Should redirect to Stripe Checkout! 🎉

---

## 💡 Notes:

- These are **TEST** mode keys - no real money
- Switch to **LIVE** mode keys for production
- Webhook will receive events automatically
- 10% platform fee is automatic

Done! 🚀

