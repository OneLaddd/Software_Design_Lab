import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileAvatar } from '@/components/profile-avatar';
import { supabase } from '../lib/supabase';

export interface DrawerProfile {
  id?: string;
  username?: string | null;
  avatar_url?: string | null;
  active_role?: string | null;
}

interface NavigationDrawerProps {
  visible: boolean;
  onClose: () => void;
  profile?: DrawerProfile | null;
}

export function NavigationDrawer({ visible, onClose, profile }: NavigationDrawerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.78, 300);

  const [currentProfile, setCurrentProfile] = useState<DrawerProfile | null>(profile ?? null);

  useEffect(() => {
    if (profile) {
      setCurrentProfile(profile);
    }
  }, [profile]);

  useEffect(() => {
    if (!visible) return;

    async function fetchUserProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, active_role')
          .eq('id', user.id)
          .maybeSingle();

        if (!error && data) {
          setCurrentProfile(data);
        }
      } catch (err) {
        console.warn('Could not load profile in drawer:', err);
      }
    }

    if (!profile) {
      fetchUserProfile();
    }
  }, [visible, profile]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Logout error:', err);
    }
    onClose();
    router.replace('/login' as any);
  };

  const usernameDisplay = currentProfile?.username ? `@${currentProfile.username}` : '@user';
  const roleDisplay = currentProfile?.active_role === 'client' ? 'Client' : 'Hunter';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Scrim backdrop */}
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close navigation drawer"
        />

        {/* Drawer Panel */}
        <View
          style={[
            styles.drawer,
            {
              width: drawerWidth,
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}>
          <View style={styles.topSection}>
            {/* Header row: Brand logo and close button */}
            <View style={styles.brandRow}>
              <View style={styles.logoRow}>
                <Text style={styles.brandYellow}>commis</Text>
                <Text style={styles.brandWhite}>.</Text>
              </View>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Close menu">
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </Pressable>
            </View>

            {/* User Profile Header Card */}
            <View style={styles.profileHeaderCard}>
              <View style={styles.avatarGlowRing}>
                <ProfileAvatar
                  avatarUrl={currentProfile?.avatar_url}
                  size={48}
                  style={styles.avatarImage}
                  accessibilityLabel={`${usernameDisplay} profile avatar`}
                />
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.usernameText} numberOfLines={1}>
                  {usernameDisplay}
                </Text>
                <View style={styles.roleBadgeContainer}>
                  <Text style={styles.roleBadgeText}>{roleDisplay}</Text>
                </View>
              </View>
            </View>

            {/* Divider line */}
            <View style={styles.divider} />

            {/* Main Navigation Items */}
            <View style={styles.navMenu}>
              {/* Profile */}
              <Pressable
                style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
                onPress={() => {
                  // TODO: Navigate to Profile screen
                }}>
                <View style={styles.navItemLeft}>
                  <View style={styles.iconBox}>
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z"
                        stroke="#D1D5DB"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </View>
                  <Text style={styles.navItemLabel}>Profile</Text>
                </View>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M9 5l7 7-7 7"
                    stroke="#6B7280"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </Pressable>

              {/* Commissions / Orders */}
              <Pressable
                style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
                onPress={() => {
                  // TODO: Navigate to Commissions screen
                }}>
                <View style={styles.navItemLeft}>
                  <View style={styles.iconBox}>
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M21 13.255A23.931 23.931 0 0 1 12 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2m4 6h.01M5 20h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"
                        stroke="#D1D5DB"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </View>
                  <Text style={styles.navItemLabel}>Commissions</Text>
                </View>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M9 5l7 7-7 7"
                    stroke="#6B7280"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </Pressable>

              {/* Marked Bounties */}
              <Pressable
                style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
                onPress={() => {
                  // TODO: Navigate to Marked Bounties screen
                }}>
                <View style={styles.navItemLeft}>
                  <View style={styles.iconBox}>
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z"
                        stroke="#D1D5DB"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </View>
                  <Text style={styles.navItemLabel}>Marked Bounties</Text>
                </View>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M9 5l7 7-7 7"
                    stroke="#6B7280"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </Pressable>

              {/* Liked Posts */}
              <Pressable
                style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
                onPress={() => {
                  // TODO: Navigate to Liked Posts screen
                }}>
                <View style={styles.navItemLeft}>
                  <View style={styles.iconBox}>
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M4.318 6.318a4.5 4.5 0 0 0 0 6.364L12 20.364l7.682-7.682a4.5 4.5 0 0 0-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 0 0-6.364 0z"
                        stroke="#D1D5DB"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </View>
                  <Text style={styles.navItemLabel}>Liked Posts</Text>
                </View>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M9 5l7 7-7 7"
                    stroke="#6B7280"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </Pressable>

              {/* Communities */}
              <Pressable
                style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
                onPress={() => {
                  // TODO: Navigate to Communities screen
                }}>
                <View style={styles.navItemLeft}>
                  <View style={styles.iconBox}>
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm6 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"
                        stroke="#D1D5DB"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </View>
                  <Text style={styles.navItemLabel}>Communities</Text>
                </View>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M9 5l7 7-7 7"
                    stroke="#6B7280"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </Pressable>
            </View>
          </View>

          {/* Drawer Footer */}
          <View style={styles.footer}>
            <View style={styles.versionRow}>
              <Text style={styles.versionBrand}>COMMIS</Text>
              <Text style={styles.versionNumber}>v1.0.0</Text>
            </View>

            {/* Logout button */}
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutPressed]}
              accessibilityRole="button"
              accessibilityLabel="Log Out">
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1"
                  stroke="#F87171"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              <Text style={styles.logoutText}>Log Out</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  drawer: {
    backgroundColor: '#171717',
    borderLeftWidth: 1,
    borderLeftColor: '#2A2A2A',
    paddingHorizontal: 20,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  topSection: {
    flex: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingTop: 4,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brandYellow: {
    color: '#FFE600',
    fontFamily: 'LeagueSpartanExtraBold',
    fontSize: 38,
    lineHeight: 38,
  },
  brandWhite: {
    color: '#FFFFFF',
    fontFamily: 'LeagueSpartanExtraBold',
    fontSize: 38,
    lineHeight: 38,
  },
  closeButton: {
    padding: 6,
  },
  pressed: {
    opacity: 0.7,
  },
  profileHeaderCard: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#1D1D1D',
    borderWidth: 1,
    borderColor: '#292929',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarGlowRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    padding: 2,
    backgroundColor: '#FFE600',
    shadowColor: '#FFE600',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    backgroundColor: '#111',
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  usernameText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  roleBadgeContainer: {
    marginTop: 3,
  },
  roleBadgeText: {
    color: '#FFE600',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  divider: {
    height: 1,
    backgroundColor: '#262626',
    marginVertical: 18,
  },
  navMenu: {
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  navItemPressed: {
    backgroundColor: '#222222',
  },
  navItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    backgroundColor: '#FFE600',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countBadgeText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '700',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#232323',
    paddingTop: 16,
    gap: 12,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  versionBrand: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  versionNumber: {
    color: '#4B5563',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(69, 10, 10, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(127, 29, 29, 0.4)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  logoutPressed: {
    backgroundColor: 'rgba(69, 10, 10, 0.45)',
  },
  logoutText: {
    color: '#F87171',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
