import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowDown, ArrowUp } from 'lucide-react-native';

export function PostVoteBar({ score, userVote, onVote, compact = false }: { score: number; userVote: -1 | 0 | 1; onVote: (value: -1 | 1) => void; compact?: boolean }) {
  return <View style={[styles.bar, compact && styles.compact]}>
    <Pressable onPress={() => onVote(1)} accessibilityRole="button" accessibilityLabel="Upvote post" accessibilityState={{ selected: userVote === 1 }} style={styles.button}>
      <ArrowUp size={16} color={userVote === 1 ? '#FFE600' : '#B7B7B7'} strokeWidth={2.2} />
    </Pressable>
    <Text style={styles.score}>{score}</Text>
    <Pressable onPress={() => onVote(-1)} accessibilityRole="button" accessibilityLabel="Downvote post" accessibilityState={{ selected: userVote === -1 }} style={styles.button}>
      <ArrowDown size={16} color={userVote === -1 ? '#FFE600' : '#B7B7B7'} strokeWidth={2.2} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({ bar: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 36, paddingHorizontal: 8, borderRadius: 18, backgroundColor: '#252525' }, compact: { gap: 6, minHeight: 30, paddingHorizontal: 6 }, button: { padding: 5 }, score: { color: '#E7E7E7', fontFamily: 'RobotoExtraBold', fontSize: 11, minWidth: 14, textAlign: 'center' } });
