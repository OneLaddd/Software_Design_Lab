import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { RichTextInput } from '@/components/rich-text-input';
import { MarkdownText } from '@/components/markdown-text';

type Order = {
  id: string;
  request_id: string | null;
  client_id: string;
  hunter_id: string;
  amount: number;
  team_fee_amount: number | null;
  status: string;
  created_at: string;
  delivered_at: string | null;
  auto_release_at: string | null;
};

type Profile = {
  username: string | null;
};

type Deliverable = {
  id: string;
  file_url: string;
  file_name: string | null;
  file_size_bytes: number | null;
  created_at: string;
};

type Review = {
  id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
};

type Confirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
};

type PickedFile = DocumentPicker.DocumentPickerAsset;

type HeaderProps = {
  onBack: () => void;
  title?: string;
};

type DetailRowProps = {
  label: string;
  value: string;
};

const STATUS_LABELS: Record<string, string> = {
  created: 'Awaiting escrow',
  escrow_locked: 'Escrow locked',
  in_progress: 'In progress',
  delivered: 'Delivered',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

const PROGRESS_STEPS = [
  {
    title: 'Created',
    description: 'Offer accepted and contract generated',
  },
  {
    title: 'Escrow Locked',
    description: 'Client secured funds in vault',
  },
  {
    title: 'In Progress',
    description: 'Hunter actively worked on deliverables',
  },
  {
    title: 'Delivered',
    description: 'Deliverables handed over for inspection',
  },
  {
    title: 'Completed',
    description: 'Signed off and finalized',
  },
];

const ORDER_STATES = ['created', 'escrow_locked', 'in_progress', 'delivered', 'completed'];
const DELIVERY_BUCKET = 'order-deliverables';
const DISPUTE_BUCKET = 'dispute-attachments';
const MAX_DELIVERABLE_SIZE = 100 * 1024 * 1024;
const MAX_DISPUTE_EVIDENCE_SIZE = 25 * 1024 * 1024;
const MAX_DISPUTE_EVIDENCE_FILES = 5;
const ALLOWED_DELIVERABLE_EXTENSIONS = [
  'zip', 'obj', 'fbx', 'png', 'jpg', 'jpeg', 'pdf', 'docx', 'xlsx',
];
const ALLOWED_DISPUTE_EVIDENCE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'pdf', 'zip', 'mp4'];
const DISPUTE_REASONS = [
  { value: 'not_completed', label: 'Work was not completed' },
  { value: 'not_match', label: 'Work does not match the request' },
  { value: 'missing_reqs', label: 'Work has missing requirements' },
  { value: 'different_item', label: 'I received something different' },
  { value: 'other', label: 'Other' },
];

