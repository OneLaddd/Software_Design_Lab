import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CloseRequestSheetProps {
  visible: boolean;
  title: string;
  budget: string;
  bidCount: number | null;
  isClosing: boolean;
  error: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function CloseRequestSheet({
  visible,
  title,
  budget,
  bidCount,
  isClosing,
  error,
  onConfirm,
  onDismiss,
}: CloseRequestSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} disabled={isClosing} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.irreversible}>IRREVERSIBLE ACTION</Text>
                <Text style={styles.heading}>Close This Request?</Text>
              </View>
            </View>

            <Text style={styles.bodyCopy}>
              This will stop Hunters from submitting new bids. Existing bids will remain visible to you, but you will no longer receive new bids.
            </Text>

            <View style={styles.previewCard}>
              <Text style={styles.previewLabel}>TARGET BOUNTY</Text>
              <View style={styles.previewRow}>
                <View style={styles.previewIcon}>
                  <Svg width={20} height={20} viewBox="0 0 24 24">
                    <Path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 0 5 22V4.5ZM5 5v17M2 5h3" stroke="#FFE600" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </Svg>
                </View>
                <View style={styles.previewInfo}>
                  <Text style={styles.requestTitle} numberOfLines={1}>{title}</Text>
                  <View style={styles.previewMeta}>
                    <Text style={styles.budget}>{budget}</Text>
                    <Text style={styles.dot}>•</Text>
                    <Text style={styles.bidCount}>{bidCount == null ? '—' : bidCount} Bids Submitted</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.impactCard}>
              <Text style={styles.impactHeading}>WHAT HAPPENS NEXT</Text>
              <ImpactRow tone="danger" title="No new bids can be submitted" body="The listing will be archived from public hunter dispatch boards immediately." />
              <ImpactRow tone="muted" title={`${bidCount == null ? 'Existing' : bidCount} proposals remain saved`} body="All current submissions remain archived, filtered, and reviewable in Manage Bids." />
              <ImpactRow tone="yellow" title="Accept or message anytime" body="You can still award the contract to an existing candidate or negotiate terms." />
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable onPress={onConfirm} disabled={isClosing} style={[styles.confirmButton, isClosing && styles.disabled]} accessibilityRole="button">
              {isClosing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>Close Request</Text>}
            </Pressable>
            <Pressable onPress={onDismiss} disabled={isClosing} style={styles.dismissButton} accessibilityRole="button">
              <Text style={styles.dismissText}>Keep Open</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ImpactRow({
  tone,
  title,
  body,
}: {
  tone: 'danger' | 'muted' | 'yellow';
  title: string;
  body: string;
}) {
  return (
    <View style={styles.impactRow}>
      <View style={styles.impactIcon}>
        <Text style={[styles.impactGlyph, styles[`impactGlyph_${tone}`]]}>
          {tone === 'danger' ? '-' : tone === 'muted' ? '-' : '-'}
        </Text>
      </View>
      <View style={styles.impactText}>
        <Text style={styles.impactTitle}>{title}</Text>
        <Text style={styles.impactBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.74)' },
  sheet: { maxHeight: '92%', paddingHorizontal: 21, paddingTop: 11, gap: 12, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#1C1B1B' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#555555' },
  content: { gap: 15, paddingBottom: 2 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  iconBox: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: 'rgba(255,107,107,0.14)' },
  heroText: { flex: 1, gap: 2 },
  irreversible: { color: '#FF7777', fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: 0.6 },
  heading: { color: '#E5E2E1', fontFamily: 'LeagueSpartanExtraBold', fontSize: 23 },
  bodyCopy: { color: '#C8C6B9', fontFamily: 'Roboto', fontSize: 14, lineHeight: 21 },
  previewCard: { padding: 14, gap: 11, borderRadius: 13, backgroundColor: '#242323' },
  previewLabel: { color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: 0.6 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#353534' },
  previewInfo: { flex: 1, minWidth: 0, gap: 3 },
  requestTitle: { color: '#E5E2E1', fontFamily: 'LeagueSpartanBold', fontSize: 16 },
  previewMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  budget: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  dot: { color: '#A6A6AB' },
  bidCount: { color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 11 },
  impactCard: { padding: 14, gap: 13, borderRadius: 13, backgroundColor: '#141414' },
  impactHeading: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 11, letterSpacing: 0.6 },
  impactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  impactIcon: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#0E0E0E' },
  impactGlyph: { fontFamily: 'RobotoExtraBold', fontSize: 15 },
  impactGlyph_danger: { color: '#FF7777' },
  impactGlyph_muted: { color: '#C8C6B9' },
  impactGlyph_yellow: { color: '#FFE600' },
  impactText: { flex: 1, gap: 2 },
  impactTitle: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 13 },
  impactBody: { color: '#AAA8A2', fontFamily: 'Roboto', fontSize: 12, lineHeight: 17 },
  errorText: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 13 },
  actions: { gap: 8, paddingTop: 1 },
  confirmButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#93000A' },
  confirmText: { color: '#FFDAD6', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  disabled: { opacity: 0.55 },
  dismissButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#2A2A2A' },
  dismissText: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 14 },
});