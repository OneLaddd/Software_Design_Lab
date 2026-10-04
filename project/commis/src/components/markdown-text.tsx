import React from 'react';
import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

/** Renders the small Markdown subset produced by the post composer toolbar. */
export function MarkdownText({ children, style, numberOfLines, linkColor }: { children: string; style?: StyleProp<TextStyle>; numberOfLines?: number; linkColor?: string }) {
  const router = useRouter();
  const onMentionPress = async (username: string) => {
    const { data } = await supabase.from('profiles').select('id').ilike('username', username).maybeSingle();
    if (data?.id) router.push({ pathname: '/profile/[id]', params: { id: data.id } } as any);
  };
  const lines = children.split('\n');
  return <Text style={style} numberOfLines={numberOfLines}>{lines.map((line, index) => <React.Fragment key={index}>{index > 0 ? '\n' : ''}{renderInline(line.replace(/^\s*[-*]\s+/, '• '), '', onMentionPress, linkColor)}</React.Fragment>)}</Text>;
}

function renderInline(input: string, keyPrefix = '', onMentionPress: (username: string) => void, linkColor = '#FFE600'): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|@[A-Za-z0-9_]{3,20}\b)/g;
  const result: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input))) {
    if (match.index > cursor) result.push(input.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith('**')) result.push(<Text key={`${keyPrefix}${match.index}`} style={{ fontFamily: 'RobotoExtraBold' }}>{renderInline(token.slice(2, -2), `${keyPrefix}${match.index}-`, onMentionPress, linkColor)}</Text>);
    else if (token.startsWith('*')) result.push(<Text key={`${keyPrefix}${match.index}`} style={{ fontStyle: 'italic' }}>{renderInline(token.slice(1, -1), `${keyPrefix}${match.index}-`, onMentionPress, linkColor)}</Text>);
    else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) result.push(<Text key={`${keyPrefix}${match.index}`} style={{ color: linkColor, textDecorationLine: 'underline' }} onPress={() => { const url = link[2].startsWith('http') ? link[2] : `https://${link[2]}`; void Linking.openURL(url); }}>{link[1]}</Text>);
    } else if (match.index === 0 || !/[A-Za-z0-9_]/.test(input[match.index - 1])) {
      const username = token.slice(1);
      result.push(<Text key={`${keyPrefix}${match.index}`} style={{ color: linkColor, textDecorationLine: 'underline' }} onPress={() => onMentionPress(username)} accessibilityRole="link">{token}</Text>);
    } else result.push(token);
    cursor = match.index + token.length;
  }
  if (cursor < input.length) result.push(input.slice(cursor));
  return result;
}
