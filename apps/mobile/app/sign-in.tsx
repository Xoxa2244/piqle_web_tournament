import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'

import { ActionButton, InputField, Pill, Screen, SurfaceCard } from '../src/components/ui'
import { palette, radius, spacing } from '../src/lib/theme'
import { useAuth } from '../src/providers/AuthProvider'

export default function SignInScreen() {
  const { user, signIn, signUp, requestCode } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [step, setStep] = useState<'email' | 'details'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expiresAt, setExpiresAt] = useState<string | undefined>()

  useEffect(() => {
    if (user) {
      router.replace('/(tabs)')
    }
  }, [user])

  const submitSignIn = async () => {
    setLoading(true)
    setError(null)
    try {
      await signIn(email, password)
      router.replace('/(tabs)')
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  const submitRequestCode = async () => {
    setLoading(true)
    setError(null)
    try {
      const nextExpiry = await requestCode(email)
      setExpiresAt(nextExpiry)
      setStep('details')
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to send verification code')
    } finally {
      setLoading(false)
    }
  }

  const submitSignUp = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      await signUp({
        email,
        code,
        firstName,
        lastName,
        password,
      })
      router.replace('/(tabs)')
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen title="Piqle Player" subtitle="A mobile client for players, clubs, event chats, and registrations.">
      <SurfaceCard>
        <View style={styles.modeSwitch}>
          {(['signin', 'signup'] as const).map((value) => {
            const active = mode === value
            return (
              <Pressable
                key={value}
                onPress={() => {
                  setMode(value)
                  setStep('email')
                  setError(null)
                }}
                style={[styles.modeButton, active && styles.modeButtonActive]}
              >
                <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{value === 'signin' ? 'Sign In' : 'Create Account'}</Text>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.formBlock}>
          <Text style={styles.label}>Email</Text>
          <InputField value={email} onChangeText={setEmail} placeholder="you@example.com" />
        </View>

        {mode === 'signin' ? (
          <>
            <View style={styles.formBlock}>
              <Text style={styles.label}>Password</Text>
              <InputField value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <ActionButton label="Sign In" loading={loading} onPress={submitSignIn} />
          </>
        ) : step === 'email' ? (
          <>
            <Text style={styles.help}>We will send a verification code to this email before creating your account.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <ActionButton label="Send verification code" loading={loading} onPress={submitRequestCode} />
          </>
        ) : (
          <>
            <View style={styles.inlineRow}>
              <Pill label="Verification pending" tone="primary" />
              {expiresAt ? <Pill label={`Expires ${new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`} /> : null}
            </View>
            <View style={styles.formBlock}>
              <Text style={styles.label}>Verification code</Text>
              <InputField value={code} onChangeText={setCode} placeholder="6-digit code" />
            </View>
            <View style={styles.inlineGrid}>
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={styles.label}>First name</Text>
                <InputField value={firstName} onChangeText={setFirstName} placeholder="First name" />
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={styles.label}>Last name</Text>
                <InputField value={lastName} onChangeText={setLastName} placeholder="Last name" />
              </View>
            </View>
            <View style={styles.formBlock}>
              <Text style={styles.label}>Password</Text>
              <InputField value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />
            </View>
            <View style={styles.formBlock}>
              <Text style={styles.label}>Confirm password</Text>
              <InputField value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat password" secureTextEntry />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <ActionButton label="Create account" loading={loading} onPress={submitSignUp} />
            <ActionButton label="Back to email" variant="secondary" onPress={() => setStep('email')} />
          </>
        )}
      </SurfaceCard>
    </Screen>
  )
}

const styles = StyleSheet.create({
  modeSwitch: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: palette.surfaceMuted,
    padding: 6,
    borderRadius: radius.pill,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  modeButtonActive: {
    backgroundColor: palette.surface,
  },
  modeLabel: {
    color: palette.textMuted,
    fontWeight: '700',
  },
  modeLabelActive: {
    color: palette.text,
  },
  formBlock: {
    marginTop: spacing.md,
    gap: 8,
  },
  label: {
    color: palette.textMuted,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  help: {
    marginTop: spacing.md,
    color: palette.textMuted,
    lineHeight: 20,
  },
  error: {
    marginTop: spacing.md,
    color: palette.danger,
    fontWeight: '600',
  },
  formBlockButton: {
    marginTop: spacing.md,
  },
  inlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.md,
  },
  inlineGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
})
