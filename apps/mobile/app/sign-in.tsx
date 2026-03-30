import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { OptionalLinearGradient } from '../src/components/OptionalLinearGradient'
import { InputField } from '../src/components/ui'
import { radius, spacing, type ThemePalette } from '../src/lib/theme'
import { useAuth } from '../src/providers/AuthProvider'
import { useAppTheme } from '../src/providers/ThemeProvider'

const googleMarkStyle = { width: 20, height: 20 } as const

const GoogleMark = () => (
  <Image source={require('../assets/google-mark.png')} style={googleMarkStyle} resizeMode="contain" />
)

export default function SignInScreen() {
  const { colors, theme } = useAppTheme()
  const styles = useMemo(() => createStyles(colors, theme === 'dark'), [colors, theme])
  const iconColor = colors.textMuted
  const brandGradient = useMemo(() => [colors.primary, colors.purple] as const, [colors])
  /** Неактивное состояние основных CTA (Sign In и др.): в dark — нейтральный surface, не светло-зелёная «плашка». */
  const mutedBrandGradient = useMemo(
    () =>
      theme === 'dark'
        ? ([colors.surfaceMuted, colors.surfaceMuted] as const)
        : (['#A7D7AF', '#A7D7AF'] as const),
    [theme, colors.surfaceMuted]
  )
  const {
    user,
    signIn,
    signUp,
    requestCode,
    requestPasswordReset,
    resetPassword: resetPasswordWithCode,
    signInWithGoogle,
  } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [signInStep, setSignInStep] = useState<'password' | 'resetEmail' | 'resetDetails'>('password')
  const [step, setStep] = useState<'email' | 'details'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [expiresAt, setExpiresAt] = useState<string | undefined>()
  const [showPassword, setShowPassword] = useState(false)
  const normalizedEmail = email.trim()
  const canSubmitSignIn = normalizedEmail.length > 0 && password.length > 0
  const canRequestCode = normalizedEmail.length > 0
  const canSubmitPasswordReset =
    resetCode.trim().length > 0 &&
    resetNewPassword.length > 0 &&
    resetConfirmPassword.length > 0
  const canSubmitSignUp =
    code.trim().length > 0 &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    password.length > 0 &&
    confirmPassword.length > 0

  useEffect(() => {
    if (user) {
      router.replace('/(tabs)')
    }
  }, [user])

  const resetForMode = (value: 'signin' | 'signup') => {
    setMode(value)
    setSignInStep('password')
    setStep('email')
    setError(null)
    setNotice(null)
    setExpiresAt(undefined)
    setResetCode('')
    setResetNewPassword('')
    setResetConfirmPassword('')
    setShowPassword(false)
  }

  const submitSignIn = async () => {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      await signIn(normalizedEmail, password)
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
    setNotice(null)
    try {
      const nextExpiry = await requestCode(normalizedEmail)
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
    setNotice(null)
    try {
      await signUp({
        email: normalizedEmail,
        code: code.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      })
      router.replace('/(tabs)')
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  const submitRequestPasswordReset = async () => {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const nextExpiry = await requestPasswordReset(normalizedEmail)
      setExpiresAt(nextExpiry)
      setSignInStep('resetDetails')
      setNotice('We sent a password reset code to your email.')
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to send password reset code')
    } finally {
      setLoading(false)
    }
  }

  const submitPasswordReset = async () => {
    if (resetNewPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      await resetPasswordWithCode(normalizedEmail, resetCode.trim(), resetNewPassword)
      router.replace('/(tabs)')
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  const submitGoogleSignIn = async () => {
    setGoogleLoading(true)
    setError(null)
    setNotice(null)
    try {
      await signInWithGoogle()
      router.replace('/(tabs)')
    } catch (nextError: any) {
      if (nextError?.message === 'Google sign-in was cancelled.') {
        setGoogleLoading(false)
        return
      }
      setError(nextError?.message || 'Failed to continue with Google')
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.background}>
        <Image
          source={require('../assets/auth-bg.png')}
          style={[styles.backgroundImage, theme === 'dark' && styles.backgroundImageDark]}
          resizeMode="stretch"
        />
        {theme === 'dark' ? <View style={styles.authBgDarkVeil} pointerEvents="none" /> : null}
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'position' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <View style={styles.content}>
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <Image
                source={require('../assets/piqle-ball-logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>Piqle</Text>
            <Text style={styles.subtitle}>Your pickleball journey starts here</Text>
          </View>

          <View style={styles.formShell}>
            <View style={styles.modeSwitch}>
              {(['signin', 'signup'] as const).map((value) => {
                const active = mode === value
                return (
                  <Pressable
                    key={value}
                    onPress={() => resetForMode(value)}
                    style={({ pressed }) => [
                      styles.modeButton,
                      active && styles.modeButtonActive,
                      pressed && !active && styles.modeButtonPressed,
                    ]}
                  >
                    {active ? (
                      <OptionalLinearGradient
                        colors={brandGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.modeButtonGradient}
                      >
                        <Text style={[styles.modeLabel, styles.modeLabelActive]}>
                          {value === 'signin' ? 'Sign In' : 'Sign Up'}
                        </Text>
                      </OptionalLinearGradient>
                    ) : (
                      <Text style={styles.modeLabel}>{value === 'signin' ? 'Sign In' : 'Sign Up'}</Text>
                    )}
                  </Pressable>
                )
              })}
            </View>

            <View style={styles.form}>
              <View style={styles.formBlock}>
                <Text style={styles.label}>Email</Text>
                <InputField
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  left={<Feather name="mail" size={20} color={iconColor} />}
                  containerStyle={styles.textField}
                />
              </View>

              {mode === 'signin' ? (
                signInStep === 'password' ? (
                  <>
                    <View style={styles.formBlock}>
                      <Text style={styles.label}>Password</Text>
                      <InputField
                        value={password}
                        onChangeText={setPassword}
                        placeholder="••••••••"
                        secureTextEntry={!showPassword}
                        left={<Feather name="lock" size={20} color={iconColor} />}
                        right={
                          <Pressable onPress={() => setShowPassword((value) => !value)}>
                            <Feather
                              name={showPassword ? 'eye-off' : 'eye'}
                              size={20}
                              color={iconColor}
                            />
                          </Pressable>
                        }
                        containerStyle={styles.textField}
                      />
                    </View>

                    <Pressable
                      onPress={() => {
                        setSignInStep('resetEmail')
                        setError(null)
                        setNotice(null)
                        setResetCode('')
                        setResetNewPassword('')
                        setResetConfirmPassword('')
                        setExpiresAt(undefined)
                      }}
                      style={styles.forgotPasswordWrap}
                    >
                      <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                    </Pressable>

                    {error ? (
                      <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    ) : null}

                    {notice ? (
                      <View style={styles.noticeBox}>
                        <Text style={styles.noticeText}>{notice}</Text>
                      </View>
                    ) : null}

                    <Pressable
                      onPress={submitSignIn}
                      disabled={!canSubmitSignIn || loading || googleLoading}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        !canSubmitSignIn && styles.primaryButtonDisabled,
                        pressed && canSubmitSignIn && !(loading || googleLoading) && styles.primaryButtonPressed,
                      ]}
                    >
                      <OptionalLinearGradient
                        colors={canSubmitSignIn ? brandGradient : mutedBrandGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.primaryButtonGradient, loading && styles.disabledButton]}
                      >
                        <Text
                          style={[
                            styles.primaryButtonText,
                            !canSubmitSignIn && styles.primaryButtonTextMuted,
                          ]}
                        >
                          {loading ? 'Signing In...' : 'Sign In'}
                        </Text>
                      </OptionalLinearGradient>
                    </Pressable>
                  </>
                ) : signInStep === 'resetEmail' ? (
                  <>
                    <Text style={styles.help}>
                      We'll send a verification code to your email so you can choose a new password.
                    </Text>

                    {error ? (
                      <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    ) : null}

                    {notice ? (
                      <View style={styles.noticeBox}>
                        <Text style={styles.noticeText}>{notice}</Text>
                      </View>
                    ) : null}

                    <Pressable
                      onPress={submitRequestPasswordReset}
                      disabled={!canRequestCode || loading || googleLoading}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        !canRequestCode && styles.primaryButtonDisabled,
                        pressed && canRequestCode && !(loading || googleLoading) && styles.primaryButtonPressed,
                      ]}
                    >
                      <OptionalLinearGradient
                        colors={canRequestCode ? brandGradient : mutedBrandGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.primaryButtonGradient, loading && styles.disabledButton]}
                      >
                        <Text
                          style={[
                            styles.primaryButtonText,
                            !canRequestCode && styles.primaryButtonTextMuted,
                          ]}
                        >
                          {loading ? 'Sending Code...' : 'Send Reset Code'}
                        </Text>
                      </OptionalLinearGradient>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setSignInStep('password')
                        setError(null)
                        setNotice(null)
                      }}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                    >
                      <Text style={styles.secondaryButtonText}>Back to sign in</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View style={styles.verificationRow}>
                      <View style={styles.verificationBadge}>
                        <Text style={styles.verificationBadgeText}>Reset pending</Text>
                      </View>
                      {expiresAt ? (
                        <View style={styles.secondaryBadge}>
                          <Text style={styles.secondaryBadgeText}>
                            Expires{' '}
                            {new Date(expiresAt).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.formBlock}>
                      <Text style={styles.label}>Reset code</Text>
                      <InputField
                        value={resetCode}
                        onChangeText={setResetCode}
                        placeholder="Enter 6-digit code"
                        left={<Feather name="hash" size={20} color={iconColor} />}
                        containerStyle={styles.textField}
                      />
                    </View>

                    <View style={styles.formBlock}>
                      <Text style={styles.label}>New password</Text>
                      <InputField
                        value={resetNewPassword}
                        onChangeText={setResetNewPassword}
                        placeholder="At least 8 characters"
                        secureTextEntry={!showPassword}
                        left={<Feather name="lock" size={20} color={iconColor} />}
                        right={
                          <Pressable onPress={() => setShowPassword((value) => !value)}>
                            <Feather
                              name={showPassword ? 'eye-off' : 'eye'}
                              size={20}
                              color={iconColor}
                            />
                          </Pressable>
                        }
                        containerStyle={styles.textField}
                      />
                    </View>

                    <View style={styles.formBlock}>
                      <Text style={styles.label}>Confirm new password</Text>
                      <InputField
                        value={resetConfirmPassword}
                        onChangeText={setResetConfirmPassword}
                        placeholder="Repeat new password"
                        secureTextEntry={!showPassword}
                        left={<Feather name="check-circle" size={20} color={iconColor} />}
                        containerStyle={styles.textField}
                      />
                    </View>

                    {error ? (
                      <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    ) : null}

                    {notice ? (
                      <View style={styles.noticeBox}>
                        <Text style={styles.noticeText}>{notice}</Text>
                      </View>
                    ) : null}

                    <Pressable
                      onPress={submitPasswordReset}
                      disabled={!canSubmitPasswordReset || loading || googleLoading}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        !canSubmitPasswordReset && styles.primaryButtonDisabled,
                        pressed && canSubmitPasswordReset && !(loading || googleLoading) && styles.primaryButtonPressed,
                      ]}
                    >
                      <OptionalLinearGradient
                        colors={canSubmitPasswordReset ? brandGradient : mutedBrandGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.primaryButtonGradient, loading && styles.disabledButton]}
                      >
                        <Text
                          style={[
                            styles.primaryButtonText,
                            !canSubmitPasswordReset && styles.primaryButtonTextMuted,
                          ]}
                        >
                          {loading ? 'Updating Password...' : 'Update Password'}
                        </Text>
                      </OptionalLinearGradient>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        setSignInStep('password')
                        setError(null)
                        setNotice(null)
                      }}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                    >
                      <Text style={styles.secondaryButtonText}>Back to sign in</Text>
                    </Pressable>

                    <Pressable
                      onPress={submitRequestPasswordReset}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                      disabled={loading || googleLoading}
                    >
                      <Text style={styles.secondaryButtonText}>Resend code</Text>
                    </Pressable>
                  </>
                )
              ) : step === 'email' ? (
                <>
                  <Text style={styles.help}>
                    We will send a verification code to your email before creating your account.
                  </Text>

                  {error ? (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ) : null}

                  <Pressable
                    onPress={submitRequestCode}
                    disabled={!canRequestCode || loading || googleLoading}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      !canRequestCode && styles.primaryButtonDisabled,
                      pressed && canRequestCode && !(loading || googleLoading) && styles.primaryButtonPressed,
                    ]}
                  >
                    <OptionalLinearGradient
                      colors={canRequestCode ? brandGradient : mutedBrandGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.primaryButtonGradient, loading && styles.disabledButton]}
                    >
                      <Text
                        style={[
                          styles.primaryButtonText,
                          !canRequestCode && styles.primaryButtonTextMuted,
                        ]}
                      >
                        {loading ? 'Sending Code...' : 'Send Verification Code'}
                      </Text>
                    </OptionalLinearGradient>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.verificationRow}>
                    <View style={styles.verificationBadge}>
                      <Text style={styles.verificationBadgeText}>Verification pending</Text>
                    </View>
                    {expiresAt ? (
                      <View style={styles.secondaryBadge}>
                        <Text style={styles.secondaryBadgeText}>
                          Expires{' '}
                          {new Date(expiresAt).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.formBlock}>
                    <Text style={styles.label}>Verification code</Text>
                    <InputField
                      value={code}
                      onChangeText={setCode}
                      placeholder="Enter 6-digit code"
                      left={<Feather name="hash" size={20} color={iconColor} />}
                      containerStyle={styles.textField}
                    />
                  </View>

                  <View style={styles.inlineGrid}>
                    <View style={styles.inlineField}>
                      <Text style={styles.label}>First name</Text>
                      <InputField
                        value={firstName}
                        onChangeText={setFirstName}
                        placeholder="First name"
                        containerStyle={styles.textField}
                      />
                    </View>
                    <View style={styles.inlineField}>
                      <Text style={styles.label}>Last name</Text>
                      <InputField
                        value={lastName}
                        onChangeText={setLastName}
                        placeholder="Last name"
                        containerStyle={styles.textField}
                      />
                    </View>
                  </View>

                  <View style={styles.formBlock}>
                    <Text style={styles.label}>Password</Text>
                    <InputField
                      value={password}
                      onChangeText={setPassword}
                      placeholder="At least 8 characters"
                      secureTextEntry={!showPassword}
                      left={<Feather name="lock" size={20} color={iconColor} />}
                      right={
                        <Pressable onPress={() => setShowPassword((value) => !value)}>
                          <Feather
                            name={showPassword ? 'eye-off' : 'eye'}
                            size={20}
                            color={iconColor}
                          />
                        </Pressable>
                      }
                      containerStyle={styles.textField}
                    />
                  </View>

                  <View style={styles.formBlock}>
                    <Text style={styles.label}>Confirm password</Text>
                    <InputField
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Repeat password"
                      secureTextEntry={!showPassword}
                      left={<Feather name="check-circle" size={20} color={iconColor} />}
                      containerStyle={styles.textField}
                    />
                  </View>

                  {error ? (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ) : null}

                  <Pressable
                    onPress={submitSignUp}
                    disabled={!canSubmitSignUp || loading || googleLoading}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      !canSubmitSignUp && styles.primaryButtonDisabled,
                      pressed && canSubmitSignUp && !(loading || googleLoading) && styles.primaryButtonPressed,
                    ]}
                  >
                    <OptionalLinearGradient
                      colors={canSubmitSignUp ? brandGradient : mutedBrandGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.primaryButtonGradient, loading && styles.disabledButton]}
                    >
                      <Text
                        style={[
                          styles.primaryButtonText,
                          !canSubmitSignUp && styles.primaryButtonTextMuted,
                        ]}
                      >
                        {loading ? 'Creating Account...' : 'Create Account'}
                      </Text>
                    </OptionalLinearGradient>
                  </Pressable>

                  <Pressable
                    onPress={() => setStep('email')}
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                  >
                    <Text style={styles.secondaryButtonText}>Back to email</Text>
                  </Pressable>
                </>
              )}

              <Pressable
                onPress={submitGoogleSignIn}
                disabled={loading || googleLoading}
                style={({ pressed }) => [
                  styles.googleButton,
                  pressed && !(loading || googleLoading) && styles.googleButtonPressed,
                  googleLoading && styles.disabledButton,
                ]}
              >
                <GoogleMark />
                <Text style={styles.googleButtonText}>
                  {googleLoading ? 'Opening Google...' : 'Continue with Google'}
                </Text>
              </Pressable>

              {mode === 'signup' ? (
                <Text style={styles.termsText}>
                  By signing up, you agree to our <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>
                </Text>
              ) : null}
            </View>
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemePalette, isDark: boolean) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.authBackground,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.authBackground,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundImageDark: {
    opacity: 0.1,
  },
  authBgDarkVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    justifyContent: 'center',
  },
  hero: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoWrap: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    marginTop: 16,
    color: colors.text,
    fontSize: 50,
    fontWeight: '800',
    letterSpacing: -1.6,
  },
  subtitle: {
    marginTop: 12,
    maxWidth: 280,
    color: colors.textMuted,
    fontSize: 18,
    lineHeight: 26,
    textAlign: 'center',
  },
  formShell: {
    width: '100%',
    gap: spacing.lg,
  },
  modeSwitch: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: isDark ? colors.surface : 'rgba(255, 255, 255, 0.48)',
    shadowColor: isDark ? colors.black : colors.white,
    shadowOpacity: isDark ? 0.45 : 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  modeButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  modeButtonGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modeButtonActive: {
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  modeButtonPressed: {
    opacity: 0.85,
  },
  modeLabel: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 15,
  },
  modeLabelActive: {
    color: colors.white,
    paddingVertical: 0,
  },
  form: {
    gap: spacing.md,
  },
  formBlock: {
    gap: 8,
  },
  inlineGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  inlineField: {
    flex: 1,
    gap: 8,
  },
  label: {
    marginLeft: 4,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  textField: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: isDark ? colors.surfaceElevated : 'rgba(255, 255, 255, 0.82)',
    paddingHorizontal: 16,
  },
  forgotPasswordWrap: {
    alignSelf: 'flex-end',
    marginTop: -2,
  },
  forgotPasswordText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  help: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  errorBox: {
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.18)',
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeBox: {
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.18)',
    backgroundColor: 'rgba(34, 197, 94, 0.10)',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  noticeText: {
    color: isDark ? '#b7f5c2' : '#166534',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  verificationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  verificationBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.chip,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  verificationBadgeText: {
    color: colors.chipText,
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: isDark ? colors.surfaceElevated : 'rgba(255, 255, 255, 0.80)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secondaryBadgeText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  primaryButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  primaryButtonPressed: {
    opacity: 0.94,
  },
  primaryButtonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonGradient: {
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  /** Текст на приглушённом градиенте (форма не заполнена): в dark фон тёмный — белый режет глаз. */
  primaryButtonTextMuted: {
    color: isDark ? colors.textMuted : colors.white,
  },
  secondaryButton: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: isDark ? colors.surfaceElevated : 'rgba(255, 255, 255, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  secondaryButtonPressed: {
    backgroundColor: isDark ? colors.secondaryPressed : colors.white,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  googleButton: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: isDark ? colors.surfaceElevated : 'rgba(255, 255, 255, 0.82)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  googleButtonPressed: {
    backgroundColor: isDark ? colors.secondaryPressed : colors.white,
  },
  googleButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.65,
  },
  termsText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  termsLink: {
    color: colors.primary,
  },
  })






