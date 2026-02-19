import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../components/AppBackground'
import { PrimaryButton } from '../components/PrimaryButton'
import { useAuth } from '../auth/AuthContext'
import { completeSignupWithOtp, requestSignupCode } from '../auth/mobileAuthApi'
import { colors } from '../theme/colors'
import { spacing } from '../theme/spacing'

type AuthMode = 'signin' | 'signup'
type SignupStep = 'email' | 'details'

const mapAuthError = (message: string) => {
  if (message.includes('Google account')) {
    return 'This email is linked to Google sign-in on web.'
  }
  if (message.includes('already exists')) {
    return 'User already exists. Switch to Sign in.'
  }
  if (message.includes('Please wait')) {
    return 'Please wait before requesting another code.'
  }
  if (message.includes('Code expired') || message.includes('expired')) {
    return 'Code expired. Request a new one.'
  }
  if (message.includes('Too many attempts')) {
    return 'Too many attempts. Request a new code.'
  }
  if (message.includes('Too many') || message.includes('later')) {
    return 'Too many attempts. Please try again later.'
  }
  return message
}

export function AuthScreen() {
  const { signIn } = useAuth()
  const [mode, setMode] = useState<AuthMode>('signin')
  const [signupStep, setSignupStep] = useState<SignupStep>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSendingCode, setIsSendingCode] = useState(false)

  const resetSignupDetails = () => {
    setCode('')
    setFirstName('')
    setLastName('')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <AppBackground>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <Text style={styles.kicker}>Piqle Mobile</Text>
              <Text style={styles.title}>Welcome</Text>
              <Text style={styles.subtitle}>Sign in or create an account with email OTP.</Text>

              <View style={styles.modeSwitch}>
                <Pressable
                  style={[styles.modeBtn, mode === 'signin' ? styles.modeBtnActive : null]}
                  onPress={() => {
                    setError(null)
                    setMode('signin')
                  }}
                >
                  <Text style={[styles.modeBtnText, mode === 'signin' ? styles.modeBtnTextActive : null]}>
                    Sign in
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modeBtn, mode === 'signup' ? styles.modeBtnActive : null]}
                  onPress={() => {
                    setError(null)
                    setMode('signup')
                    setSignupStep('email')
                    resetSignupDetails()
                  }}
                >
                  <Text style={[styles.modeBtnText, mode === 'signup' ? styles.modeBtnTextActive : null]}>
                    Sign up
                  </Text>
                </Pressable>
              </View>

              {mode === 'signin' ? (
                <View style={styles.form}>
                  <View style={styles.field}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      placeholder="you@example.com"
                      placeholderTextColor="#9BA397"
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="Enter password"
                      placeholderTextColor="#9BA397"
                      style={styles.input}
                      value={password}
                      onChangeText={setPassword}
                    />
                  </View>

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <PrimaryButton
                    label={isSubmitting ? 'Signing in...' : 'Sign in'}
                    onPress={async () => {
                      if (!email.trim() || !password.trim()) {
                        setError('Please enter email and password.')
                        return
                      }
                      try {
                        setError(null)
                        setIsSubmitting(true)
                        await signIn(email.trim(), password)
                      } catch (authError: any) {
                        setError(mapAuthError(authError?.message || 'Sign in failed.'))
                      } finally {
                        setIsSubmitting(false)
                      }
                    }}
                    disabled={isSubmitting}
                  />
                </View>
              ) : signupStep === 'email' ? (
                <View style={styles.form}>
                  <View style={styles.field}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      placeholder="you@example.com"
                      placeholderTextColor="#9BA397"
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                    />
                  </View>

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <PrimaryButton
                    label={isSendingCode ? 'Sending code...' : 'Send verification code'}
                    onPress={async () => {
                      if (!email.trim()) {
                        setError('Please enter email.')
                        return
                      }
                      try {
                        setError(null)
                        setIsSendingCode(true)
                        await requestSignupCode(email.trim())
                        setSignupStep('details')
                      } catch (requestError: any) {
                        setError(mapAuthError(requestError?.message || 'Failed to send code.'))
                      } finally {
                        setIsSendingCode(false)
                      }
                    }}
                    disabled={isSendingCode}
                  />
                </View>
              ) : (
                <View style={styles.form}>
                  <View style={styles.field}>
                    <Text style={styles.label}>Verification Code</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="number-pad"
                      placeholder="6-digit code"
                      placeholderTextColor="#9BA397"
                      style={styles.input}
                      value={code}
                      onChangeText={setCode}
                    />
                  </View>

                  <View style={styles.fieldRow}>
                    <View style={[styles.field, styles.halfField]}>
                      <Text style={styles.label}>First Name</Text>
                      <TextInput
                        autoCapitalize="words"
                        autoCorrect={false}
                        placeholder="First name"
                        placeholderTextColor="#9BA397"
                        style={styles.input}
                        value={firstName}
                        onChangeText={setFirstName}
                      />
                    </View>
                    <View style={[styles.field, styles.halfField]}>
                      <Text style={styles.label}>Last Name</Text>
                      <TextInput
                        autoCapitalize="words"
                        autoCorrect={false}
                        placeholder="Last name"
                        placeholderTextColor="#9BA397"
                        style={styles.input}
                        value={lastName}
                        onChangeText={setLastName}
                      />
                    </View>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="At least 8 characters"
                      placeholderTextColor="#9BA397"
                      style={styles.input}
                      value={password}
                      onChangeText={setPassword}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Confirm Password</Text>
                    <TextInput
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="Repeat password"
                      placeholderTextColor="#9BA397"
                      style={styles.input}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                    />
                  </View>

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <PrimaryButton
                    label={isSubmitting ? 'Creating account...' : 'Create account'}
                    onPress={async () => {
                      if (!code.trim() || !firstName.trim() || !lastName.trim()) {
                        setError('Please fill all fields.')
                        return
                      }
                      if (password.length < 8) {
                        setError('Password must be at least 8 characters.')
                        return
                      }
                      if (password !== confirmPassword) {
                        setError('Passwords do not match.')
                        return
                      }
                      try {
                        setError(null)
                        setIsSubmitting(true)
                        await completeSignupWithOtp({
                          email: email.trim(),
                          code: code.trim(),
                          firstName: firstName.trim(),
                          lastName: lastName.trim(),
                          password,
                        })
                        await signIn(email.trim(), password)
                      } catch (signupError: any) {
                        setError(mapAuthError(signupError?.message || 'Failed to sign up.'))
                      } finally {
                        setIsSubmitting(false)
                      }
                    }}
                    disabled={isSubmitting}
                  />

                  <View style={styles.inlineActions}>
                    <Pressable
                      onPress={() => {
                        setSignupStep('email')
                        setError(null)
                        resetSignupDetails()
                      }}
                    >
                      <Text style={styles.inlineActionText}>Change email</Text>
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        try {
                          setError(null)
                          setIsSendingCode(true)
                          await requestSignupCode(email.trim())
                        } catch (requestError: any) {
                          setError(mapAuthError(requestError?.message || 'Failed to resend code.'))
                        } finally {
                          setIsSendingCode(false)
                        }
                      }}
                      disabled={isSendingCode}
                    >
                      <Text style={styles.inlineActionText}>
                        {isSendingCode ? 'Resending...' : 'Resend code'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AppBackground>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardWrap: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: '#FFFFFFD9',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  modeSwitch: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    backgroundColor: '#ECE6DA',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  modeBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  modeBtnTextActive: {
    color: colors.ink,
  },
  form: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  field: {
    gap: 6,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfField: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 12,
    backgroundColor: '#FFFDF8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  error: {
    fontSize: 13,
    color: colors.warning,
    lineHeight: 18,
  },
  inlineActions: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inlineActionText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '700',
  },
})
