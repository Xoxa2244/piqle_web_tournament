import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY

if (!stripeSecretKey) {
  console.warn('[Stripe] STRIPE_SECRET_KEY не задан, платежи будут недоступны.')
}

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
    })
  : null

export const STRIPE_CURRENCY_DEFAULT = 'usd'

export const STRIPE_PLATFORM_FEE_PERCENT = 0.1

export const calculatePlatformFeeAmount = (amountInMinorUnits: number) => {
  return Math.round(amountInMinorUnits * STRIPE_PLATFORM_FEE_PERCENT)
}

