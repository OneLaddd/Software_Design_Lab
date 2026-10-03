import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type ConfirmationModalProps = {
  visible: boolean;
  title: string;
  message?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmationModal({
  visible,
  title,
  message,
  cancelLabel = 'No',
  confirmLabel = 'Yes',
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmationModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert" accessibilityViewIsModal>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={onCancel} disabled={busy} style={styles.cancelButton} accessibilityRole="button">
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable onPress={onConfirm} disabled={busy} style={[styles.confirmButton, busy && styles.disabled]} accessibilityRole="button">
              <Text style={styles.confirmText}>{busy ? 'Please wait…' : confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#1A1919',
    borderColor: '#343232',
    borderWidth: 1,
    borderRadius: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
    textAlign: 'center',
  },
  message: {
    marginTop: 10,
    color: '#B7B4B4',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#292828',
    borderColor: '#403F3F',
    borderWidth: 1,
    borderRadius: 12,
  },
  cancelText: { color: '#D4D1D1', fontSize: 14, fontWeight: '600' },
  confirmButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#FFE600',
    borderRadius: 12,
  },
  confirmText: { color: '#121212', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.65 },
});
