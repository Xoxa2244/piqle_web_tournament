export type ManagerGuardCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'WEB_ONLY_MANAGEMENT'
  | 'NOT_FOUND'
  | 'LOAD_FAILED'

type GuardCopyInput = {
  code: ManagerGuardCode | null
  entityLabel: string
  fallbackMessage?: string | null
}

export const getManagerGuardCopy = (input: GuardCopyInput) => {
  if (input.code === 'AUTH_REQUIRED') {
    return {
      title: 'Sign in required',
      text: `Sign in to continue with ${input.entityLabel} management on mobile.`,
      showSignIn: true,
    }
  }

  if (input.code === 'FORBIDDEN') {
    return {
      title: 'Access denied',
      text: `You do not have access to manage this ${input.entityLabel}.`,
      showSignIn: false,
    }
  }

  if (input.code === 'WEB_ONLY_MANAGEMENT') {
    return {
      title: 'Web admin only',
      text: 'MLP and Indy League tournament management is available only in web admin.',
      showSignIn: false,
    }
  }

  if (input.code === 'NOT_FOUND') {
    return {
      title: `${input.entityLabel.slice(0, 1).toUpperCase()}${input.entityLabel.slice(1)} unavailable`,
      text: input.fallbackMessage || `${input.entityLabel} not found.`,
      showSignIn: false,
    }
  }

  return {
    title: 'Management unavailable',
    text: input.fallbackMessage || `Could not open ${input.entityLabel} manager.`,
    showSignIn: false,
  }
}
