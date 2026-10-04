import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RichTextInput } from '@/components/rich-text-input';

export interface BidDraft {
  amount: number;
  message: string;
}

interface BidComposerModalProps {
  visible: boolean;
  mode: 'create' | 'edit';
  requestTitle: string;
  requestBudget: string;
  minimumBudget: number | null;
  maximumBudget: number | null;
  initialAmount?: number | null;
  initialMessage?: string | null;
  isSubmitting: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (draft: BidDraft) => void;
  onWithdraw?: () => void;
  isWithdrawing?: boolean;
}

export function BidComposerModal({
  visible,
  mode,
  requestTitle,
  requestBudget,
  minimumBudget,
  maximumBudget,
  initialAmount,
  initialMessage,
  isSubmitting,
  error,
  onCancel,
  onSubmit,
  onWithdraw,
  isWithdrawing = false,
}: BidComposerModalProps) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!visible) return;
    setAmount(initialAmount == null ? '' : String(initialAmount));
    setMessage(initialMessage ?? '');
  }, [initialAmount, initialMessage, visible]);

  const numericAmount = Number(amount);
  const amountValid =
    amount.trim() !== '' &&
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    (minimumBudget == null || numericAmount >= minimumBudget) &&
    (maximumBudget == null || numericAmount <= maximumBudget);

  const validationMessage = amount.trim()
    ? !Number.isFinite(numericAmount) || numericAmount <= 0
      ? 'Enter a bid greater than zero.'
      : minimumBudget != null && numericAmount < minimumBudget
        ? `Your bid must be at least ₱${minimumBudget.toLocaleString()}.`
        : maximumBudget != null && numericAmount > maximumBudget
          ? `Your bid cannot exceed ₱${maximumBudget.toLocaleString()}.`
          : ''
    : '';

  const adjustAmount = (delta: number) => {
    const nextAmount = Math.max(0, (Number(amount) || minimumBudget || 0) + delta);
    setAmount(String(nextAmount));
  };

  const handleSubmit = () => {
    if (!amountValid || isSubmitting) return;
    onSubmit({ amount: numericAmount, message: message.trim() });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Close bid form" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.title}>{mode === 'edit' ? 'Edit Your Bid' : 'Place Your Bid'}</Text>
            <Pressable onPress={onCancel} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.requestCard}>
            <Text style={styles.requestLabel}>REQUEST</Text>
            <Text style={styles.requestTitle} numberOfLines={2}>{requestTitle}</Text>
            <Text style={styles.requestBudget}>Bounty Budget: {requestBudget} PHP</Text>
          </View>

          <View style={styles.fieldHeader}>
            <Text style={styles.fieldLabel}>BID AMOUNT <Text style={styles.required}>*</Text></Text>
            <Text style={styles.currencyText}>PHP CURRENCY</Text>
          </View>
          <View style={styles.amountControl}>
            <Pressable onPress={() => adjustAmount(-5)} style={styles.stepperButton} accessibilityRole="button" accessibilityLabel="Decrease bid by five pesos">
              <Text style={styles.stepperText}>−</Text>
            </Pressable>
            <View style={styles.amountEntry}>
              <Text style={styles.currencySymbol}>₱</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor="#737373"
                keyboardType="decimal-pad"
                style={styles.amountInput}
                accessibilityLabel="Bid amount in pesos"
              />
            </View>
            <Pressable onPress={() => adjustAmount(5)} style={styles.stepperButton} accessibilityRole="button" accessibilityLabel="Increase bid by five pesos">
              <Text style={styles.stepperText}>+</Text>
            </Pressable>
          </View>
          {validationMessage ? (
            <Text style={styles.errorText}>{validationMessage}</Text>
          ) : amountValid ? (
            <Text style={styles.validText}>Within client budget range ({requestBudget} PHP)</Text>
          ) : (
            <Text style={styles.helperText}>Enter an amount within the client’s budget range.</Text>
          )}

          <View style={styles.fieldHeader}>
            <Text style={styles.fieldLabel}>MESSAGE</Text>
            <Text style={styles.counter}>{message.length} / 500</Text>
          </View>
          <RichTextInput
            value={message}
            onChangeText={setMessage}
            maxLength={500}
            multiline
            textAlignVertical="top"
            placeholder="Explain how you can complete this request..."
            placeholderTextColor="#8E8E93"
            style={styles.messageInput}
            accessibilityLabel="Bid message"
          />
          <Text style={styles.helperText}>Describe your approach, tools, or relevant experience.</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              onPress={handleSubmit}
              disabled={!amountValid || isSubmitting || isWithdrawing}
              style={[styles.submitButton, (!amountValid || isSubmitting || isWithdrawing) && styles.disabledButton]}
              accessibilityRole="button">
              <Text style={styles.submitText}>
                {isSubmitting ? (mode === 'edit' ? 'Saving...' : 'Submitting...') : mode === 'edit' ? 'Save Changes' : 'Submit Bid'}
              </Text>
            </Pressable>
            {mode === 'edit' && onWithdraw ? (
              <Pressable
                onPress={onWithdraw}
                disabled={isWithdrawing || isSubmitting}
                style={styles.withdrawButton}
                accessibilityRole="button">
                <Text style={styles.withdrawText}>{isWithdrawing ? 'Withdrawing...' : 'Withdraw Bid'}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onCancel} disabled={isSubmitting || isWithdrawing} style={styles.cancelButton} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: { maxHeight: '94%', paddingHorizontal: 24, paddingTop: 12, gap: 10, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#1C1B1B' },
  handle: { alignSelf: 'center', width: 42, height: 4, marginBottom: 3, borderRadius: 2, backgroundColor: '#565656' },
  titleRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#E5E2E1', fontFamily: 'LeagueSpartanExtraBold', fontSize: 22 },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#2A2A2A' },
  closeText: { color: '#C8C6B9', fontSize: 24, lineHeight: 26 },
  requestCard: { padding: 13, gap: 4, borderRadius: 12, backgroundColor: '#242323' },
  requestLabel: { color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: 0.5 },
  requestTitle: { color: '#E5E2E1', fontFamily: 'LeagueSpartanBold', fontSize: 17 },
  requestBudget: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  required: { color: '#FFE600' },
  currencyText: { color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 10 },
  amountControl: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: 12, backgroundColor: '#242323' },
  stepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#353534' },
  stepperText: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 22 },
  amountEntry: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  currencySymbol: { color: '#FFE600', fontFamily: 'LeagueSpartanExtraBold', fontSize: 25 },
  amountInput: { minWidth: 64, maxWidth: 150, padding: 0, color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 25, textAlign: 'center' },
  validText: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  helperText: { color: '#C8C6B9', fontFamily: 'Roboto', fontSize: 12, lineHeight: 17 },
  errorText: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 12, lineHeight: 17 },
  counter: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 11 },
  messageInput: { minHeight: 104, padding: 13, borderRadius: 12, backgroundColor: '#242323', color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 14, lineHeight: 21 },
  actions: { gap: 8, paddingTop: 3 },
  submitButton: { minHeight: 49, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFE600' },
  disabledButton: { opacity: 0.46 },
  submitText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 15 },
  withdrawButton: { minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'transparent' },
  withdrawText: { color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 13 },
  cancelButton: { minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#2A2A2A' },
  cancelText: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 14 },
});
