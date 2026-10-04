import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { Link as LinkIcon, List } from 'lucide-react-native';

type Format = 'bold' | 'italic' | 'link' | 'list';
type Props = Omit<TextInputProps, 'value' | 'onChangeText' | 'onSelectionChange' | 'selection'> & {
  value: string;
  onChangeText: (value: string) => void;
  toolbarStyle?: StyleProp<ViewStyle>;
  buttonColor?: string;
};

export function RichTextInput({ value, onChangeText, toolbarStyle, buttonColor = '#C9C4A6', ...inputProps }: Props) {
  const inputRef = useRef<TextInput>(null);
  const [selection, setSelection] = useState({ start: value.length, end: value.length });

  const format = (kind: Format) => {
    const start = Math.min(selection.start, value.length);
    const end = Math.min(selection.end, value.length);
    const selected = value.slice(start, end);
    let insertion = selected;
    let caret = start;
    if (kind === 'bold' || kind === 'italic') {
      const marker = kind === 'bold' ? '**' : '*';
      const content = selected || 'text';
      insertion = `${marker}${content}${marker}`;
      caret = selected ? start + insertion.length : start + marker.length;
    } else if (kind === 'link') {
      const content = selected || 'link text';
      insertion = `[${content}](https://)`;
      caret = selected ? start + insertion.length - 1 : start + content.length + 3;
    } else {
      const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      const prefix = value.slice(lineStart, start).startsWith('- ') ? '' : '- ';
      onChangeText(`${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`);
      caret = start + prefix.length;
      setSelection({ start: caret, end: caret });
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
    onChangeText(next);
    setSelection({ start: caret, end: caret });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return <View style={styles.container}>
    <TextInput
      {...inputProps}
      ref={inputRef}
      value={value}
      onChangeText={onChangeText}
      selection={selection}
      onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
    />
    <View style={[styles.toolbar, toolbarStyle]}>
      <Pressable onPress={() => format('bold')} style={styles.button} accessibilityRole="button" accessibilityLabel="Bold"><Text style={[styles.bold, { color: buttonColor }]}>B</Text></Pressable>
      <Pressable onPress={() => format('italic')} style={styles.button} accessibilityRole="button" accessibilityLabel="Italic"><Text style={[styles.italic, { color: buttonColor }]}>I</Text></Pressable>
      <Pressable onPress={() => format('link')} style={styles.button} accessibilityRole="button" accessibilityLabel="Insert link"><LinkIcon size={16} color={buttonColor} /></Pressable>
      <Pressable onPress={() => format('list')} style={styles.button} accessibilityRole="button" accessibilityLabel="Insert list"><List size={17} color={buttonColor} /></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 5 },
  toolbar: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 7, borderRadius: 8, backgroundColor: '#242424' },
  button: { minWidth: 25, minHeight: 30, alignItems: 'center', justifyContent: 'center' },
  bold: { fontFamily: 'RobotoExtraBold', fontSize: 15 },
  italic: { fontFamily: 'RobotoExtraBold', fontSize: 15, fontStyle: 'italic' },
});
