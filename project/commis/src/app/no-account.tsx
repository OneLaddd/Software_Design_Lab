import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

const YELLOW = '#FFF000';
const BACKGROUND = '#302F2D';

export default function NoAccountScreen() {
  const router = useRouter();

  const handleBack = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      router.back();
    } else {
      router.replace('./');
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(0, 0, 0, 0.38)', 'rgba(0, 0, 0, 0.94)']}
        locations={[0, 0.45, 1]}
        style={styles.bottomShade}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [styles.textLink, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Text style={styles.headerLink}>Back</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.textLink, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Skip">
            <Text style={styles.headerLink}>Skip</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <View style={styles.titleRow}>
            <Text style={styles.titleLead}>Join </Text>
            <Text style={styles.titleBrand}>commis</Text>
            <Text style={styles.titlePeriod}>.</Text>
          </View>

          <Text style={styles.description}>
            Don&apos;t just browse from the sidelines. Create your account to start posting custom
            requests as a Client or claiming active commission slots as a Hunter.
          </Text>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.googleButton, pressed && styles.lightPressed]}
              accessibilityRole="button"
              accessibilityLabel="Join with Google">
              <GoogleMark />
              <Text style={styles.googleButtonText}>Join with Google</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.accountLinkButton, pressed && styles.pressed]}
              onPress={() => router.push('./register')}
              accessibilityRole="button"
              accessibilityLabel="Make your own account">
              <Text style={styles.accountLink}>I&apos;ll make my own account</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.existingButton, pressed && styles.yellowPressed]}
              onPress={() => router.replace('./login')}
              accessibilityRole="button"
              accessibilityLabel="I already have an account">
              <Image
                source={require('@/assets/images/logo.png')}
                style={styles.buttonLogo}
                resizeMode="contain"
              />
              <Text style={styles.existingButtonText}>I already have an account</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 28,
  },
  titleLead: {
    color: '#FFFFFF',
    fontFamily: 'Agrandir',
    fontSize: 32,
    lineHeight: 40,
  },
  titleBrand: {
    color: YELLOW,
    fontFamily: 'LeagueSpartanBold',
    fontSize: 40,
    lineHeight: 40
  },
  titlePeriod: {
    color: '#FFFFFF',
    fontFamily: 'LeagueSpartanBold',
    fontSize: 40,
    lineHeight: 40
  },
  description: {
    color: '#FFFFFF',
    fontFamily: 'Roboto',
    fontSize: 17,
    lineHeight: 26,
    marginBottom: 0,
  },
  actions: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingBottom: 80,
  },
  googleButton: {
    width: '100%',
    height: 56,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  googleButtonText: {
    color: '#141414',
    fontFamily: 'Roboto',
    fontSize: 18,
  },
  accountLink: {
    color: '#FFFFFF',
    fontFamily: 'Roboto',
    fontSize: 17,
    lineHeight: 24,
    textDecorationLine: 'underline',
    marginVertical: 10,
  },
  accountLinkButton: {
    width: '100%',
    alignItems: 'center',
  },
  existingButton: {
    width: '100%',
    height: 56,
    borderRadius: 15,
    backgroundColor: YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 26,
  },
  buttonLogo: {
    width: 34,
    height: 34,
  },
  existingButtonText: {
    color: '#111111',
    fontFamily: 'Roboto',
    fontSize: 18,
  },
  lightPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  yellowPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    zIndex: 0,
  },
});