function formatPeso(amount: number): string {
  return `₱${Number(amount || 0).toLocaleString()}`;
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return 'Size unavailable';
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function mimeTypeFor(extension: string): string {
  const mimeTypes: Record<string, string> = {
    zip: 'application/zip',
    obj: 'model/obj',
    fbx: 'application/octet-stream',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return mimeTypes[extension] || 'application/octet-stream';
}

function pickedFileSize(asset: PickedFile): number | null {
  return asset.size ?? asset.file?.size ?? null;
}

async function readPickedFile(
  asset: PickedFile,
  cacheName: string,
): Promise<ArrayBuffer | ArrayBufferView | File> {
  if (Platform.OS === 'web' && asset.file) return asset.file;
  const cacheDirectory = LegacyFileSystem.cacheDirectory;
  if (!cacheDirectory) throw new Error('App cache is unavailable.');
  const safeName = cacheName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const cacheUri = `${cacheDirectory}${Date.now()}-${safeName}`;
  try {
    await LegacyFileSystem.copyAsync({ from: asset.uri, to: cacheUri });
    return await new ExpoFile(cacheUri).bytes();
  } finally {
    await LegacyFileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
  }
}

export default function CommissionDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[]; review?: string | string[] }>();
  const orderId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [userId, setUserId] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [requestTitle, setRequestTitle] = useState('Commission');
  const [client, setClient] = useState<Profile | null>(null);
  const [hunter, setHunter] = useState<Profile | null>(null);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<PickedFile[]>([]);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeExplanation, setDisputeExplanation] = useState('');
  const [disputeEvidence, setDisputeEvidence] = useState<PickedFile[]>([]);
  const [isEscrowSheetOpen, setIsEscrowSheetOpen] = useState(false);
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const disputeScrollViewRef = useRef<ScrollView>(null);
  const [isDisputePanelOpen, setIsDisputePanelOpen] = useState(false);

  const loadCommission = useCallback(async () => {
    if (!orderId) {
      setErrorMessage('Commission not found.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setErrorMessage('Sign in to view this commission.');
      setIsLoading(false);
      return;
    }

    setUserId(auth.user.id);

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select(
        'id, request_id, client_id, hunter_id, amount, team_fee_amount, status, created_at, delivered_at, auto_release_at',
      )
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !orderData) {
      setErrorMessage(orderError?.message || 'Commission not found.');
      setIsLoading(false);
      return;
    }

    if (orderData.client_id !== auth.user.id && orderData.hunter_id !== auth.user.id) {
      setErrorMessage('You do not have access to this commission.');
      setIsLoading(false);
      return;
    }

    if (orderData.status === 'disputed') {
      const { data: dispute, error: disputeError } = await supabase
        .from('disputes')
        .select('id')
        .eq('order_id', orderId)
        .maybeSingle();
      setDisputeId(dispute?.id ?? null);
      if (disputeError) setErrorMessage(disputeError.message);
    } else {
      setDisputeId(null);
    }

    setOrder(orderData as Order);

    const [profilesResult, requestResult, deliverablesResult, reviewsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username')
        .in('id', [orderData.client_id, orderData.hunter_id]),
      orderData.request_id
        ? supabase
            .from('service_requests')
            .select('title')
            .eq('id', orderData.request_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('deliverables')
        .select('id, file_url, file_name, file_size_bytes, created_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true }),
      supabase
        .from('reviews')
        .select('id, reviewer_id, reviewee_id, rating, comment')
        .eq('order_id', orderId),
    ]);

    const profiles = profilesResult.data ?? [];
    setClient(profiles.find((profile: any) => profile.id === orderData.client_id) ?? null);
    setHunter(profiles.find((profile: any) => profile.id === orderData.hunter_id) ?? null);
    setRequestTitle(requestResult.data?.title || 'Commission');
    setDeliverables((deliverablesResult.data ?? []) as Deliverable[]);
    setReviews((reviewsResult.data ?? []) as Review[]);
    setIsLoading(false);
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      loadCommission();
    }, [loadCommission]),
  );

  if (isLoading) {
    return (
      <View style={[styles.screen, styles.loadingScreen]}>
        <ActivityIndicator color="#ffe600" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Header onBack={() => router.back()} />
        <Text style={styles.errorMessage}>{errorMessage}</Text>
      </View>
    );
  }

  const isClient = order.client_id === userId;
  const counterpart = isClient ? hunter : client;
  const userRole = isClient ? 'Client' : 'Hunter';
  const currentStatus = order.status;
  const progressIndex =
    currentStatus === 'disputed' ? -1 : ORDER_STATES.indexOf(currentStatus);
  const hasInsufficientFunds =
    availableBalance !== null && availableBalance < Number(order.amount);

  const callOrderAction = async (functionName: string, args: Record<string, unknown>) => {
    setIsBusy(true);
    setErrorMessage('');

    const { error } = await supabase.rpc(functionName, args);
    setIsBusy(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setIsEscrowSheetOpen(false);
    await loadCommission();
  };

  const cancelCommission = async () => {
    if (!order) return;
    setIsBusy(true);
    setErrorMessage('');
    const { error } = await supabase.rpc('cancel_created_commission', { p_order_id: order.id });
    setIsBusy(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    await loadCommission();
  };

  const submitReview = async () => {
    if (!order) return;
    if (!reviewRating) {
      setErrorMessage('Choose a star rating first.');
      return;
    }
    setIsBusy(true);
    setErrorMessage('');
    const { error } = await supabase.rpc('submit_order_review', {
      p_order_id: order.id,
      p_rating: reviewRating,
      p_comment: reviewComment.trim() || null,
    });
    setIsBusy(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setReviewRating(0);
    setReviewComment('');
    await loadCommission();
  };

  const openEscrowSheet = async () => {
    setErrorMessage('');
    setIsBusy(true);

    const { data, error } = await supabase
      .from('wallets')
      .select('available_balance')
      .eq('user_id', userId)
      .maybeSingle();

    setIsBusy(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setAvailableBalance(Number(data?.available_balance) || 0);
    setIsEscrowSheetOpen(true);
  };

  const chooseDeliverables = async () => {
    setErrorMessage('');
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: Platform.OS !== 'android',
        base64: false,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not open the file picker.');
      return;
    }

    if (result.canceled) return;

    const invalidFile = result.assets.find((asset) => {
      const extension = asset.name.split('.').pop()?.toLowerCase();
      return !extension || !ALLOWED_DELIVERABLE_EXTENSIONS.includes(extension);
    });
    if (invalidFile) {
      setErrorMessage(
        `${invalidFile.name} is not supported. Choose ZIP, OBJ, FBX, PNG, JPG, JPEG, PDF, DOCX, or XLSX files.`,
      );
      return;
    }

    const oversizedFile = result.assets.find((asset) =>
      (pickedFileSize(asset) ?? 0) > MAX_DELIVERABLE_SIZE,
    );
    if (oversizedFile) {
      setErrorMessage(`${oversizedFile.name} is over the 100 MB per-file limit.`);
      return;
    }

    setSelectedFiles((current) => {
      const existingUris = new Set(current.map((file) => file.uri));
      return [...current, ...result.assets.filter((file) => !existingUris.has(file.uri))];
    });
  };

  const uploadDeliverables = async () => {
    if (!selectedFiles.length) {
      setErrorMessage('Choose at least one file to upload.');
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    const uploadedUris = new Set<string>();
    let uploadFailure = '';

    for (const [index, asset] of selectedFiles.entries()) {
      const extension = asset.name.split('.').pop()?.toLowerCase() || 'bin';
      const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const objectPath = `${order.id}/${userId}/${Date.now()}-${index}-${Math.random()
        .toString(36)
        .slice(2, 8)}-${safeName}`;
      let fileBody: ArrayBuffer | ArrayBufferView | File;
      let cacheUri: string | undefined;

      try {
        if (Platform.OS === 'web' && asset.file) {
          fileBody = asset.file;
        } else {
          const cacheDirectory = LegacyFileSystem.cacheDirectory;
          if (!cacheDirectory) throw new Error('App cache is unavailable.');
          cacheUri = `${cacheDirectory}delivery-${Date.now()}-${index}-${safeName}`;
          await LegacyFileSystem.copyAsync({ from: asset.uri, to: cacheUri });
          fileBody = await new ExpoFile(cacheUri).bytes();
        }

        const actualSize = asset.size ?? asset.file?.size ??
          ('byteLength' in fileBody ? fileBody.byteLength : 0);
        if (actualSize > MAX_DELIVERABLE_SIZE) {
          uploadFailure = `${asset.name} is over the 100 MB per-file limit.`;
          break;
        }

        const { error: uploadError } = await supabase.storage
          .from(DELIVERY_BUCKET)
          .upload(objectPath, fileBody, {
            contentType: asset.mimeType || mimeTypeFor(extension),
            upsert: false,
          });

        if (uploadError) {
          uploadFailure = `Could not upload ${asset.name}: ${uploadError.message}`;
          break;
        }

        const { error: recordError } = await supabase.from('deliverables').insert({
          order_id: order.id,
          file_url: objectPath,
          file_name: asset.name,
          file_size_bytes: actualSize || null,
          uploaded_by: userId,
        });

        if (recordError) {
          uploadFailure =
            `Uploaded ${asset.name}, but could not save its delivery record: ${recordError.message}`;
          break;
        }

        uploadedUris.add(asset.uri);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown upload error';
        uploadFailure = `Could not upload ${asset.name}: ${message}`;
        break;
      } finally {
        if (cacheUri) {
          await LegacyFileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
        }
      }
    }

    setIsBusy(false);
    setSelectedFiles((current) => current.filter((file) => !uploadedUris.has(file.uri)));
    await loadCommission();
    if (uploadFailure) setErrorMessage(uploadFailure);
  };

  const addDeliverableLink = async () => {
    const value = linkUrl.trim();
    let sharedUrl: URL;
    try {
      sharedUrl = new URL(value);
    } catch {
      setErrorMessage('Enter a valid Google Drive or other share link.');
      return;
    }
    if (!['http:', 'https:'].includes(sharedUrl.protocol)) {
      setErrorMessage('Share links must start with http:// or https://.');
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    const { error } = await supabase.from('deliverables').insert({
      order_id: order.id,
      file_url: sharedUrl.toString(),
      file_name: linkName.trim() || sharedUrl.hostname,
      file_size_bytes: null,
      uploaded_by: userId,
    });
    setIsBusy(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setLinkName('');
    setLinkUrl('');
    await loadCommission();
  };

  const submitDelivery = () => {
    if (!deliverables.length) {
      setErrorMessage('Upload a file or add a share link before marking this commission delivered.');
      return;
    }
    const summary = deliverables
      .map((item) => {
        const name = item.file_name || 'Deliverable';
        return /^https?:\/\//i.test(item.file_url)
          ? `• ${name}\n  ${item.file_url}`
          : `• ${name}`;
      })
      .join('\n');
    setConfirmation({
      title: 'Submit and mark as delivered?',
      message: `This notifies the client that the work is ready for review.\n\nDeliverables (${deliverables.length}):\n${summary}`,
      confirmLabel: 'Submit',
      onConfirm: () => {
        setConfirmation(null);
        void callOrderAction('submit_delivery', { p_order_id: order.id });
      },
    });
  };

  const removeDeliverable = (deliverable: Deliverable) => {
    setConfirmation({
      title: 'Remove deliverable?',
      message: `“${deliverable.file_name || 'Deliverable'}” will be removed from this commission.`,
      confirmLabel: 'Remove',
      onConfirm: () => {
        setConfirmation(null);
        void (async () => {
            setIsBusy(true);
            setErrorMessage('');
            if (!/^https?:\/\//i.test(deliverable.file_url)) {
              const { error: storageError } = await supabase.storage
                .from(DELIVERY_BUCKET)
                .remove([deliverable.file_url]);
              if (storageError) {
                setIsBusy(false);
                setErrorMessage(storageError.message);
                return;
              }
            }

            const { error } = await supabase
              .from('deliverables')
              .delete()
              .eq('id', deliverable.id)
              .eq('uploaded_by', userId);
            setIsBusy(false);
            if (error) {
              setErrorMessage(error.message);
              return;
            }
            await loadCommission();
        })();
      },
    });
  };

  const openDeliverable = async (deliverable: Deliverable) => {
    if (/^https?:\/\//i.test(deliverable.file_url)) {
      await Linking.openURL(deliverable.file_url);
      return;
    }

    const { data, error } = await supabase.storage
      .from(DELIVERY_BUCKET)
      .createSignedUrl(deliverable.file_url, 60 * 60);
    if (error || !data?.signedUrl) {
      setErrorMessage(error?.message || 'Could not open this delivery file.');
      return;
    }
    await Linking.openURL(data.signedUrl);
  };

  const fileDispute = async () => {
    if (!disputeReason.trim()) {
      setErrorMessage('Choose the reason that best describes the issue.');
      return;
    }
    if (!disputeExplanation.trim()) {
      setErrorMessage('Add a detailed explanation before submitting the dispute.');
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    const uploadedEvidence: { file_url: string; file_name: string }[] = [];
    let uploadError = '';

    for (const [index, asset] of disputeEvidence.entries()) {
      const extension = asset.name.split('.').pop()?.toLowerCase() || 'bin';
      const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileUrl = `${order.id}/${userId}/evidence-${Date.now()}-${index}-${Math.random()
        .toString(36)
        .slice(2, 8)}-${safeName}`;
      try {
        const fileBody = await readPickedFile(asset, `dispute-${Date.now()}-${index}-${safeName}`);
        const fileSize = asset.size ?? asset.file?.size ??
          ('byteLength' in fileBody ? fileBody.byteLength : 0);
        if (fileSize > MAX_DISPUTE_EVIDENCE_SIZE) {
          uploadError = `${asset.name} is over the 25 MB per-file limit.`;
          break;
        }

        const { error } = await supabase.storage.from(DISPUTE_BUCKET).upload(fileUrl, fileBody, {
          contentType: asset.mimeType || mimeTypeFor(extension),
          upsert: false,
        });
        if (error) {
          uploadError = `Could not upload ${asset.name}: ${error.message}`;
          break;
        }
        uploadedEvidence.push({ file_url: fileUrl, file_name: asset.name });
      } catch (error) {
        uploadError = `Could not upload ${asset.name}: ${error instanceof Error ? error.message : 'Unknown upload error'}`;
        break;
      }
    }

    if (uploadError) {
      if (uploadedEvidence.length) {
        await supabase.storage
          .from(DISPUTE_BUCKET)
          .remove(uploadedEvidence.map((file) => file.file_url));
      }
      setIsBusy(false);
      setErrorMessage(uploadError);
      return;
    }

    const { error } = await supabase.rpc('file_dispute_with_attachments', {
      p_order_id: order.id,
      p_reason: DISPUTE_REASONS.find((reason) => reason.value === disputeReason)?.label || disputeReason,
      p_explanation: disputeExplanation.trim().slice(0, 1000),
      p_attachments: uploadedEvidence,
    });
    if (error) {
      if (uploadedEvidence.length) {
        await supabase.storage
          .from(DISPUTE_BUCKET)
          .remove(uploadedEvidence.map((file) => file.file_url));
      }
      setIsBusy(false);
      setErrorMessage(error.message);
      return;
    }
    setIsBusy(false);

    setDisputeReason('');
    setDisputeExplanation('');
    setDisputeEvidence([]);
    setIsDisputePanelOpen(false);
    await loadCommission();
  };

  const chooseDisputeEvidence = async () => {
    setErrorMessage('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/png', 'image/jpeg', 'application/pdf', 'application/zip', 'video/mp4'],
        multiple: true,
        copyToCacheDirectory: Platform.OS !== 'android',
      });
      if (result.canceled) return;

      const invalidFile = result.assets.find((asset) => {
        const extension = asset.name.split('.').pop()?.toLowerCase();
        return !extension || !ALLOWED_DISPUTE_EVIDENCE_EXTENSIONS.includes(extension);
      });
      if (invalidFile) {
        setErrorMessage(`${invalidFile.name} is not a supported evidence format. Choose PNG, JPG, PDF, ZIP, or MP4.`);
        return;
      }

      const existingUris = new Set(disputeEvidence.map((file) => file.uri));
      const addedFiles = result.assets.filter((file) => !existingUris.has(file.uri));
      if (disputeEvidence.length + addedFiles.length > MAX_DISPUTE_EVIDENCE_FILES) {
        setErrorMessage(`You can attach up to ${MAX_DISPUTE_EVIDENCE_FILES} evidence files.`);
        return;
      }
      const oversizedFile = addedFiles.find(
        (file) => (pickedFileSize(file) ?? 0) > MAX_DISPUTE_EVIDENCE_SIZE,
      );
      if (oversizedFile) {
        setErrorMessage(`${oversizedFile.name} is over the 25 MB per-file limit.`);
        return;
      }
      setDisputeEvidence((current) => [...current, ...addedFiles]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not open the file picker.');
    }
  };

  const renderButton = (
    label: string,
    onPress: () => void,
    secondary = false,
  ) => (
    <Pressable
      disabled={isBusy}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        isBusy && styles.disabledButton,
      ]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>
        {isBusy ? 'Please wait…' : label}
      </Text>
    </Pressable>
  );

  const renderDeliverable = (deliverable: Deliverable) => (
    <View key={deliverable.id} style={styles.deliverableRow}>
      <Pressable
        onPress={() => openDeliverable(deliverable)}
        style={styles.deliverableOpen}>
        <Text style={styles.deliverableIcon}>▣</Text>
        <View style={styles.deliverableText}>
          <Text style={styles.deliverableName}>
            {deliverable.file_name || 'Deliverable'}
          </Text>
          <Text style={styles.mutedText}>
            {/^https?:\/\//i.test(deliverable.file_url)
              ? 'Shared link'
              : formatFileSize(deliverable.file_size_bytes)}
          </Text>
        </View>
        <Text style={styles.deliverableLink}>Open</Text>
      </Pressable>
      {currentStatus === 'in_progress' && !isClient && (
        <Pressable onPress={() => removeDeliverable(deliverable)} disabled={isBusy}>
          <Text style={styles.removeFile}>Remove</Text>
        </Pressable>
      )}
    </View>
  );

  const disputeIsAvailable = isClient && ['escrow_locked', 'in_progress', 'delivered'].includes(currentStatus);

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 8) }]}>
      <Header onBack={() => router.back()} />

      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            const shouldOpenReview = Array.isArray(params.review) ? params.review[0] === '1' : params.review === '1';
            if (shouldOpenReview && ['completed', 'cancelled'].includes(order.status)) {
              scrollViewRef.current?.scrollToEnd({ animated: true });
            }
          }}>
        <Text style={styles.eyebrow}>COMMISSION · AS {userRole.toUpperCase()}</Text>
        <Text style={styles.heading}>{requestTitle}</Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryIdentity}>
              <Text style={styles.counterpartyName}>
                @{counterpart?.username || 'user'} · {isClient ? 'Hunter' : 'Client'}
              </Text>
              <Text style={styles.mutedText}>
                Created {new Date(order.created_at).toLocaleDateString()}
              </Text>
            </View>
            <Text style={styles.statusBadge}>
              {STATUS_LABELS[currentStatus] || currentStatus}
            </Text>
          </View>

          <View style={styles.divider} />
          <Text style={styles.valueLabel}>Commission Value</Text>
          <Text style={styles.valueAmount}>
            {formatPeso(order.amount)} <Text style={styles.currency}>PHP</Text>
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Progress Tracker</Text>
          <View style={styles.timeline}>
            {PROGRESS_STEPS.map((step, index) => {
              const isComplete = progressIndex >= index;
              const isCurrent = progressIndex === index;

              return (
                <View key={step.title} style={styles.timelineStep}>
                  <View style={styles.timelineNodeColumn}>
                    <View
                      style={[
                        styles.timelineNode,
                        isComplete && styles.timelineNodeComplete,
                        isCurrent && styles.timelineNodeCurrent,
                      ]}>
                      <Text
                        style={[
                          styles.timelineCheck,
                          isComplete && styles.timelineCheckVisible,
                        ]}>
                        {isComplete ? '✓' : ''}
                      </Text>
                    </View>
                    {index < PROGRESS_STEPS.length - 1 && (
                      <View
                        style={[
                          styles.timelineConnector,
                          isComplete && styles.timelineConnectorComplete,
                        ]}
                      />
                    )}
                  </View>

                  <View style={styles.timelineText}>
                    <Text
                      style={[
                        styles.timelineTitle,
                        isComplete && styles.timelineTitleComplete,
                        isCurrent && styles.timelineTitleCurrent,
                      ]}>
                      {step.title}
                    </Text>
                    <Text style={styles.mutedText}>{step.description}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {currentStatus === 'disputed' && (
            <View style={styles.disputeNotice}>
              <Text style={styles.disputeNoticeText}>
                ⚠ Commission disputed. Actions are frozen pending resolution.
              </Text>
              <Pressable
                onPress={() => {
                  if (disputeId) {
                    router.push({ pathname: '/disputes/[id]', params: { id: disputeId } } as any);
                  } else {
                    setErrorMessage('The dispute record could not be found. Please try again.');
                  }
                }}
                style={[styles.button, styles.secondaryButton]}>
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>View Dispute</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Commission Details</Text>
          <DetailRow label="Client" value={`@${client?.username || 'user'}`} />
          <DetailRow label="Hunter" value={`@${hunter?.username || 'user'}`} />
          <DetailRow label="Amount" value={formatPeso(order.amount)} />
          <DetailRow label="Created" value={new Date(order.created_at).toLocaleDateString()} />

          {order.delivered_at && (
            <DetailRow
              label="Delivered"
              value={new Date(order.delivered_at).toLocaleString()}
            />
          )}
          {order.auto_release_at && currentStatus === 'delivered' && (
            <DetailRow
              label="Escrow auto-release"
              value={new Date(order.auto_release_at).toLocaleString()}
            />
          )}

          {order.request_id && (
            <Pressable
              onPress={() => router.push(`/service-request/${order.request_id}` as any)}
              style={[styles.button, styles.secondaryButton]}>
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>View Request</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>
            {currentStatus === 'in_progress' && !isClient
              ? 'Deliver Work'
              : currentStatus === 'delivered'
                ? 'Delivery'
                : 'Actions'}
          </Text>

          {currentStatus === 'created' && isClient &&
            renderButton('Lock Escrow', openEscrowSheet)}
          {currentStatus === 'created' && isClient && renderButton('Cancel Commission', () => setConfirmation({
            title: 'Cancel this commission?',
            message: 'This only works before escrow is locked. The request will reopen for new bids, the Hunter will be notified, and both of you will be invited to review each other. The Hunter can rate the experience, which may affect your Client rating.',
            confirmLabel: 'Cancel Commission',
            onConfirm: () => {
              setConfirmation(null);
              void cancelCommission();
            },
          }), true)}
          {currentStatus === 'escrow_locked' && !isClient &&
            renderButton('Start Work', () =>
              callOrderAction('start_work', { p_order_id: order.id }),
            )}

          {currentStatus === 'in_progress' && !isClient && (
            <>
              <Text style={styles.mutedText}>
                Upload project files or hand over assets to the client for inspection.
              </Text>
              <Text style={styles.inputLabel}>
                Attached Deliverables ({deliverables.length})
              </Text>
              {deliverables.map(renderDeliverable)}

              <View style={styles.form}>
                {renderButton('Choose Files', chooseDeliverables, true)}
                {selectedFiles.map((file) => (
                  <View key={file.uri} style={styles.deliverableRow}>
                    <View style={styles.deliverableText}>
                      <Text style={styles.deliverableName}>{file.name}</Text>
                      <Text style={styles.mutedText}>{formatFileSize(pickedFileSize(file))}</Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        setSelectedFiles((current) => current.filter((item) => item.uri !== file.uri))
                      }>
                      <Text style={styles.removeFile}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
                {selectedFiles.length > 0 &&
                  renderButton(
                    `Upload ${selectedFiles.length} File${selectedFiles.length === 1 ? '' : 's'}`,
                    uploadDeliverables,
                  )}
                <Text style={styles.orLabel}>Or share a larger file by link</Text>
                <TextInput
                  value={linkName}
                  onChangeText={setLinkName}
                  onFocus={() =>
                    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 250)
                  }
                  placeholder="Link name (optional)"
                  placeholderTextColor="#777"
                  style={styles.input}
                />
                <TextInput
                  value={linkUrl}
                  onChangeText={setLinkUrl}
                  onFocus={() =>
                    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 250)
                  }
                  placeholder="Google Drive or download link"
                  placeholderTextColor="#777"
                  autoCapitalize="none"
                  keyboardType="url"
                  style={styles.input}
                />
                {renderButton('Add Share Link', addDeliverableLink, true)}
              </View>

              {renderButton('Submit & Mark as Delivered', submitDelivery)}
            </>
          )}

          {currentStatus === 'delivered' && (
            <>
              {deliverables.length > 0 ? (
                deliverables.map(renderDeliverable)
              ) : (
                <Text style={styles.mutedText}>No delivery files are attached.</Text>
              )}

              {isClient &&
                renderButton('Accept Delivery & Release Escrow', () => setConfirmation({
                  title: 'Accept delivery and release escrow?',
                  message: `The Commis Team receives a 10% service fee (${formatPeso(Number(order.amount) * 0.1)}). @${hunter?.username || 'the Hunter'} receives the remaining 90% (${formatPeso(Number(order.amount) * 0.9)}). You’ll then be invited to review each other.`,
                  confirmLabel: 'Accept & Release',
                  onConfirm: () => {
                    setConfirmation(null);
                    void callOrderAction('release_escrow', { p_order_id: order.id });
                  },
                }))}

              {!isClient && (
                <Text style={styles.mutedText}>
                  The client has 72 hours to review. Escrow releases automatically if no dispute is
                  filed.
                </Text>
              )}
            </>
          )}

          {currentStatus === 'completed' && (
            order.team_fee_amount == null ? (
              <Text style={styles.mutedText}>This commission is complete and escrow has been released.</Text>
            ) : (
              <Text style={styles.mutedText}>
                Completed. The Commis Team received its 10% service fee ({formatPeso(order.team_fee_amount)}); the hunter received {formatPeso(Number(order.amount) - Number(order.team_fee_amount))}.
              </Text>
            )
          )}
          {currentStatus === 'cancelled' && (
            <Text style={styles.mutedText}>This commission was cancelled before escrow was locked. The request is open for new bids.</Text>
          )}
          {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}
        </View>

        {['completed', 'cancelled'].includes(currentStatus) && (
          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>Reviews</Text>
            {(() => {
              const myReview = reviews.find((review) => review.reviewer_id === userId);
              const receivedReview = reviews.find((review) => review.reviewee_id === userId);
              return (
                <>
                  {myReview ? (
                    <View style={styles.reviewSubmitted}>
                      <Text style={styles.reviewTitle}>Your review was submitted</Text>
                      <Text style={styles.reviewStars}>{'★'.repeat(myReview.rating)}{'☆'.repeat(5 - myReview.rating)}</Text>
                      {myReview.comment ? <MarkdownText style={styles.mutedText}>{myReview.comment}</MarkdownText> : null}
                    </View>
                  ) : (
                    <>
                      <Text style={styles.mutedText}>Rate @{counterpart?.username || (isClient ? 'the Hunter' : 'the Client')} for this commission. Your rating updates their {isClient ? 'Hunter' : 'Client'} profile score.</Text>
                      <View style={styles.reviewStarsRow}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Pressable key={star} onPress={() => setReviewRating(star)} accessibilityRole="button" accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}>
                            <Text style={[styles.reviewStar, star <= reviewRating && styles.reviewStarSelected]}>★</Text>
                          </Pressable>
                        ))}
                      </View>
                      <RichTextInput
                        value={reviewComment}
                        onChangeText={(value) => setReviewComment(value.slice(0, 1000))}
                        placeholder="Write an optional review"
                        placeholderTextColor="#777"
                        multiline
                        maxLength={1000}
                        style={[styles.input, styles.reviewInput]}
                      />
                      {renderButton('Submit Review', () => void submitReview())}
                    </>
                  )}
                  {receivedReview ? (
                    <View style={styles.reviewSubmitted}>
                      <Text style={styles.reviewTitle}>Their review of you</Text>
                      <Text style={styles.reviewStars}>{'★'.repeat(receivedReview.rating)}{'☆'.repeat(5 - receivedReview.rating)}</Text>
                      {receivedReview.comment ? <MarkdownText style={styles.mutedText}>{receivedReview.comment}</MarkdownText> : <Text style={styles.mutedText}>No written comment.</Text>}
                    </View>
                  ) : null}
                </>
              );
            })()}
          </View>
        )}
        {disputeIsAvailable && (
          <View style={styles.disputeEntryCard}>
            <Text style={styles.disputeEntryTitle}>Need help with this commission?</Text>
            <Text style={styles.mutedText}>
              Ask the Commis Team to review the issue. Escrow stays locked while a dispute is reviewed.
            </Text>
            <Pressable
              onPress={() => {
                setErrorMessage('');
                setIsDisputePanelOpen(true);
              }}
              style={[styles.button, styles.secondaryButton]}>
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>File a Dispute</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={isDisputePanelOpen}
        animationType="slide"
        onRequestClose={() => setIsDisputePanelOpen(false)}>
        <View style={[styles.screen, { paddingTop: Math.max(insets.top, 8) }]}>
          <Header title="Submit Dispute" onBack={() => setIsDisputePanelOpen(false)} />
          <KeyboardAvoidingView
            style={styles.keyboardAvoiding}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView
              ref={disputeScrollViewRef}
              contentContainerStyle={styles.disputeContent}
              keyboardShouldPersistTaps="handled">
              <View style={styles.disputeSummaryCard}>
                <View style={styles.disputeSummaryHeader}>
                  <Text style={styles.eyebrow}>COMMISSION IN REVIEW</Text>
                  <Text style={styles.statusBadge}>{STATUS_LABELS[currentStatus] || currentStatus}</Text>
                </View>
                <Text style={styles.disputeSummaryTitle}>{requestTitle}</Text>
                <Text style={styles.mutedText}>
                  @{client?.username || 'client'} · Escrow {formatPeso(order.amount)}
                </Text>
              </View>

              <View style={styles.disputeSection}>
                <Text style={styles.inputLabel}>WHY ARE YOU DISPUTING THIS COMMISSION?</Text>
                <Text style={styles.mutedText}>
                  Select the reason that best describes the problem.
                </Text>
                {DISPUTE_REASONS.map((reason) => {
                  const selected = disputeReason === reason.value;
                  return (
                    <Pressable
                      key={reason.value}
                      onPress={() => setDisputeReason(reason.value)}
                      style={[styles.disputeReasonCard, selected && styles.disputeReasonSelected]}>
                      <Text style={[styles.disputeReasonText, selected && styles.disputeReasonTextSelected]}>
                        {reason.label}
                      </Text>
                      <View style={[styles.disputeRadio, selected && styles.disputeRadioSelected]}>
                        {selected && <View style={styles.disputeRadioDot} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.disputeSection}>
                <View style={styles.disputeSummaryHeader}>
                  <Text style={styles.inputLabel}>DETAILED EXPLANATION</Text>
                  <Text style={styles.mutedText}>{disputeExplanation.length} / 1000</Text>
                </View>
                <RichTextInput
                  value={disputeExplanation}
                  onChangeText={(value) => setDisputeExplanation(value.slice(0, 1000))}
                  onFocus={() =>
                    setTimeout(
                      () => disputeScrollViewRef.current?.scrollToEnd({ animated: true }),
                      250,
                    )
                  }
                  placeholder="Explain what was wrong with the delivery, including missing requirements or defects. You can also paste a Google Drive link to supporting evidence."
                  placeholderTextColor="#777"
                  multiline
                  textAlignVertical="top"
                  style={[styles.input, styles.disputeExplanationInput]}
                />
                <Text style={styles.mutedText}>
                  Include clear details or references to specific deliverables to help the review.
                </Text>
              </View>

              <View style={styles.disputeSection}>
                <Text style={styles.inputLabel}>
                  SUPPORTING EVIDENCE ({disputeEvidence.length}/{MAX_DISPUTE_EVIDENCE_FILES}) · OPTIONAL
                </Text>
                <Text style={styles.mutedText}>
                  Attach screenshots, documents, or video. Up to 5 files, 25 MB each (PNG, JPG, PDF, ZIP, MP4).
                </Text>
                {renderButton('Choose Evidence Files', chooseDisputeEvidence, true)}
                {disputeEvidence.map((file) => (
                  <View key={file.uri} style={styles.evidenceFileRow}>
                    <View style={styles.deliverableText}>
                      <Text style={styles.deliverableName} numberOfLines={2}>{file.name}</Text>
                      <Text style={styles.mutedText}>{formatFileSize(pickedFileSize(file))}</Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        setDisputeEvidence((current) => current.filter((item) => item.uri !== file.uri))
                      }>
                      <Text style={styles.removeFile}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
              </View>

              <View style={styles.mediationNotice}>
                <Text style={styles.mediationTitle}>Mediation Protocol</Text>
                <Text style={styles.mutedText}>
                  The Commis Team will review your dispute. Submitting it does not automatically issue a refund. Funds remain locked in escrow until the dispute is resolved.
                </Text>
              </View>
              {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}
              {renderButton('Submit Dispute', fileDispute)}
              {renderButton('Cancel', () => setIsDisputePanelOpen(false), true)}
              <Text style={styles.disputeFooter}>
                Submitting a dispute changes the commission status to Disputed.
              </Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={isEscrowSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsEscrowSheetOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsEscrowSheetOpen(false)}
          />
          <View style={[styles.escrowSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Lock Funds in Escrow</Text>

            <View style={styles.escrowSummary}>
              <View style={styles.summaryCommission}>
                <Text style={styles.inputLabel}>Gig / Commission</Text>
                <Text style={styles.counterpartyName}>{requestTitle}</Text>
              </View>
              <View style={styles.lockedTarget}>
                <Text style={styles.inputLabel}>Locked Target</Text>
                <Text style={styles.counterpartyName}>{formatPeso(order.amount)}</Text>
              </View>
            </View>

            {hasInsufficientFunds && (
              <View style={styles.shortfallNotice}>
                <Text style={styles.shortfallTitle}>Insufficient Funds</Text>
                <Text style={styles.mutedText}>
                  You need {formatPeso(Number(order.amount) - (availableBalance ?? 0))} more in
                  available funds to lock this escrow amount.
                </Text>
              </View>
            )}

            <View style={styles.fundFlow}>
              <Text style={styles.fundFlowTitle}>FUND ALLOCATION FLOW</Text>
              <DetailRow
                label="Current Available Funds"
                value={formatPeso(availableBalance ?? 0)}
              />
              <View style={styles.fundBreakdown}>
                <View style={styles.fundCell}>
                  <Text style={styles.inputLabel}>Available After</Text>
                  <Text style={styles.counterpartyName}>
                    {formatPeso(Math.max(0, (availableBalance ?? 0) - Number(order.amount)))}
                  </Text>
                </View>
                <View style={styles.escrowCell}>
                  <Text style={styles.inputLabel}>In Escrow</Text>
                  <Text style={styles.counterpartyName}>{formatPeso(order.amount)}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.mutedText}>
              Funds remain held until the commission is completed or dispute mediation concludes.
            </Text>

            {hasInsufficientFunds
              ? renderButton(
                  `Add Funds (${formatPeso(Number(order.amount) - (availableBalance ?? 0))} Needed)`,
                  () => {
                    setIsEscrowSheetOpen(false);
                    router.push('/funds' as any);
                  },
                )
              : renderButton(`Lock ${formatPeso(order.amount)}`, () =>
                  callOrderAction('lock_escrow', { p_order_id: order.id }),
                )}
            {renderButton('Cancel', () => setIsEscrowSheetOpen(false), true)}
          </View>
        </View>
      </Modal>
      <ConfirmationModal
        visible={Boolean(confirmation)}
        title={confirmation?.title || ''}
        message={confirmation?.message}
        confirmLabel={confirmation?.confirmLabel}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => confirmation?.onConfirm()}
        busy={isBusy}
      />
    </View>
  );
}

function Header({ onBack, title = 'Commission' }: HeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>‹</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.mutedText}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#121212',
  },
  keyboardAvoiding: {
    flex: 1,
  },
  loadingScreen: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backButton: {
    width: 36,
  },
  backButtonText: {
    color: '#aaa',
    fontSize: 32,
  },
  headerTitle: {
    color: '#f2f2f2',
    fontSize: 17,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 36,
  },
  eyebrow: {
    color: '#9d9a91',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  heading: {
    marginTop: -8,
    color: '#f2f2f2',
    fontSize: 23,
    fontWeight: '800',
  },
  summaryCard: {
    gap: 12,
    padding: 16,
    backgroundColor: '#181818',
    borderColor: '#292929',
    borderWidth: 1,
    borderRadius: 14,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryIdentity: {
    flex: 1,
  },
  counterpartyName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  mutedText: {
    color: '#999',
    fontSize: 12,
    lineHeight: 18,
  },
  statusBadge: {
    overflow: 'hidden',
    paddingVertical: 6,
    paddingHorizontal: 9,
    color: '#e6e2ca',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#252523',
    borderColor: '#36352f',
    borderWidth: 1,
    borderRadius: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#2c2b29',
  },
  valueLabel: {
    color: '#aaa',
    fontSize: 11,
  },
  valueAmount: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  currency: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '500',
  },
  panel: {
    gap: 12,
    padding: 15,
    paddingBottom: 40,
    backgroundColor: '#181818',
    borderColor: '#292929',
    borderWidth: 1,
    borderRadius: 14,
  },
  sectionTitle: {
    marginBottom: 2,
    color: '#f2f2f2',
    fontSize: 16,
    fontWeight: '700',
  },
  timeline: {
    paddingTop: 4,
  },
  timelineStep: {
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingBottom: 12,
  },
  timelineNodeColumn: {
    position: 'relative',
    width: 24,
    alignItems: 'center',
  },
  timelineConnector: {
    position: 'absolute',
    left: 11,
    top: 23,
    bottom: -12,
    zIndex: 0,
    width: 2,
    backgroundColor: '#444',
  },
  timelineConnectorComplete: {
    backgroundColor: '#ffe600',
  },
  timelineNode: {
    zIndex: 2,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181818',
    borderColor: '#555',
    borderWidth: 1.5,
    borderRadius: 12,
  },
  timelineNodeComplete: {
    backgroundColor: '#ffe600',
    borderColor: '#ffe600',
  },
  timelineNodeCurrent: {
    borderColor: '#ffe600',
  },
  timelineCheck: {
    color: 'transparent',
    fontSize: 13,
  },
  timelineCheckVisible: {
    color: '#121212',
    fontWeight: '900',
  },
  timelineText: {
    flex: 1,
    paddingTop: 1,
  },
  timelineTitle: {
    marginBottom: 2,
    color: '#aaa',
    fontSize: 14,
    fontWeight: '600',
  },
  timelineTitleComplete: {
    color: '#eee',
  },
  timelineTitleCurrent: {
    color: '#ffe600',
    fontWeight: '800',
  },
  disputeNotice: {
    gap: 10,
    padding: 12,
    backgroundColor: '#321719',
    borderRadius: 9,
  },
  disputeNoticeText: {
    color: '#ffb1ad',
    fontSize: 12,
  },
  disputeEntryCard: {
    gap: 9,
    padding: 15,
    backgroundColor: '#181818',
    borderColor: '#292929',
    borderWidth: 1,
    borderRadius: 14,
  },
  disputeEntryTitle: {
    color: '#eee',
    fontSize: 15,
    fontWeight: '700',
  },
  reviewStarsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  reviewStar: {
    color: '#555',
    fontSize: 34,
  },
  reviewStarSelected: {
    color: '#FFE600',
  },
  reviewStars: {
    color: '#FFE600',
    fontSize: 20,
    letterSpacing: 2,
  },
  reviewInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  reviewSubmitted: {
    gap: 5,
    padding: 12,
    backgroundColor: '#1c1b1b',
    borderRadius: 10,
  },
  reviewTitle: {
    color: '#eee',
    fontSize: 13,
    fontWeight: '700',
  },
  disputeContent: {
    gap: 16,
    padding: 16,
    paddingBottom: 28,
  },
  disputeSummaryCard: {
    gap: 9,
    padding: 15,
    backgroundColor: '#1c1b1b',
    borderRadius: 13,
  },
  disputeSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  disputeSummaryTitle: {
    color: '#eee',
    fontSize: 17,
    fontWeight: '700',
  },
  disputeSection: {
    gap: 8,
  },
  disputeReasonCard: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 13,
    backgroundColor: '#1c1b1b',
    borderColor: '#292929',
    borderWidth: 1,
    borderRadius: 12,
  },
  disputeReasonSelected: {
    backgroundColor: '#2a2a2a',
    borderColor: '#ffe600',
  },
  disputeReasonText: {
    flex: 1,
    color: '#e5e2e1',
    fontSize: 13,
    fontWeight: '600',
  },
  disputeReasonTextSelected: {
    color: '#fff',
  },
  disputeRadio: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#353534',
    borderRadius: 10,
  },
  disputeRadioSelected: {
    backgroundColor: '#fde400',
  },
  disputeRadioDot: {
    width: 8,
    height: 8,
    backgroundColor: '#201c00',
    borderRadius: 4,
  },
  disputeExplanationInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  evidenceFileRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#1c1b1b',
    borderRadius: 10,
  },
  mediationNotice: {
    gap: 6,
    padding: 14,
    backgroundColor: '#1c1b1b',
    borderRadius: 12,
  },
  mediationTitle: {
    color: '#eee',
    fontSize: 13,
    fontWeight: '700',
  },
  disputeFooter: {
    color: '#888',
    fontSize: 11,
    textAlign: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  detailValue: {
    color: '#eee',
    fontSize: 12,
    fontWeight: '600',
  },
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    paddingHorizontal: 12,
    backgroundColor: '#ffe600',
    borderRadius: 11,
  },
  buttonText: {
    color: '#121212',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#222',
    borderColor: '#383838',
    borderWidth: 1,
  },
  secondaryButtonText: {
    color: '#eee',
  },
  disabledButton: {
    opacity: 0.55,
  },
  inputLabel: {
    color: '#aaa',
    fontSize: 11,
  },
  input: {
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#eee',
    fontSize: 13,
    backgroundColor: '#202020',
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 9,
  },
  multilineInput: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  form: {
    gap: 9,
    marginTop: 4,
  },
  orLabel: {
    paddingTop: 4,
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
  },
  deliverableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    backgroundColor: '#202020',
    borderRadius: 10,
  },
  deliverableOpen: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deliverableIcon: {
    color: '#ffe600',
    fontSize: 18,
  },
  deliverableText: {
    flex: 1,
  },
  deliverableName: {
    color: '#eee',
    fontSize: 13,
    fontWeight: '600',
  },
  deliverableLink: {
    color: '#ffe600',
    fontSize: 12,
    fontWeight: '700',
  },
  removeFile: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    color: '#ff9994',
    fontSize: 12,
    fontWeight: '600',
  },
  errorMessage: {
    marginTop: 5,
    color: '#ff9994',
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  escrowSheet: {
    gap: 14,
    maxHeight: '92%',
    padding: 20,
    backgroundColor: '#181818',
    borderColor: '#343434',
    borderWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    marginBottom: 2,
    backgroundColor: '#555',
    borderRadius: 3,
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
  },
  escrowSummary: {
    flexDirection: 'row',
    gap: 10,
    padding: 13,
    backgroundColor: '#202020',
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 15,
  },
  summaryCommission: {
    flex: 1,
  },
  lockedTarget: {
    alignItems: 'flex-end',
  },
  shortfallNotice: {
    gap: 4,
    padding: 12,
    backgroundColor: '#321719',
    borderColor: '#713238',
    borderWidth: 1,
    borderRadius: 12,
  },
  shortfallTitle: {
    color: '#ffb1ad',
    fontSize: 13,
    fontWeight: '800',
  },
  fundFlow: {
    gap: 12,
    padding: 13,
    backgroundColor: '#202020',
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 15,
  },
  fundFlowTitle: {
    color: '#aaa',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  fundBreakdown: {
    flexDirection: 'row',
    gap: 9,
  },
  fundCell: {
    flex: 1,
    gap: 5,
    padding: 10,
    backgroundColor: '#121212',
    borderRadius: 11,
  },
  escrowCell: {
    flex: 1,
    gap: 5,
    padding: 10,
    backgroundColor: '#2c2810',
    borderColor: '#655b15',
    borderWidth: 1,
    borderRadius: 11,
  },
});
