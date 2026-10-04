import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { RichTextInput } from '@/components/rich-text-input';
import { MarkdownText } from '@/components/markdown-text';
import { useFocusEffect } from 'expo-router';

type Dispute = {
  id: string; order_id: string; filed_by: string; reason: string; explanation: string | null;
  status: string; resolution: string | null; client_percent: number | null; hunter_percent: number | null;
  team_fee_amount: number | null; resolution_note: string | null; created_at: string; review_started_at: string | null;
  decision_ready_at: string | null; resolved_at: string | null;
};
type Order = { id: string; client_id: string; hunter_id: string; request_id: string | null; amount: number; status: string };
type Profile = { id: string; username: string | null; is_admin: boolean | null };
type Evidence = { id: string; file_url: string; file_name: string | null };
type Confirmation = { title: string; message: string; confirmLabel: string; onConfirm: () => void };

const BUCKET = 'dispute-attachments';
const COMMIS_FEE_RATE = 0.1;
const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted', under_review: 'Under review', resolution_pending: 'Decision needed', resolved: 'Resolved',
};
const STEPS = ['submitted', 'under_review', 'resolution_pending', 'resolved'];

function peso(value: number): string {
  return `₱${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Waiting';
}

export default function DisputeDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const disputeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [client, setClient] = useState<Profile | null>(null);
  const [hunter, setHunter] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [title, setTitle] = useState('Commission');
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [clientPercent, setClientPercent] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const loadDispute = useCallback(async () => {
    if (!disputeId) {
      setError('Dispute not found.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Sign in to view this dispute.');
      setLoading(false);
      return;
    }
    const { data: disputeData, error: disputeError } = await supabase
      .from('disputes')
      .select('id, order_id, filed_by, reason, explanation, status, resolution, client_percent, hunter_percent, team_fee_amount, resolution_note, created_at, review_started_at, decision_ready_at, resolved_at')
      .eq('id', disputeId)
      .maybeSingle();
    if (disputeError || !disputeData) {
      setError(disputeError?.message || 'Dispute not found.');
      setLoading(false);
      return;
    }
    const [orderResult, profileResult, evidenceResult] = await Promise.all([
      supabase.from('orders').select('id, client_id, hunter_id, request_id, amount, status').eq('id', disputeData.order_id).maybeSingle(),
      supabase.from('profiles').select('id, username, is_admin').in('id', [user.id, disputeData.filed_by]),
      supabase.from('dispute_attachments').select('id, file_url, file_name').eq('dispute_id', disputeId),
    ]);
    if (orderResult.error || !orderResult.data) {
      setError(orderResult.error?.message || 'Commission details could not be loaded.');
      setLoading(false);
      return;
    }
    const me = ((profileResult.data ?? []) as Profile[]).find((profile) => profile.id === user.id);
    const admin = me?.is_admin === true;
    if (!admin && orderResult.data.client_id !== user.id && orderResult.data.hunter_id !== user.id) {
      setError('You do not have access to this dispute.');
      setLoading(false);
      return;
    }
    const otherProfiles = await supabase
      .from('profiles')
      .select('id, username, is_admin')
      .in('id', [orderResult.data.client_id, orderResult.data.hunter_id]);
    const profiles = (otherProfiles.data ?? []) as Profile[];
    setDispute(disputeData as Dispute);
    setOrder(orderResult.data as Order);
    setClient(profiles.find((profile) => profile.id === orderResult.data?.client_id) ?? null);
    setHunter(profiles.find((profile) => profile.id === orderResult.data?.hunter_id) ?? null);
    setIsAdmin(admin);
    setEvidence((evidenceResult.data ?? []) as Evidence[]);
    if (orderResult.data.request_id) {
      const { data: request } = await supabase.from('service_requests').select('title').eq('id', orderResult.data.request_id).maybeSingle();
      setTitle(request?.title || 'Commission');
    }
    setLoading(false);
  }, [disputeId]);

  useFocusEffect(useCallback(() => { void loadDispute(); }, [loadDispute]));

  const performAction = async (functionName: string, successMessage?: string) => {
    if (!dispute) return;
    setBusy(true);
    setError('');
    const { error: actionError } = await supabase.rpc(functionName, { p_dispute_id: dispute.id });
    setBusy(false);
    if (actionError) {
      setError(actionError.message);
      return;
    }
    if (successMessage) setNotice(successMessage);
    await loadDispute();
  };

  const resolveDispute = () => {
    if (!dispute || !order) return;
    const clientShare = Number(clientPercent);
    if (!Number.isFinite(clientShare) || clientPercent.trim() === '' || clientShare < 0 || clientShare > 100) {
      setError('Enter a client percentage between 0 and 100.');
      return;
    }
    const hunterShare = 100 - clientShare;
    const teamFee = Math.round(Number(order.amount) * COMMIS_FEE_RATE * 100) / 100;
    const distributable = Number(order.amount) - teamFee;
    const clientAmount = Math.round((distributable * clientShare / 100) * 100) / 100;
    const hunterAmount = distributable - clientAmount;
    setConfirmation({
      title: 'Confirm escrow split?',
      message: `Commis Team fee (10%): ${peso(teamFee)}\nRemaining 90%: ${peso(distributable)}\nClient: ${clientShare}% (${peso(clientAmount)})\nHunter: ${hunterShare}% (${peso(hunterAmount)})\n\nThis releases the escrow and completes the commission.`,
      confirmLabel: 'Resolve Dispute',
      onConfirm: () => {
        setConfirmation(null);
        void (async () => {
          setBusy(true);
          setError('');
          const { error: actionError } = await supabase.rpc('resolve_dispute_split', {
            p_dispute_id: dispute.id,
            p_client_percent: clientShare,
            p_resolution_note: resolutionNote.trim() || null,
          });
          setBusy(false);
          if (actionError) {
            setError(actionError.message);
            return;
          }
          setResolutionNote('');
          setNotice('The dispute was resolved and the escrow split was recorded. Both parties have been invited to review each other.');
          await loadDispute();
        })();
      },
    });
  };

  const openEvidence = async (file: Evidence) => {
    if (/^https?:\/\//i.test(file.file_url)) {
      await Linking.openURL(file.file_url);
      return;
    }
    const { data, error: fileError } = await supabase.storage.from(BUCKET).createSignedUrl(file.file_url, 3600);
    if (fileError || !data?.signedUrl) {
      setError(fileError?.message || 'Could not open evidence.');
      return;
    }
    await Linking.openURL(data.signedUrl);
  };

  if (loading) {
    return <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}><ActivityIndicator color="#FDE400" /><Text style={styles.muted}>Loading dispute…</Text></View>;
  }
  if (!dispute || !order) {
    return <View style={[styles.screen, { paddingTop: Math.max(insets.top, 8) }]}><Header onBack={() => router.back()} /><Text style={styles.error}>{error || 'Dispute unavailable.'}</Text></View>;
  }

  const currentStep = Math.max(0, STEPS.indexOf(dispute.status));
  const hunterPercentShown = dispute.hunter_percent ?? (dispute.client_percent == null ? null : 100 - dispute.client_percent);
  const teamFee = dispute.status === 'resolved'
    ? Number(dispute.team_fee_amount ?? 0)
    : Math.round(Number(order.amount) * COMMIS_FEE_RATE * 100) / 100;
  const distributable = Number(order.amount) - teamFee;
  const clientAmount = dispute.client_percent == null ? null : Math.round((distributable * dispute.client_percent / 100) * 100) / 100;
  const hunterAmount = clientAmount == null ? null : distributable - clientAmount;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 8) }]}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}>
        <View style={styles.caseLine}><Text style={styles.kicker}>⚖  ARBITRATION CASE</Text><Text style={styles.caseId}>#{dispute.id.slice(0, 8).toUpperCase()}</Text></View>
        {notice ? <View style={styles.notice}><Text style={styles.muted}>{notice}</Text></View> : null}

        <View style={styles.card}>
          <View style={styles.row}><Text style={styles.status}>{STATUS_LABELS[dispute.status] || dispute.status}</Text><Text style={styles.muted}>• Locked escrow</Text></View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.muted}>Client @{client?.username || 'client'} · Hunter @{hunter?.username || 'hunter'}</Text>
          <View style={styles.amountRow}><Text style={styles.muted}>Escrowed amount</Text><Text style={styles.amount}>{peso(Number(order.amount))} PHP</Text></View>
        </View>

        <View style={styles.card}>
          <View style={styles.row}><Text style={styles.heading}>Dispute Status</Text><Text style={styles.kicker}>Step {currentStep + 1} of {STEPS.length}</Text></View>
          {STEPS.map((step, index) => (
            <View key={step} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View style={[styles.timelineNode, index <= currentStep && styles.timelineNodeActive]}><Text style={styles.nodeText}>{index < currentStep ? '✓' : `${index + 1}`}</Text></View>
                {index < STEPS.length - 1 && <View style={[styles.timelineLine, index < currentStep && styles.timelineLineActive]} />}
              </View>
              <View style={styles.timelineCopy}>
                <Text style={[styles.timelineTitle, index === currentStep && styles.activeText]}>{STATUS_LABELS[step]}</Text>
                <Text style={styles.muted}>{step === 'submitted' ? date(dispute.created_at) : step === 'under_review' ? date(dispute.review_started_at) : step === 'resolution_pending' ? date(dispute.decision_ready_at) : date(dispute.resolved_at)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Claim Details</Text>
          <Text style={styles.kicker}>REASON FOR DISPUTE</Text>
          <View style={styles.inset}><Text style={styles.claimText}>{dispute.reason}</Text></View>
          <Text style={styles.kicker}>DETAILED EXPLANATION</Text>
          <View style={styles.inset}><MarkdownText style={styles.claimText}>{dispute.explanation || 'No explanation provided.'}</MarkdownText></View>
          <Text style={styles.kicker}>SUBMITTED</Text>
          <Text style={styles.muted}>{date(dispute.created_at)}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.row}><Text style={styles.heading}>Submitted Attachments</Text><Text style={styles.kicker}>{evidence.length}</Text></View>
          {evidence.length ? evidence.map((file) => (
            <Pressable key={file.id} onPress={() => void openEvidence(file)} style={styles.evidenceRow}>
              <Text style={styles.evidenceIcon}>▣</Text><Text style={styles.evidenceName}>{file.file_name || 'Evidence file'}</Text><Text style={styles.open}>Open</Text>
            </Pressable>
          )) : <Text style={styles.muted}>No files were attached. Links included in the explanation remain visible above.</Text>}
        </View>

        <View style={styles.notice}>
          <Text style={styles.heading}>Funds secured in escrow</Text>
          <Text style={styles.muted}>After resolution, the Commis Team receives a 10% service fee. The admin’s client/hunter percentages are applied to the remaining 90%.</Text>
        </View>

        {isAdmin && (
          <View style={styles.card}>
            <Text style={styles.heading}>Admin Actions</Text>
            {dispute.status === 'submitted' && button('Start Review', () => void performAction('start_dispute_review'), busy)}
            {dispute.status === 'under_review' && button('Send for Resolution', () => void performAction('mark_dispute_decision_pending'), busy)}
            {dispute.status === 'resolution_pending' && (
              <>
                <Text style={styles.muted}>Set how the remaining 90% is split. The Commis Team receives a 10% fee first; the hunter receives the remainder of the participant pool.</Text>
                <View style={styles.splitPreview}>
                  <View style={styles.splitCell}><Text style={styles.kicker}>CLIENT · % OF 90%</Text><TextInput value={clientPercent} onChangeText={(value) => setClientPercent(value.replace(/[^\d.]/g, '').slice(0, 6))} keyboardType="decimal-pad" placeholder="%" placeholderTextColor="#777" style={styles.percentInput} /></View>
                  <View style={styles.splitCell}><Text style={styles.kicker}>HUNTER</Text><Text style={styles.splitValue}>{clientPercent.trim() && Number.isFinite(Number(clientPercent)) ? `${Math.max(0, 100 - Number(clientPercent))}%` : '—'}</Text></View>
                </View>
                {clientPercent.trim() && Number.isFinite(Number(clientPercent)) && Number(clientPercent) >= 0 && Number(clientPercent) <= 100 && (
                  <Text style={styles.muted}>Commis Team fee {peso(teamFee)} · Client {peso(Math.round(distributable * Number(clientPercent) / 100 * 100) / 100)} · Hunter {peso(distributable - Math.round(distributable * Number(clientPercent) / 100 * 100) / 100)}</Text>
                )}
                <RichTextInput value={resolutionNote} onChangeText={setResolutionNote} maxLength={1000} placeholder="Resolution note (optional)" placeholderTextColor="#777" multiline style={[styles.percentInput, styles.noteInput]} />
                {button('Confirm Split & Release Escrow', resolveDispute, busy)}
              </>
            )}
            {dispute.status === 'resolved' && (
              <View style={styles.inset}>
                <Text style={styles.splitValue}>Commis Team fee (10%) · {peso(teamFee)}</Text>
                <Text style={styles.splitValue}>Client {dispute.client_percent}% · {clientAmount == null ? '—' : peso(clientAmount)}</Text>
                <Text style={styles.splitValue}>Hunter {hunterPercentShown}% · {hunterAmount == null ? '—' : peso(hunterAmount)}</Text>
                {dispute.resolution_note ? <MarkdownText style={styles.muted}>{dispute.resolution_note}</MarkdownText> : null}
              </View>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        )}
        {!isAdmin && dispute.status === 'resolved' && (
          <View style={styles.notice}>
            <Text style={styles.heading}>Resolution</Text>
            <Text style={styles.muted}>The Commis Team received a 10% service fee ({peso(teamFee)}).</Text>
            <Text style={styles.muted}>Client receives {dispute.client_percent}% ({clientAmount == null ? '—' : peso(clientAmount)}); hunter receives {hunterPercentShown}% ({hunterAmount == null ? '—' : peso(hunterAmount)}).</Text>
            {dispute.resolution_note ? <MarkdownText style={styles.muted}>{dispute.resolution_note}</MarkdownText> : null}
          </View>
        )}
        {error && !isAdmin ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <ConfirmationModal
        visible={Boolean(confirmation)}
        title={confirmation?.title || ''}
        message={confirmation?.message}
        confirmLabel={confirmation?.confirmLabel}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => confirmation?.onConfirm()}
        busy={busy}
      />
    </View>
  );
}

function button(label: string, onPress: () => void, busy: boolean) {
  return <Pressable disabled={busy} onPress={onPress} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{busy ? 'Please wait…' : label}</Text></Pressable>;
}

function Header({ onBack }: { onBack: () => void }) {
  return <View style={styles.header}><Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.headerTitle}>Dispute Detail</Text><View style={styles.back} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#131313' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#252525' },
  back: { width: 36 }, backText: { color: '#ddd', fontSize: 32 }, headerTitle: { color: '#f3f3f3', fontSize: 17, fontWeight: '700' },
  content: { gap: 14, padding: 16 }, card: { gap: 11, padding: 15, backgroundColor: '#201f1f', borderRadius: 14 },
  caseLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, kicker: { color: '#c8c6c8', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }, caseId: { color: '#aaa', fontSize: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, status: { color: '#201c00', backgroundColor: '#fde400', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, fontSize: 10, fontWeight: '800' },
  title: { color: '#fff', fontSize: 19, fontWeight: '700' }, heading: { color: '#f3f3f3', fontSize: 16, fontWeight: '700' }, amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#353535' }, amount: { color: '#fff', fontSize: 19, fontWeight: '800' }, muted: { color: '#aaa', fontSize: 12, lineHeight: 18 }, activeText: { color: '#fde400' },
  timelineRow: { minHeight: 51, flexDirection: 'row', gap: 12 }, timelineRail: { width: 28, alignItems: 'center' }, timelineNode: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#555', borderRadius: 13, backgroundColor: '#353534', zIndex: 1 }, timelineNodeActive: { borderColor: '#fde400', backgroundColor: '#fde400' }, nodeText: { color: '#121212', fontSize: 11, fontWeight: '800' }, timelineLine: { position: 'absolute', top: 25, bottom: -4, width: 2, backgroundColor: '#444' }, timelineLineActive: { backgroundColor: '#fde400' }, timelineCopy: { flex: 1, gap: 3, paddingTop: 2 }, timelineTitle: { color: '#eee', fontSize: 13, fontWeight: '700' },
  inset: { gap: 5, padding: 11, backgroundColor: '#1c1b1b', borderRadius: 9 }, claimText: { color: '#eee', fontSize: 13, lineHeight: 20 }, evidenceRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, backgroundColor: '#1c1b1b', borderRadius: 9 }, evidenceIcon: { color: '#fde400', fontSize: 17 }, evidenceName: { flex: 1, color: '#eee', fontSize: 12 }, open: { color: '#fde400', fontSize: 12, fontWeight: '700' },
  notice: { gap: 7, padding: 14, backgroundColor: '#2a2a2a', borderRadius: 12 }, splitPreview: { flexDirection: 'row', gap: 10 }, splitCell: { flex: 1, gap: 6, padding: 10, backgroundColor: '#1c1b1b', borderRadius: 10 }, percentInput: { minHeight: 44, padding: 10, color: '#eee', fontSize: 16, backgroundColor: '#292929', borderWidth: 1, borderColor: '#444', borderRadius: 9 }, splitValue: { color: '#fff', fontSize: 15, fontWeight: '700' }, noteInput: { minHeight: 70, textAlignVertical: 'top', fontSize: 13 },
  button: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, backgroundColor: '#fde400', borderRadius: 12 }, buttonText: { color: '#201c00', fontSize: 13, fontWeight: '800', textAlign: 'center' }, disabled: { opacity: 0.6 }, error: { margin: 16, color: '#ff9994', fontSize: 13 },
});
