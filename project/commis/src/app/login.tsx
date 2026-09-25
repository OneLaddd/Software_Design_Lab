import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Toast } from '@/components/toast';
import { supabase } from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';

const YELLOW = '#FFF000';
const BACKGROUND = '#302F2D';

export default function LoginScreen() {
  const router = useRouter();
  const { created, email: createdEmail } = useLocalSearchParams<{
    created?: string;
    email?: string;
  }>();
  const [email, setEmail] = useState(createdEmail ?? '');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState(
    created === '1' ? '✔ Account Created' : '✔ Login Successful'
  );
  const [toastVisible, setToastVisible] = useState(created === '1');

  useEffect(() => {
    if (createdEmail) setEmail(createdEmail);
    if (created === '1') {
      setToastMessage('✔ Account Created');
      setToastVisible(true);
    }
  }, [created, createdEmail]);

  const hideToast = useCallback(() => setToastVisible(false), []);

  const handleLogin = async () => {
    setPasswordError('');
    if (!email.trim() || !password) {
      setPasswordError('Enter your email and password');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsSubmitting(false);

    if (error) {
      setPasswordError('Incorrect email or password');
      return;
    }

    setPassword('');
    setToastMessage('✔ Login Successful');
    setToastVisible(true);
    // TODO: navigate to feed/marketplace once main app screens exist
  };

  const handleGoogleLogin = async () => {
    setPasswordError('');
    setIsGoogleSubmitting(true);
    const { error, needsProfileSetup } = await signInWithGoogle();
    setIsGoogleSubmitting(false);

    if (error) {
      setPasswordError(error.message || 'Google sign-in failed. Try again');
      return;
    }

    if (needsProfileSetup) {
      router.replace('/google-profile');
      return;
    }

    setToastMessage('✔ Login Successful');
    setToastVisible(true);
    // TODO: navigate to feed/marketplace once main app screens exist
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(0, 0, 0, 0.3)', 'rgba(0, 0, 0, 0.92)']}
        locations={[0, 0.55, 1]}
        style={styles.bottomShade}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.textLink, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Text style={styles.headerLink}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <View style={styles.titleRow}>
            <Text style={styles.titleLead}>Welcome to </Text>
            <Text style={styles.titleBrand}>commis</Text>
            <Text style={styles.titlePeriod}>.</Text>
          </View>

          <Text style={styles.prompt}>Please enter your email and password.</Text>

          <View style={styles.form}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor="#A6A4A3"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
              accessibilityLabel="Email"
            />
            <View style={styles.passwordInputWrap}>
              <TextInput
                value={password}
                placeholder="Password"
                placeholderTextColor="#A6A4A3"
                secureTextEntry={!passwordVisible}
                onChangeText={(value) => {
                  setPassword(value);
                  setPasswordError('');
                }}
                style={[styles.input, styles.passwordInput]}
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
            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

            <Pressable
              style={({ pressed }) => [styles.continueButton, pressed && styles.lightPressed]}
              onPress={handleLogin}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Continue">
              <Text style={styles.lightButtonText}>
                {isSubmitting ? 'Signing in...' : 'Continue'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.googleButton, pressed && styles.lightPressed]}
              onPress={handleGoogleLogin}
              disabled={isGoogleSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Login with Google">
              <GoogleMark />
              <Text style={styles.lightButtonText}>
                {isGoogleSubmitting ? 'Opening Google...' : 'Login with Google'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.replace('./no-account')}
              style={({ pressed }) => [styles.accountLinkButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="I still do not have an account">
              <Text style={styles.accountLink}>I still don&apos;t have an account</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
      <Toast
        message={toastMessage}
        visible={toastVisible}
        onHide={hideToast}
      />
    </View>
  );
}

function GoogleMark() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityLabel="Google">
      <Path
        fill="#4285F4"
        d="M21.35 12.27c0-.78-.07-1.53-.22-2.25H12v4.26h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.15c1.85-1.7 2.9-4.2 2.9-7.4Z"
      />
      <Path
        fill="#34A853"
        d="M12 21.5c2.65 0 4.87-.88 6.49-2.38l-3.15-2.45c-.87.58-1.98.92-3.34.92-2.56 0-4.73-1.73-5.51-4.06H3.23V16.06A9.8 9.8 0 0 0 12 21.5Z"
      />
      <Path
        fill="#FBBC05"
        d="M6.49 13.53a5.9 5.9 0 0 1 0-3.76V7.04H3.23a9.8 9.8 0 0 0 0 9.22l3.26-2.73Z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.71c1.45 0 2.75.5 3.77 1.49l2.83-2.83C16.86 2.77 14.65 1.5 12 1.5a9.8 9.8 0 0 0-8.77 5.54l3.26 2.73C7.27 7.44 9.44 5.71 12 5.71Z"
      />
    </Svg>
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  textLink: {
    alignSelf: 'flex-start',
  },
  headerLink: {
    color: '#FFFFFF',
    fontFamily: 'Agrandir',
    fontSize: 16,
    lineHeight: 22,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.5,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  logo: {
    width: 130,
    height: 130,
    alignSelf: 'center',
    marginBottom: 20,
  },
  titleRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 32,
  },
  titleLead: {
    color: '#FFFFFF',
    fontFamily: 'Agrandir',
    fontSize: 27,
    lineHeight: 38,
  },
  titleBrand: {
    color: YELLOW,
    fontFamily: 'LeagueSpartanBold',
    fontSize: 37,
    lineHeight: 38,
  },
  titlePeriod: {
    color: '#FFFFFF',
    fontFamily: 'LeagueSpartanBold',
    fontSize: 34,
    lineHeight: 38,
  },
  prompt: {
    color: '#FFFFFF',
    fontFamily: 'Roboto',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  form: {
    gap: 16,
  },
  input: {
    height: 56,
    borderRadius: 13,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#666361',
    color: '#FFFFFF',
    fontFamily: 'Roboto',
    fontSize: 16,
    paddingHorizontal: 20,
  },
  passwordInputWrap: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 54,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 17,
    padding: 1,
  },
  errorText: {
    color: '#FF7676',
    fontFamily: 'Roboto',
    fontSize: 13,
    lineHeight: 18,
    marginTop: -8,
  },
  continueButton: {
    height: 56,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  googleButton: {
    height: 56,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  lightButtonText: {
    color: '#141414',
    fontFamily: 'Roboto',
    fontSize: 17,
  },
  accountLinkButton: {
    alignItems: 'center',
    marginTop: 4,
  },
  accountLink: {
    color: '#FFFFFF',
    fontFamily: 'Roboto',
    fontSize: 17,
    lineHeight: 24,
    textDecorationLine: 'underline',
  },
  lightPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '38%',
  },
});