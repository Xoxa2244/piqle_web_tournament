import type Stripe from 'stripe'

type StripeConnectAccount = Stripe.Account | Stripe.DeletedAccount | null | undefined

const isDeletedAccount = (account: StripeConnectAccount): account is Stripe.DeletedAccount =>
  Boolean(account && 'deleted' in account && account.deleted)

export const isStripeConnectPayoutsActive = (account: StripeConnectAccount) => {
  if (!account || isDeletedAccount(account)) return false

  return Boolean(
    account.details_submitted &&
      account.charges_enabled &&
      account.payouts_enabled &&
      account.capabilities?.transfers === 'active'
  )
}

export const getActiveStripeDestinationAccountId = async (
  stripe: Stripe,
  accountId?: string | null
) => {
  if (!accountId) return null

  try {
    const account = await stripe.accounts.retrieve(accountId)
    return isStripeConnectPayoutsActive(account) ? accountId : null
  } catch (error) {
    console.warn('Failed to verify Stripe Connect destination account', error)
    return null
  }
}
