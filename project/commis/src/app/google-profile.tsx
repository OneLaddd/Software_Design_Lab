import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

const YELLOW = '#FDE400';
const BACKGROUND = '#302F2D';

type Role = 'client' | 'hunter';

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(value);
}

export default function GoogleProfileScreen() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('hunter');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('your Google account');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted || !data.user) return;
      const metadata = data.user.user_metadata ?? {};
      setFullName(metadata.full_name ?? metadata.name ?? data.user.email ?? 'your Google account');
      setAvatarUrl(metadata.avatar_url ?? metadata.picture ?? '');
    });

    return () => {
      mounted = false;
    };
  }, []);

  const usernameValid = isValidUsername(username);

  const handleContinue = async () => {
    setUsernameTouched(true);
    setSubmitError('');
    if (!usernameValid) return;

    setIsSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      setIsSubmitting(false);
      setSubmitError('Your Google session expired. Please try again');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ username: username.trim(), active_role: role })
      .eq('id', user.id);

    setIsSubmitting(false);

    if (error) {
      const message = error.message.toLowerCase();
      setSubmitError(
        message.includes('duplicate') || message.includes('unique') || message.includes('username')
          ? 'That username is taken'
          : 'Something went wrong, try again'
      );
      return;
    }

    router.replace({
      pathname: '/login',
      params: { google: '1', email: user.email ?? '' },
    });
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarGlow} />
            <View style={styles.avatarFrame}>
              <Image
                source={
                  avatarUrl && !avatarFailed
                    ? { uri: avatarUrl }
                    : require('@/assets/images/logo.png')
                }
                onError={() => setAvatarFailed(true)}
                style={styles.avatar}
                resizeMode="cover"
              />
            </View>
            <View style={styles.googleBadge}>
              <GoogleMark />
            </View>
            <Text style={styles.heading}>Almost there.</Text>
            <Text style={styles.subheading}>Just need a couple things to get you set up.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>I AM A...</Text>
              <Text style={styles.sectionHint}>Select primary role</Text>
            </View>

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

            <View style={styles.usernameSection}>
              <Text style={[styles.fieldLabel, usernameTouched && !usernameValid && styles.errorLabel]}>
                USERNAME
              </Text>
              <View style={[styles.usernameBox, usernameTouched && !usernameValid && styles.errorBorder]}>
                <Text style={styles.atSign}>@</Text>
                <TextInput
                  value={username}
                  onChangeText={(value) => {
                    setUsername(value);
                    setUsernameTouched(true);
                    setSubmitError('');
                  }}
                  placeholder={fullName}
                  placeholderTextColor="#A6A6AB"
                  autoCapitalize="none"
                  style={styles.usernameInput}
                  accessibilityLabel="Username"
                />
                {username.length > 0 && (
                  <Pressable
                    onPress={() => setUsername('')}
                    style={({ pressed }) => pressed && styles.pressed}
                    accessibilityRole="button"
                    accessibilityLabel="Clear username">
                    <Text style={styles.clearButton}>⊗</Text>
                  </Pressable>
                )}
              </View>
              {usernameTouched && !usernameValid ? (
                <Text style={styles.errorText}>Use 3-20 letters, numbers, or underscores</Text>
              ) : (
                <Text style={styles.helperText}>
                  You can keep this auto-generated handle or create your own.
                </Text>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.continueButton,
                !usernameValid && styles.continueDisabled,
                pressed && usernameValid && styles.pressedContinue,
              ]}
              onPress={handleContinue}
              disabled={!usernameValid || isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Continue">
              <Text style={styles.continueText}>{isSubmitting ? 'Setting up...' : 'Continue'}</Text>
              <Text style={styles.arrow}>→</Text>
            </Pressable>

            {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
            <Text style={styles.footerHint}>You can change these anytime in your profile settings.</Text>
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
        selected ? styles.roleOptionSelected : styles.roleOptionInactive,
        pressed && styles.pressedRole,
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}>
      {selected && <View style={styles.cardBadge} />}
      <Image source={icon} style={styles.roleIcon} resizeMode="contain" />
      <Text style={styles.roleTitle}>{title}</Text>
      {selected && <View style={styles.titleDot} />}
      <Text style={styles.roleSubtitle}>{subtitle}</Text>
    </Pressable>
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
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 12 },
  profileHeader: { alignItems: 'center', marginBottom: 28 },
  avatarGlow: { position: 'absolute', top: 0, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(253, 228, 0, 0.12)' },
  avatarFrame: { width: 116, height: 116, borderRadius: 58, padding: 4, backgroundColor: '#1D1D1F', borderWidth: 2, borderColor: '#DEC800', shadowColor: '#FDE400', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 5 },
  avatar: { width: '100%', height: '100%', borderRadius: 54 },
  googleBadge: { position: 'absolute', top: 88, right: '28%', width: 32, height: 32, borderRadius: 16, backgroundColor: '#0E0E0E', alignItems: 'center', justifyContent: 'center' },
  heading: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 34, lineHeight: 40, marginTop: 20 },
  subheading: { color: '#CDC7AA', fontFamily: 'Roboto', fontSize: 17, lineHeight: 24, textAlign: 'center', marginTop: 2 },
  form: { flex: 1, gap: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 14, letterSpacing: 0.7 },
  sectionHint: { color: '#CDC7AA', fontFamily: 'Roboto', fontSize: 13 },
  roleRow: { flexDirection: 'row', gap: 16 },
  roleOption: { flex: 1, height: 176, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 12, position: 'relative' },
  roleOptionInactive: { backgroundColor: '#1C1B1B' },
  roleOptionSelected: { backgroundColor: '#2A2A2A', borderWidth: 2, borderColor: YELLOW, shadowColor: YELLOW, shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  cardBadge: { position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: YELLOW },
  roleIcon: { width: 64, height: 64, marginBottom: 5 },
  roleTitle: { color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 25, lineHeight: 29 },
  titleDot: { position: 'absolute', top: 113, right: '28%', width: 9, height: 9, borderRadius: 5, backgroundColor: YELLOW },
  roleSubtitle: { color: '#CDC7AA', fontFamily: 'Roboto', fontSize: 15, lineHeight: 20, marginTop: 1 },
  pressedRole: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  usernameSection: { gap: 7, marginTop: 6 },
  fieldLabel: { color: '#CDC7AA', fontFamily: 'RobotoExtraBold', fontSize: 12, letterSpacing: 0.7 },
  errorLabel: { color: '#FF7676' },
  usernameBox: { height: 64, borderRadius: 14, backgroundColor: '#1C1B1B', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' },
  errorBorder: { borderWidth: 1, borderColor: '#FF6969' },
  atSign: { color: '#CDC7AA', fontFamily: 'RobotoExtraBold', fontSize: 20, marginRight: 4 },
  usernameInput: { flex: 1, color: '#FFFFFF', fontFamily: 'Roboto', fontSize: 18, paddingVertical: 0 },
  clearButton: { color: '#CDC7AA', fontSize: 22 },
  helperText: { color: '#CDC7AA', fontFamily: 'Roboto', fontSize: 14, lineHeight: 20 },
  errorText: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 13, lineHeight: 18 },
  continueButton: { height: 64, borderRadius: 15, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12, marginTop: 'auto' },
  continueDisabled: { backgroundColor: '#77766C' },
  continueText: { color: '#201C00', fontFamily: 'LeagueSpartanExtraBold', fontSize: 23 },
  arrow: { color: '#201C00', fontFamily: 'Roboto', fontSize: 28, lineHeight: 28 },
  pressedContinue: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  submitError: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 13, textAlign: 'center', marginTop: -8 },
  footerHint: { color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 11, lineHeight: 15, textAlign: 'center' },
  pressed: { opacity: 0.5 },
});
