export const PLATFORM_FEE_PERCENT = 0.1
export const PLATFORM_FEE_CAP_CENTS = 500
export const STRIPE_FEE_PERCENT = 0.029
export const STRIPE_FEE_FIXED_CENTS = 30

export const SERVICE_FEE_RATE = PLATFORM_FEE_PERCENT
export const SERVICE_FEE_MAX = 5

export const roundCurrency = (amount: number) => {
  return Math.round(amount * 100) / 100
}

export const calculateServiceFee = (entryFee: number) => {
  if (entryFee <= 0) return 0
  return roundCurrency(Math.min(entryFee * SERVICE_FEE_RATE, SERVICE_FEE_MAX))
}

export const toCents = (amount: number) => {
  return Math.round(amount * 100)
}

export const fromCents = (amountCents: number) => {
  return roundCurrency(amountCents / 100)
}

export const calculatePlatformFeeCents = (entryFeeCents: number) => {
  if (entryFeeCents <= 0) return 0
  const raw = Math.round(entryFeeCents * PLATFORM_FEE_PERCENT)
  return Math.min(raw, PLATFORM_FEE_CAP_CENTS)
}

export const estimateStripeFeeCents = (entryFeeCents: number) => {
  if (entryFeeCents <= 0) return 0
  const percent = Math.round(entryFeeCents * STRIPE_FEE_PERCENT)
  return percent + STRIPE_FEE_FIXED_CENTS
}

export const calculateOrganizerNetCents = (entryFeeCents: number) => {
  const platformFeeCents = calculatePlatformFeeCents(entryFeeCents)
  const stripeFeeCents = estimateStripeFeeCents(entryFeeCents)
  const organizerAmountCents = entryFeeCents - platformFeeCents - stripeFeeCents
  return {
    platformFeeCents,
    stripeFeeCents,
    organizerAmountCents,
  }
}
