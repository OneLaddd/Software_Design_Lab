import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

const verticalVideo = require('@/assets/videos/start-video-vertical.mp4');
const landscapeVideo = require('@/assets/videos/start-video-landscape.mp4');

export default function StartPageScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 800;
  const videoSource = isDesktop ? landscapeVideo : verticalVideo;
  const [videoReady, setVideoReady] = useState(false);

  const player = useVideoPlayer(videoSource, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.staysActiveInBackground = true;
    videoPlayer.play();
  });

  useEffect(() => {
    let cancelled = false;
    setVideoReady(false);

    const statusSubscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        setVideoReady(true);
      }
    });

    (async () => {
      try {
        await player.replaceAsync(videoSource);
        if (!cancelled) {
          if (player.status === 'readyToPlay') setVideoReady(true);
          player.play();
        }
      } catch {
      }
    })();

    return () => {
      cancelled = true;
      statusSubscription.remove();
    };
  }, [player, videoSource]);

  return (
    <View style={styles.root}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
      {!videoReady && (
        <Image
          source={
            isDesktop
              ? require('@/assets/images/start-video-landscape-poster.jpg')
              : require('@/assets/images/start-video-vertical-poster.jpg')
          }
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
      <View style={styles.videoOverlay} pointerEvents="none" />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={[styles.header, isDesktop && styles.desktopHeader]}>
          <View />
          <View style={styles.headerActions}>
            <Pressable style={({ pressed }) => pressed && styles.pressedControl}>
              <Text style={styles.headerLink}>Login</Text>
            </Pressable>
            <Pressable style={({ pressed }) => pressed && styles.pressedControl}>
              <Text style={styles.headerLink}>Skip</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.content, isDesktop && styles.desktopContent]}>
          <Image
            source={require('@/assets/images/commis-title.png')}
            style={[styles.brand, isDesktop && styles.desktopBrand]}
            resizeMode="contain"
          />
          <Text style={[styles.tagline, isDesktop && styles.desktopTagline]}>
            Name your bounty.
          </Text>

          <View style={[styles.roleSection, isDesktop && styles.desktopRoleSection]}>
            <Text style={[styles.prompt, isDesktop && styles.desktopPrompt]}>I am a...</Text>
            <View style={[styles.roles, isDesktop && styles.desktopRoles]}>
              <RoleCard
                title="Client"
                body={'I\'m looking for\ncreators to bring\nmy vision to life.'}
                icon={require('@/assets/images/client-icon.png')}
                color="#B8780B"
              />
              <RoleCard
                title="Hunter"
                body={'I have the\nskills to fulfill\nyour work.'}
                icon={require('@/assets/images/hunter-icon.png')}
                color="#A85A0D"
              />
            </View>
          </View>
        </View>
      </SafeAreaView>

      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(3, 2, 1, 0.18)', 'rgba(3, 2, 1, 0.78)']}
        locations={[0, 0.42, 1]}
        style={styles.bottomVignette}
      />
    </View>
  );
}

function RoleCard({
  title,
  body,
  icon,
  color,
}: {
  title: string;
  body: string;
  icon: number;
  color: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.roleCard,
        { backgroundColor: color },
        pressed && styles.pressedRoleCard,
      ]}>
      <Text style={styles.roleTitle}>{title}</Text>
      <Text style={styles.roleBody}>{body}</Text>
      <Image source={icon} style={styles.roleIcon} resizeMode="contain" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#17130D',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(7, 5, 3, 0.68)',
  },
  bottomVignette: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '52%',
    zIndex: 10,
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
  desktopHeader: {
    paddingHorizontal: 52,
    paddingTop: 22,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  headerLink: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
    fontFamily: 'Agrandir',
    textDecorationLine: 'underline',
  },
  pressedControl: {
    opacity: 0.55,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 22,
    paddingBottom: 0,
  },
  desktopContent: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 52,
    paddingBottom: 32,
  },
  brand: {
    width: '80%',
    height: 120,
    marginBottom: -30,
    // The logo asset includes transparent left padding, so its visible mark needs compensation.
    marginLeft: -18,
    alignSelf: 'flex-start',
  },
  desktopBrand: {
    width: 300,
    height: 76,
  },
  tagline: {
    color: '#FFFFFF',
    width: '90%',
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '400',
    fontFamily: 'Agrandir',
  },
  desktopTagline: {
    fontSize: 48,
    lineHeight: 56,
  },
  roleSection: {
    marginTop: 178,
  },
  desktopRoleSection: {
    alignSelf: 'flex-start',
    width: '62%',
    maxWidth: 620,
    marginTop: 74,
  },
  prompt: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '700',
    fontFamily: 'League Spartan',
    marginBottom: 20,
  },
  desktopPrompt: {
    textAlign: 'left',
    fontSize: 42,
    lineHeight: 48,
  },
  roles: {
    flexDirection: 'row',
    gap: 12,
  },
  desktopRoles: {
    gap: 18,
  },
  roleCard: {
    flex: 1,
    height: 350,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 3,
    paddingTop: 17,
    paddingBottom: 12,
    justifyContent: 'flex-start',
  },
  roleTitle: {
    color: '#FFF000',
    fontSize: 25,
    lineHeight: 30,
    marginBottom: 28,
    fontWeight: '800',
    fontFamily: 'League Spartan',
    textAlign: 'center',
  },
  roleBody: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 21,
    marginBottom: 18,
    fontWeight: '800',
    fontFamily: 'Open Sauce One',
    textAlign: 'center',
  },
  roleIcon: {
    width: 112,
    height: 100,
    alignSelf: 'center',
  },
  pressedRoleCard: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
});
