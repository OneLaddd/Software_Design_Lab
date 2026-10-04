import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';

export type BottomNavTab = 'market' | 'search' | 'home' | 'ideas' | 'messages';

interface BottomNavBarProps {
  activeTab?: BottomNavTab;
  onTabPress?: (tab: BottomNavTab) => void;
}

const TABS: { id: BottomNavTab; label: string }[] = [
  { id: 'market', label: 'Market' },
  { id: 'search', label: 'Search' },
  { id: 'home', label: 'Home' },
  { id: 'ideas', label: 'Ideas' },
  { id: 'messages', label: 'Messages' },
];

function TabIcon({ tab, color }: { tab: BottomNavTab; color: string }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24' };

  switch (tab) {
    case 'market':
      return <Svg {...common}><Path d="M4 4h16l1 4v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V9H7v1a2 2 0 0 1-2 2 2 2 0 0 1-2-2V8l1-4zm1 10h14v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-6zm3 2v3h8v-3H8z" fill={color} /></Svg>;
    case 'search':
      return <Svg {...common}><Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2.2} fill="none" /><Line x1={16.5} y1={16.5} x2={21} y2={21} stroke={color} strokeWidth={2.2} strokeLinecap="round" /></Svg>;
    case 'home':
      return <Svg {...common}><Path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill={color} /></Svg>;
    case 'ideas':
      return <Svg {...common}><Path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 6h8c1.5-1.5 3-3.5 3-6a7 7 0 0 0-7-7z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
    case 'messages':
      return <Svg {...common}><Path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" fill={color} /></Svg>;
  }
}

export function BottomNavBar({ activeTab = 'market', onTabPress }: BottomNavBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handlePress = (tabId: BottomNavTab) => {
    if (onTabPress) {
      onTabPress(tabId);
      return;
    }

    if (tabId === 'market') {
      router.replace('/marketplace' as any);
    } else if (tabId === 'search') {
      router.replace('/explore' as any);
    } else if (tabId === 'messages') {
      router.replace('/messages' as any);
    } else if (tabId === 'home') {
      router.replace('/home' as any);
    } else if (tabId === 'ideas') {
      router.replace('/posts' as any);
    }
    // Other tabs are no-ops / placeholders for this phase
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 6),
        },
      ]}>
      <View style={styles.dock}>
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityLabel={`${tab.label} Tab`}
              accessibilityState={{ selected: isActive }}
              onPress={() => handlePress(tab.id)}
              style={({ pressed }) => [styles.tabButton, pressed && styles.tabPressed]}>
              <View style={[styles.iconContainer, isActive && styles.activeIconCircle]}>
                <TabIcon tab={tab.id} color={isActive ? '#000000' : '#D1D5DB'} />
              </View>
              <Text style={[styles.tabLabel, isActive ? styles.activeLabel : styles.inactiveLabel]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#161616',
    borderTopWidth: 1,
    borderTopColor: '#282828',
    width: '100%',
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 60,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  iconContainer: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconCircle: {
    backgroundColor: '#FFE600',
    borderRadius: 18,
    shadowColor: '#FFE600',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  activeLabel: {
    color: '#FFE600',
    fontWeight: '700',
  },
  inactiveLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
  },
});
