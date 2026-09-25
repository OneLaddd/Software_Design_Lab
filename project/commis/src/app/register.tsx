import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';

const YELLOW = '#FFF000';
const BACKGROUND = '#302F2D';

type Role = 'client' | 'hunter';

function isValidEmail(value: string) {
  const atIndex = value.indexOf('@');
  return atIndex > 0 && value.indexOf('.', atIndex + 1) > atIndex + 1;
}

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(value);
}

function getPasswordRequirements(value: string) {
  return [
    { label: '8+ characters', valid: value.length >= 8 },
    { label: 'one number', valid: /\d/.test(value) },
    { label: 'one symbol', valid: /[^A-Za-z0-9]/.test(value) },
  ];
}

export default function RegisterScreen() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('hunter');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [touched, setTouched] = useState({ username: false, email: false, password: false });
  const [usernameError, setUsernameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordServerError, setPasswordServerError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const passwordRequirements = getPasswordRequirements(password);
  const usernameValid = isValidUsername(username);
  const emailValid = isValidEmail(email);
  const passwordValid = passwordRequirements.every((requirement) => requirement.valid);
  const formValid = Boolean(username && email && password && usernameValid && emailValid && passwordValid);

  const handleRegister = async () => {
    setTouched({ username: true, email: true, password: true });
    setSubmitError('');
    setUsernameError('');
    setEmailError('');
    setPasswordServerError('');
    if (!formValid) return;

    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: username.trim(), role } },
    });
    setIsSubmitting(false);

    if (error) {
      const message = error.message.toLowerCase();
      const errorCode = error.code?.toLowerCase() ?? '';
      console.warn('Registration failed:', error.message, errorCode);

      if (message.includes('username') || message.includes('profiles_username_key')) {
        setUsernameError('That username is taken');
      } else if (
        errorCode === 'user_already_exists' ||
        message.includes('already registered') ||
        message.includes('user already exists') ||
        message.includes('email_exists')
      ) {
        setEmailError('That email is already registered');
      } else if (message.includes('password') || message.includes('weak')) {
        setPasswordServerError('That password was rejected. Try a stronger password');
      } else {
        setSubmitError('Something went wrong, try again');
      }
      return;
    }

    setPassword('');
    if (!data.session) {
      setSubmitError('Check your email to finish creating your account');
      return;
    }

    router.replace({
      pathname: '/login',
      params: { created: '1', email: email.trim() },
    });
  };

  const handleGoogleRegister = async () => {
    setSubmitError('');
    setIsGoogleSubmitting(true);
    const { error, needsProfileSetup } = await signInWithGoogle();
    setIsGoogleSubmitting(false);

    if (error) {
      setSubmitError(error.message || 'Google sign-in failed. Try again');
      return;
    }

    if (needsProfileSetup) {
      router.replace('/google-profile');
      return;
    }

    router.replace({
      pathname: '/login',
      params: { google: '1' },
    });
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.brandSection}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.titleRow}>
              <Text style={styles.titleLead}>Create your </Text>
              <Text style={styles.titleBrand}>commis</Text>
              <Text style={styles.titlePeriod}>.</Text>
            </View>
            <Text style={styles.subtitle}>
              Set up your account to start posting bounties or claiming jobs.
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.sectionLabel}>I am a...</Text>
            <View style={styles.roleRow}>
              <RoleOption
                title="Client"
                subtitle="Hire talent"
                icon={require('@/assets/images/client-icon.png')}
                selected={role === 'client'}
                onPress={() => setRole('client')}
              />
              <RoleOption
                title="Hunter"
                subtitle="Find gigs"
                icon={require('@/assets/images/hunter-icon.png')}
                selected={role === 'hunter'}
                onPress={() => setRole('hunter')}
              />
            </View>

            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, ((touched.username && !usernameValid) || usernameError) && styles.errorLabel]}>USERNAME</Text>
              </View>
              <TextInput
                value={username}
                onChangeText={(value) => {
                  setUsername(value);
                  setUsernameError('');
                  setTouched((current) => ({ ...current, username: true }));
                }}
                placeholder="e.g. Charles Thevenin"
                placeholderTextColor="#77777D"
                autoCapitalize="none"
                style={[
                  styles.input,
                  ((touched.username && !usernameValid) || Boolean(usernameError)) && styles.inputError,
                ]}
                accessibilityLabel="Username"
              />
              {touched.username && !usernameValid ? (
                <Text style={styles.errorText}>Use 3-20 letters, numbers, or underscores</Text>
              ) : usernameError ? (
                <Text style={styles.errorText}>{usernameError}</Text>
              ) : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, ((touched.email && !emailValid) || emailError) && styles.errorLabel]}>EMAIL</Text>
              <TextInput
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setTouched((current) => ({ ...current, email: true }));
                }}
                placeholder="name@example.com"
                placeholderTextColor="#77777D"
                keyboardType="email-address"
                autoCapitalize="none"
                style={[
                  styles.input,
                  ((touched.email && !emailValid) || Boolean(emailError)) && styles.inputError,
                ]}
                accessibilityLabel="Email"
              />
              {touched.email && !emailValid ? (
                <Text style={styles.errorText}>Enter an email like name@example.com</Text>
              ) : emailError ? (
                <Text style={styles.errorText}>{emailError}</Text>
              ) : null}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, ((touched.password && !passwordValid) || passwordServerError) && styles.errorLabel]}>PASSWORD</Text>
              <View style={styles.passwordInputWrap}>
                <TextInput
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setTouched((current) => ({ ...current, password: true }));
                  }}
                  placeholder="Enter your password"
                  placeholderTextColor="#77777D"
                  secureTextEntry={!passwordVisible}
                  style={[
                    styles.input,
                    styles.passwordInput,
                    ((touched.password && !passwordValid) || Boolean(passwordServerError)) && styles.inputError,
                  ]}
                  accessibilityLabel="Password"
                />
                <Pressable
                  onPress={() => setPasswordVisible((visible) => !visible)}
                  style={({ pressed }) => [styles.eyeButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}>
                  <EyeIcon visible={passwordVisible} />
                </Pressable>
              </View>
              <Text style={[styles.passwordHint, touched.password && !passwordValid && styles.errorText]}>
                {touched.password && !passwordValid
                  ? `Missing: ${passwordRequirements
                      .filter((requirement) => !requirement.valid)
                      .map((requirement) => requirement.label)
                      .join(', ')}`
                  : '8+ characters, one number and one symbol'}
              </Text>
              {passwordServerError ? <Text style={styles.errorText}>{passwordServerError}</Text> : null}
            </View>

            <Text style={styles.terms}>
              By creating an account you agree to the{' '}
              <Text style={styles.termsLink}>Terms</Text> and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>.
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.createButton,
                !formValid && styles.createButtonDisabled,
                pressed && formValid && styles.yellowPressed,
              ]}
              onPress={handleRegister}
              disabled={!formValid || isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Create account">
              <Text style={styles.createButtonText}>
                {isSubmitting ? 'Creating account...' : 'Create account'}
              </Text>
            </Pressable>

            {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.orText}>OR</Text>
              <View style={styles.divider} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.googleButton, pressed && styles.lightPressed]}
              onPress={handleGoogleRegister}
              disabled={isGoogleSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Join with Google">
              <GoogleMark />
              <Text style={styles.googleText}>
                {isGoogleSubmitting ? 'Opening Google...' : 'Join with Google'}
              </Text>
            </Pressable>

            <View style={styles.loginPromptRow}>
              <Text style={styles.loginPrompt}>Already have an account? </Text>
              <Pressable
                onPress={() => router.replace('./login')}
                style={({ pressed }) => pressed && styles.pressed}
                accessibilityRole="button"
                accessibilityLabel="Login">
                <Text style={styles.loginLink}>Login</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function RoleOption({
  title,
  subtitle,
  icon,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.roleOption,
        selected && styles.roleOptionSelected,
        pressed && styles.rolePressed,
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}>
      <View style={styles.roleIconBox}>
        <Image source={icon} style={styles.roleIcon} resizeMode="contain" />
      </View>
      <View style={styles.roleCopy}>
        <View style={styles.roleTitleRow}>
          <Text style={styles.roleTitle}>{title}</Text>
          {selected && <View style={styles.selectedDot} />}
        </View>
        <Text style={styles.roleSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      {visible ? (
        <>
          <Path
            d="M2.04 12.32a1 1 0 0 1 0-.64C3.42 7.51 7.36 4.5 12 4.5s8.58 3.01 9.96 7.18a1 1 0 0 1 0 .64C20.58 16.49 16.64 19.5 12 19.5s-8.58-3.01-9.96-7.18Z"
            stroke="#A6A6AB"
            strokeWidth={1.8}
          />
          <Path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" stroke="#A6A6AB" strokeWidth={1.8} />
        </>
      ) : (
        <Path
          d="m3 3 18 18M10.58 10.58a2 2 0 0 0 2.83 2.83M9.88 5.1A10.5 10.5 0 0 1 12 4.5c4.76 0 8.77 3.16 10.07 7.5a10.5 10.5 0 0 1-4.3 5.77M6.23 6.23A10.5 10.5 0 0 0 1.93 12c1.3 4.34 5.31 7.5 10.07 7.5.99 0 1.95-.14 2.86-.4"
          stroke="#A6A6AB"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}

function GoogleMark() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityLabel="Google">
      <Path fill="#4285F4" d="M21.35 12.27c0-.78-.07-1.53-.22-2.25H12v4.26h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.15c1.85-1.7 2.9-4.2 2.9-7.4Z" />
      <Path fill="#34A853" d="M12 21.5c2.65 0 4.87-.88 6.49-2.38l-3.15-2.45c-.87.58-1.98.92-3.34.92-2.56 0-4.73-1.73-5.51-4.06H3.23V16.06A9.8 9.8 0 0 0 12 21.5Z" />
      <Path fill="#FBBC05" d="M6.49 13.53a5.9 5.9 0 0 1 0-3.76V7.04H3.23a9.8 9.8 0 0 0 0 9.22l3.26-2.73Z" />
      <Path fill="#EA4335" d="M12 5.71c1.45 0 2.75.5 3.77 1.49l2.83-2.83C16.86 2.77 14.65 1.5 12 1.5a9.8 9.8 0 0 0-8.77 5.54l3.26 2.73C7.27 7.44 9.44 5.71 12 5.71Z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BACKGROUND },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8 },
  backButton: { alignSelf: 'flex-start' },
  backText: { color: '#FFFFFF', fontFamily: 'Agrandir', fontSize: 16, lineHeight: 22 },
  pressed: { opacity: 0.5 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 28 },
  brandSection: { alignItems: 'center', marginBottom: 22 },
  logo: { width: 80, height: 80, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline' },
  titleLead: { color: '#FFFFFF', fontFamily: 'Agrandir', fontSize: 27, lineHeight: 38 },
  titleBrand: { color: YELLOW, fontFamily: 'LeagueSpartanExtraBold', fontSize: 38, lineHeight: 38 },
  titlePeriod: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 34, lineHeight: 38 },
  subtitle: { color: '#929296', fontFamily: 'Roboto', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 6, maxWidth: 290 },
  form: { gap: 16 },
  sectionLabel: { color: '#D4D4D7', fontFamily: 'LeagueSpartanBold', fontSize: 15, lineHeight: 20 },
  roleRow: { flexDirection: 'row', gap: 12 },
  roleOption: { flex: 1, minHeight: 78, borderRadius: 17, borderWidth: 1, borderColor: '#3B3B40', backgroundColor: '#1D1D1F', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  roleOptionSelected: { borderWidth: 2, borderColor: YELLOW, backgroundColor: '#202022' },
  rolePressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  roleIconBox: { width: 39, height: 39, borderRadius: 12, backgroundColor: '#29292C', alignItems: 'center', justifyContent: 'center' },
  roleIcon: { width: 32, height: 32 },
  roleCopy: { flex: 1 },
  roleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  roleTitle: { color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 16, lineHeight: 19 },
  selectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: YELLOW },
  roleSubtitle: { color: '#A8A8AC', fontFamily: 'Roboto', fontSize: 11, lineHeight: 16 },
  fieldGroup: { gap: 7 },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { color: '#D4D4D7', fontFamily: 'RobotoExtraBold', fontSize: 12, letterSpacing: 0.7 },
  available: { color: '#25D99B', fontFamily: 'Roboto', fontSize: 13 },
  input: { height: 60, borderRadius: 14, borderWidth: 1, borderColor: '#36363B', backgroundColor: '#202023', color: '#FFFFFF', fontFamily: 'Roboto', fontSize: 17, paddingHorizontal: 20 },
  inputError: { borderColor: '#FF6969' },
  errorLabel: { color: '#FF7676' },
  passwordInputWrap: { position: 'relative' },
  passwordInput: { paddingRight: 54 },
  eyeButton: { position: 'absolute', right: 14, top: 19, padding: 1 },
  passwordHint: { color: '#9A9A9F', fontFamily: 'Roboto', fontSize: 11, lineHeight: 16 },
  errorText: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 12, lineHeight: 17 },
  submitError: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: -8 },
  terms: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12, lineHeight: 19, textAlign: 'center', paddingHorizontal: 12, marginTop: 2 },
  termsLink: { color: '#E8E8EA', textDecorationLine: 'underline' },
  createButton: { height: 58, borderRadius: 15, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  createButtonDisabled: { backgroundColor: '#6A6A6D' },
  createButtonText: { color: '#090909', fontFamily: 'RobotoExtraBold', fontSize: 17 },
  yellowPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 },
  divider: { flex: 1, height: 1, backgroundColor: '#303035' },
  orText: { color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 12, letterSpacing: 1.8 },
  googleButton: { height: 58, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  googleText: { color: '#171717', fontFamily: 'Roboto', fontSize: 18 },
  lightPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  loginPromptRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 14 },
  loginPrompt: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 16 },
  loginLink: { color: YELLOW, fontFamily: 'LeagueSpartanBold', fontSize: 18 , marginBottom: 4},
});