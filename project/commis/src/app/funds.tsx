import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

type TransactionType = 'deposit' | 'withdrawal' | 'escrow_lock' | 'escrow_release' | 'commission_payment' | 'platform_fee';
type TransactionFilter = 'all' | 'escrow' | 'transfers';
type WalletModal = 'add' | 'withdraw' | null;
type TransactionSymbol = 'south' | 'north' | 'lock' | 'lock_open' | 'check_circle';

interface WalletRow {
  user_id: string;
  available_balance: number;
  escrow_balance: number;
}

interface WalletTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string | null;
  order_id: string | null;
  created_at: string | null;
}

interface EscrowOrder {
  amount: number;
}

const ESCROW_STATUSES = ['escrow_locked', 'in_progress', 'delivered', 'disputed'];

function peso(value: number): string {
  return `PHP ${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function displayTime(value: string | null): string {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function transactionTitle(type: TransactionType): string {
  switch (type) {
    case 'deposit': return 'Funds Added';
    case 'withdrawal': return 'Funds Withdrawn';
    case 'escrow_lock': return 'Escrow Locked';
    case 'escrow_release': return 'Escrow Released';
    case 'commission_payment': return 'Commission Payment';
    case 'platform_fee': return 'Commis Team Fee';
  }
}

function transactionFilter(type: TransactionType): Exclude<TransactionFilter, 'all'> {
  return type === 'deposit' || type === 'withdrawal' ? 'transfers' : 'escrow';
}

function transactionIcon(type: TransactionType): TransactionSymbol {
  switch (type) {
    case 'deposit': return 'south';
    case 'withdrawal': return 'north';
    case 'escrow_lock': return 'lock';
    case 'escrow_release': return 'lock_open';
    case 'commission_payment': return 'check_circle';
    case 'platform_fee': return 'check_circle';
  }
}

export default function FundsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [escrowFromOrders, setEscrowFromOrders] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pageError, setPageError] = useState('');
  const [activeFilter, setActiveFilter] = useState<TransactionFilter>('all');
  const [activeModal, setActiveModal] = useState<WalletModal>(null);
  const [amountInput, setAmountInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadWallet = useCallback(async (refresh = false) => {
    setIsLoading(true);
    if (refresh) setIsRefreshing(true);
    setPageError('');

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setPageError('Sign in to view your funds.');
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const [walletResult, transactionResult, escrowResult] = await Promise.all([
      supabase
        .from('wallets')
        .select('user_id, available_balance, escrow_balance')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('wallet_transactions')
        .select('id, type, amount, description, order_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('orders')
        .select('amount')
        .or(`client_id.eq.${user.id},hunter_id.eq.${user.id}`)
        .in('status', ESCROW_STATUSES),
    ]);

    if (walletResult.error || !walletResult.data) {
      console.warn('Failed to load wallet:', walletResult.error);
      setPageError(walletResult.error?.message || 'Wallet not found for this account.');
      setWallet(null);
    } else {
      setWallet({
        ...walletResult.data,
        available_balance: Number(walletResult.data.available_balance) || 0,
        escrow_balance: Number(walletResult.data.escrow_balance) || 0,
      });
    }

    if (transactionResult.error) {
      console.warn('Failed to load wallet transactions:', transactionResult.error);
      setPageError((current) => current || transactionResult.error.message);
      setTransactions([]);
    } else {
      setTransactions((transactionResult.data ?? []).map((transaction) => ({
        ...transaction,
        type: transaction.type as TransactionType,
        amount: Number(transaction.amount) || 0,
      })));
    }

    if (escrowResult.error) {
      console.warn('Failed to load escrow orders:', escrowResult.error);
      setPageError((current) => current || 'Could not load escrow from your active orders.');
      setEscrowFromOrders(null);
    } else {
      const escrowTotal = ((escrowResult.data ?? []) as EscrowOrder[])
        .reduce((total, order) => total + (Number(order.amount) || 0), 0);
      setEscrowFromOrders(escrowTotal);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadWallet();
    }, [loadWallet])
  );

  const availableBalance = Number(wallet?.available_balance ?? 0);
  const escrowBalance = escrowFromOrders ?? 0;
  const totalBalance = availableBalance + escrowBalance;
  const numericAmount = Number(amountInput);
  const amountIsValid = amountInput.trim() !== '' && Number.isFinite(numericAmount) && numericAmount > 0;
  const withdrawExceedsAvailable = activeModal === 'withdraw' && amountIsValid && numericAmount > availableBalance;
  const filteredTransactions = useMemo(() => transactions.filter((transaction) => {
    return activeFilter === 'all' || transactionFilter(transaction.type) === activeFilter;
  }), [activeFilter, transactions]);

  const openModal = (modal: Exclude<WalletModal, null>) => {
    setActionError('');
    setAmountInput('');
    setActiveModal(modal);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setActiveModal(null);
    setActionError('');
    setAmountInput('');
  };

  const submitFundsAction = async () => {
    if (!activeModal || !amountIsValid || isSubmitting || withdrawExceedsAvailable) return;
    setIsSubmitting(true);
    setActionError('');

    const functionName = activeModal === 'add' ? 'deposit_funds' : 'withdraw_funds';
    const { error } = await supabase.rpc(functionName, { p_amount: numericAmount });

    if (error) {
      console.warn(`Failed to ${activeModal === 'add' ? 'add' : 'withdraw'} funds:`, error);
      const errorMessage = error.message.toLowerCase().includes('insufficient funds')
        ? 'Insufficient available funds.'
        : error.message.toLowerCase().includes('greater than zero')
          ? 'Enter an amount greater than zero.'
          : `Could not ${activeModal === 'add' ? 'add' : 'withdraw'} funds. Please try again.`;
      setActionError(errorMessage);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setActiveModal(null);
    setAmountInput('');
    await loadWallet(true);
  };

  const isEscrowTransaction = (type: TransactionType) => transactionFilter(type) === 'escrow';

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path d="M19 12H5m0 0 7-7m-7 7 7 7" stroke="#E5E2E1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
        <Text style={styles.headerTitle}>Funds</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator color="#FFE600" size="large" />
          <Text style={styles.stateText}>Loading funds...</Text>
        </View>
      ) : pageError && !wallet ? (
        <View style={styles.stateContainer}>
          <Text style={styles.errorText}>{pageError}</Text>
          <Pressable onPress={() => void loadWallet()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadWallet(true)} tintColor="#FFE600" colors={['#FFE600']} />}
          showsVerticalScrollIndicator={false}>
          {pageError ? <Text style={styles.inlineError}>{pageError}</Text> : null}
          <View style={styles.balanceSection}>
            <View style={styles.availableCard}>
              <Text style={styles.availableAmount}>{peso(availableBalance)}</Text>
              <Text style={styles.balanceLabel}>Available Funds</Text>
            </View>
            <View style={styles.balanceGrid}>
              <View style={styles.balanceCard}>
                <Text style={styles.smallBalanceLabel}>IN ESCROW</Text>
                <Text style={styles.smallBalanceAmount}>{peso(escrowBalance)}</Text>
              </View>
              <View style={styles.balanceCard}>
                <Text style={styles.smallBalanceLabel}>TOTAL FUNDS</Text>
                <Text style={styles.smallBalanceAmount}>{peso(totalBalance)}</Text>
              </View>
            </View>
            <View style={styles.fundActions}>
              <Pressable onPress={() => openModal('add')} style={styles.addButton} accessibilityRole="button">
                <SymbolView name={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }} size={18} tintColor="#201C00" />
                <Text style={styles.addButtonText}>Add Funds</Text>
              </Pressable>
              <Pressable onPress={() => openModal('withdraw')} style={styles.withdrawButton} accessibilityRole="button">
                <SymbolView name={{ ios: 'minus.circle', android: 'remove_circle', web: 'remove_circle' }} size={18} tintColor="#E5E2E1" />
                <Text style={styles.withdrawButtonText}>Withdraw</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.transactionsSection}>
            <View style={styles.transactionsHeader}>
              <Text style={styles.transactionsTitle}>Transactions</Text>
              <View style={styles.filters}>
                {(['all', 'escrow', 'transfers'] as const).map((filter) => (
                  <Pressable key={filter} onPress={() => setActiveFilter(filter)} style={[styles.filterPill, activeFilter === filter && styles.filterPillActive]} accessibilityRole="tab" accessibilityState={{ selected: activeFilter === filter }}>
                    <Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]}>
                      {filter === 'all' ? 'All' : filter === 'escrow' ? 'Escrow' : 'Add/Withdraw'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {filteredTransactions.length ? filteredTransactions.map((transaction) => {
              const positive = transaction.amount > 0;
              const icon = transactionIcon(transaction.type);
              const iosIcon = icon === 'south'
                ? 'arrow.down'
                : icon === 'north'
                  ? 'arrow.up'
                  : icon === 'lock'
                    ? 'lock.fill'
                    : icon === 'lock_open'
                      ? 'lock.open'
                      : 'checkmark.circle';
              return (
                <View key={transaction.id} style={styles.transactionCard}>
                  <View style={styles.transactionIcon}>
                    <SymbolView
                      name={{ ios: iosIcon, android: icon, web: icon }}
                      size={20}
                      tintColor={transaction.type === 'deposit' || transaction.type === 'commission_payment' || transaction.type === 'platform_fee' ? '#FFE600' : '#C8C6C8'}
                    />
                  </View>
                  <View style={styles.transactionInfo}>
                    <View style={styles.transactionTitleRow}>
                      <Text style={styles.transactionTitle} numberOfLines={1}>{transactionTitle(transaction.type)}</Text>
                      <Text style={[styles.transactionAmount, positive && styles.positiveAmount]} numberOfLines={1}>
                        {positive ? '+ ' : '- '}{peso(Math.abs(transaction.amount))}
                      </Text>
                    </View>
                    <Text style={styles.transactionDescription} numberOfLines={1}>
                      {transaction.description?.trim() || (isEscrowTransaction(transaction.type) ? 'Escrow activity' : transaction.type === 'deposit' ? 'Wallet deposit' : 'Wallet withdrawal')}
                    </Text>
                    <Text style={styles.transactionDate}>{displayTime(transaction.created_at)}</Text>
                  </View>
                </View>
              );
            }) : (
              <View style={styles.emptyTransactions}>
                <Text style={styles.emptyText}>No transactions yet.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      <FundsActionModal
        visible={activeModal !== null}
        mode={activeModal ?? 'add'}
        availableBalance={availableBalance}
        amount={amountInput}
        setAmount={setAmountInput}
        amountIsValid={amountIsValid}
        exceedsAvailable={withdrawExceedsAvailable}
        error={actionError}
        isSubmitting={isSubmitting}
        onConfirm={() => void submitFundsAction()}
        onClose={closeModal}
      />
    </View>
  );
}

function FundsActionModal({
  visible,
  mode,
  availableBalance,
  amount,
  setAmount,
  amountIsValid,
  exceedsAvailable,
  error,
  isSubmitting,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  mode: Exclude<WalletModal, null>;
  availableBalance: number;
  amount: string;
  setAmount: (value: string) => void;
  amountIsValid: boolean;
  exceedsAvailable: boolean;
  error: string;
  isSubmitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const amountValue = Number(amount) || 0;
  const previewBalance = mode === 'add' ? availableBalance + amountValue : Math.max(0, availableBalance - amountValue);
  const isAdd = mode === 'add';
  const title = isAdd ? 'Add Funds' : 'Withdraw Funds';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} disabled={isSubmitting} />
        <View style={[styles.modalPanel, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleBlock}>
              <View style={styles.modalTitleRow}>
                <SymbolView name={{ ios: isAdd ? 'plus.circle' : 'minus.circle', android: isAdd ? 'add_circle' : 'remove_circle', web: isAdd ? 'add_circle' : 'remove_circle' }} size={20} tintColor="#FFE600" />
                <Text style={styles.modalTitle}>{title}</Text>
              </View>
              <Text style={styles.modalSubtitle}>{isAdd ? 'Add funds to your wallet balance.' : 'Withdraw from your available wallet balance.'}</Text>
            </View>
            <Pressable onPress={onClose} disabled={isSubmitting} style={styles.modalClose} accessibilityRole="button" accessibilityLabel="Close funds form">
              <Text style={styles.modalCloseText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.modalField}>
            <Text style={styles.modalLabel}>CURRENT AVAILABLE FUNDS</Text>
            <View style={styles.currentBalanceBox}>
              <Text style={styles.currentBalanceText}>{peso(availableBalance)}</Text>
              <SymbolView name={{ ios: 'wallet.pass', android: 'account_balance_wallet', web: 'account_balance_wallet' }} size={17} tintColor="#A6A6AB" />
            </View>
          </View>

          <View style={styles.modalField}>
            <Text style={styles.amountLabel}>{isAdd ? 'AMOUNT TO ADD (PHP)' : 'AMOUNT TO WITHDRAW (PHP)'}</Text>
            <View style={styles.amountInputWrap}>
              <Text style={styles.amountPrefix}>PHP</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#777777"
                style={styles.amountInput}
                accessibilityLabel={isAdd ? 'Amount to add' : 'Amount to withdraw'}
              />
            </View>
          </View>

          <View style={styles.previewBox}>
            <Text style={styles.modalLabel}>{isAdd ? 'AVAILABLE AFTER DEPOSIT' : 'AVAILABLE AFTER WITHDRAWAL'}</Text>
            <Text style={styles.previewAmount}>{peso(previewBalance)}</Text>
          </View>

          {exceedsAvailable ? <Text style={styles.modalError}>Insufficient available funds.</Text> : null}
          {error ? <Text style={styles.modalError}>{error}</Text> : null}

          <View style={styles.modalActions}>
            <Pressable
              onPress={onConfirm}
              disabled={!amountIsValid || isSubmitting || exceedsAvailable}
              style={[styles.modalConfirm, (!amountIsValid || isSubmitting || exceedsAvailable) && styles.modalDisabled]}
              accessibilityRole="button">
              <Text style={styles.modalConfirmText}>
                {isSubmitting ? 'Processing...' : isAdd ? 'Add Funds' : 'Withdraw Funds'}
              </Text>
            </Pressable>
            <Pressable onPress={onClose} disabled={isSubmitting} style={styles.modalCancel} accessibilityRole="button">
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)' },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#E5E2E1', fontFamily: 'LeagueSpartanBold', fontSize: 19 },
  headerSpacer: { width: 40 },
  content: { paddingHorizontal: 20, paddingTop: 18, gap: 26 },
  stateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 13, padding: 24 },
  stateText: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 14 },
  errorText: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 13, textAlign: 'center' },
  retryButton: { paddingHorizontal: 17, paddingVertical: 10, borderRadius: 9, backgroundColor: '#FFE600' },
  retryText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  inlineError: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 12 },
  balanceSection: { gap: 9 },
  availableCard: { minHeight: 128, justifyContent: 'center', padding: 25, borderRadius: 17, backgroundColor: '#1C1B1B' },
  availableAmount: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 33 },
  balanceLabel: { marginTop: 4, color: '#C8C6B9', fontFamily: 'Roboto', fontSize: 13 },
  balanceGrid: { flexDirection: 'row', gap: 9 },
  balanceCard: { flex: 1, minHeight: 98, justifyContent: 'space-between', padding: 15, borderRadius: 16, backgroundColor: '#1C1B1B' },
  smallBalanceLabel: { color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: 0.4 },
  smallBalanceAmount: { color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 20 },
  fundActions: { flexDirection: 'row', gap: 9, paddingTop: 3 },
  addButton: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: '#FFE600' },
  addButtonText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  withdrawButton: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: '#242424' },
  withdrawButtonText: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  transactionsSection: { gap: 10 },
  transactionsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  transactionsTitle: { color: '#E5E2E1', fontFamily: 'LeagueSpartanExtraBold', fontSize: 21 },
  filters: { flexDirection: 'row', gap: 4 },
  filterPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 15, backgroundColor: '#1C1B1B' },
  filterPillActive: { backgroundColor: '#FFE600' },
  filterText: { color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 10 },
  filterTextActive: { color: '#201C00' },
  transactionCard: { minHeight: 88, flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16, backgroundColor: '#1C1B1B' },
  transactionIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#2A2A2A' },
  transactionInfo: { flex: 1, minWidth: 0 },
  transactionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  transactionTitle: { flex: 1, color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  transactionAmount: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 13, flexShrink: 0 },
  positiveAmount: { color: '#FFE600' },
  transactionDescription: { marginTop: 3, color: '#C8C6B9', fontFamily: 'Roboto', fontSize: 12 },
  transactionDate: { marginTop: 6, color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 10 },
  emptyTransactions: { minHeight: 88, alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 15, backgroundColor: '#1C1B1B' },
  emptyText: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 13 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.78)' },
  modalPanel: { gap: 15, paddingHorizontal: 22, paddingTop: 12, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#201F1F' },
  modalHandle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#555555' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  modalTitleBlock: { flex: 1, gap: 4 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitle: { color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 20 },
  modalSubtitle: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12 },
  modalClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#353534' },
  modalCloseText: { color: '#C8C6B9', fontSize: 22, lineHeight: 24 },
  modalField: { gap: 6 },
  modalLabel: { color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: 0.5 },
  currentBalanceBox: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderRadius: 9, backgroundColor: '#1C1B1B' },
  currentBalanceText: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  amountLabel: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: 0.5 },
  amountInputWrap: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, borderRadius: 9, backgroundColor: '#2A2A2A' },
  amountPrefix: { marginRight: 10, color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  amountInput: { flex: 1, padding: 0, color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 20 },
  previewBox: { gap: 5, padding: 12, borderRadius: 9, backgroundColor: '#171717' },
  previewAmount: { color: '#FFE600', fontFamily: 'LeagueSpartanBold', fontSize: 19 },
  modalError: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 12 },
  modalActions: { gap: 8 },
  modalConfirm: { minHeight: 47, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#FFE600' },
  modalDisabled: { opacity: 0.45 },
  modalConfirmText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  modalCancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#2A2A2A' },
  modalCancelText: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 14 },
});
