import { Feather } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ActionButton, InputField, Pill, SurfaceCard } from '../src/components/ui'
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
  const [showPassword, setShowPassword] = useState(false)

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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.background}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <Text style={styles.logoText}>P</Text>
          </View>
          <Text style={styles.title}>Piqle Player</Text>
          <Text style={styles.subtitle}>Your pickleball journey starts here.</Text>
        </View>

        <SurfaceCard style={styles.formCard}>
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
                  <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>
                    {value === 'signin' ? 'Sign In' : 'Create Account'}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>Email</Text>
            <InputField
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              left={<Feather name="mail" size={18} color={palette.textMuted} />}
            />
          </View>

          {mode === 'signin' ? (
            <>
              <View style={styles.formBlock}>
                <Text style={styles.label}>Password</Text>
                <InputField
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Your password"
                  secureTextEntry={!showPassword}
                  left={<Feather name="lock" size={18} color={palette.textMuted} />}
                  right={
                    <Pressable onPress={() => setShowPassword((value) => !value)}>
                      <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={palette.textMuted} />
                    </Pressable>
                  }
                />
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
                <InputField value={code} onChangeText={setCode} placeholder="6-digit code" left={<Feather name="hash" size={18} color={palette.textMuted} />} />
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
                <InputField
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  secureTextEntry={!showPassword}
                  left={<Feather name="lock" size={18} color={palette.textMuted} />}
                  right={
                    <Pressable onPress={() => setShowPassword((value) => !value)}>
                      <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={palette.textMuted} />
                    </Pressable>
                  }
                />
              </View>
              <View style={styles.formBlock}>
                <Text style={styles.label}>Confirm password</Text>
                <InputField value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat password" secureTextEntry={!showPassword} left={<Feather name="check-circle" size={18} color={palette.textMuted} />} />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <ActionButton label="Create account" loading={loading} onPress={submitSignUp} />
              <ActionButton label="Back to email" variant="secondary" onPress={() => setStep('email')} />
            </>
          )}
        </SurfaceCard>

        <Text style={styles.footerText}>
          Email/password auth is live for mobile. Native Google sign-in still needs dedicated mobile OAuth setup.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.authBackground,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.authBackground,
  },
  glowTop: {
    position: 'absolute',
    top: -140,
    left: -110,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(40, 205, 65, 0.12)',
  },
  glowBottom: {
    position: 'absolute',
    right: -140,
    bottom: -120,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(82, 224, 104, 0.08)',
  },
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  logoWrap: {
    width: 90,
    height: 90,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
    shadowColor: palette.shadowStrong,
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  logoText: {
    color: palette.white,
    fontSize: 42,
    fontWeight: '800',
  },
  title: {
    marginTop: spacing.lg,
    color: palette.text,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 8,
    color: palette.textMuted,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  formCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderColor: 'rgba(255, 255, 255, 0.72)',
    shadowColor: palette.shadowStrong,
    shadowOpacity: 0.14,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
  },
  modeSwitch: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(10, 10, 10, 0.05)',
    padding: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(10, 10, 10, 0.10)',
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  modeButtonActive: {
    backgroundColor: palette.primary,
  },
  modeLabel: {
    color: palette.textMuted,
    fontWeight: '700',
  },
  modeLabelActive: {
    color: palette.white,
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
  footerText: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
})
