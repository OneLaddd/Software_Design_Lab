import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { RichTextInput } from '@/components/rich-text-input';
import { MarkdownText } from '@/components/markdown-text';

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
}

const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 2000;

function formatPeso(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) && value !== '' ? `₱${amount.toLocaleString()}` : '₱0';
}

export default function PostBountyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;
  const isEditing = Boolean(requestId);
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [minimumBudget, setMinimumBudget] = useState('');
  const [maximumBudget, setMaximumBudget] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<CategoryRow[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryResults, setCategoryResults] = useState<CategoryRow[]>([]);
  const [isSearchingCategories, setIsSearchingCategories] = useState(false);
  const [categorySearchError, setCategorySearchError] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [minimumTouched, setMinimumTouched] = useState(false);
  const [maximumTouched, setMaximumTouched] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [initialCategoryIds, setInitialCategoryIds] = useState<string[]>([]);
  const [isEditLoading, setIsEditLoading] = useState(Boolean(requestId));
  const [editLoadError, setEditLoadError] = useState('');

  const minimumValue = Number(minimumBudget);
  const maximumValue = Number(maximumBudget);
  const budgetValid =
    minimumBudget.trim() !== '' &&
    maximumBudget.trim() !== '' &&
    Number.isFinite(minimumValue) &&
    Number.isFinite(maximumValue) &&
    minimumValue > 0 &&
    maximumValue >= minimumValue;
  const formValid = Boolean(
    title.trim() &&
      description.trim() &&
      (isEditing || budgetValid) &&
      (isEditing || selectedCategories.length > 0)
  );

  useEffect(() => {
    if (!requestId) return;
    let active = true;

    async function loadRequestForEditing() {
      setIsEditLoading(true);
      setEditLoadError('');

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        if (active) {
          setEditLoadError('Please sign in to edit this request.');
          setIsEditLoading(false);
        }
        return;
      }

      const { data: request, error: requestError } = await supabase
        .from('service_requests')
        .select('id, client_id, title, description, budget_min, budget_max, status')
        .eq('id', requestId)
        .maybeSingle();

      if (!active) return;
      if (requestError || !request) {
        setEditLoadError('Could not load this request for editing.');
        setIsEditLoading(false);
        return;
      }
      if (request.client_id !== user.id) {
        setEditLoadError('Only the client who posted this request can edit it.');
        setIsEditLoading(false);
        return;
      }
      if (request.status !== 'open') {
        setEditLoadError('Only open requests can be edited.');
        setIsEditLoading(false);
        return;
      }

      const { data: categoryLinks, error: categoriesError } = await supabase
        .from('request_categories')
        .select('category_id, categories(id, name, slug)')
        .eq('request_id', requestId);

      if (!active) return;
      if (categoriesError) {
        setEditLoadError('Could not load this request’s categories.');
        setIsEditLoading(false);
        return;
      }

      const loadedCategories = (categoryLinks ?? []).flatMap((link) => {
        if (!link.categories) return [];
        return Array.isArray(link.categories) ? link.categories : [link.categories];
      }) as CategoryRow[];

      setTitle(request.title ?? '');
      setDescription(request.description ?? '');
      setMinimumBudget(request.budget_min == null ? '' : String(request.budget_min));
      setMaximumBudget(request.budget_max == null ? '' : String(request.budget_max));
      setSelectedCategories(loadedCategories);
      setInitialCategoryIds((categoryLinks ?? []).map((link) => link.category_id));
      setIsEditLoading(false);
    }

    void loadRequestForEditing();
    return () => {
      active = false;
    };
  }, [requestId]);

  useEffect(() => {
    const searchValue = categorySearch.trim();
    if (!searchValue) {
      setCategoryResults([]);
      setCategorySearchError('');
      setIsSearchingCategories(false);
      return;
    }

    let isCurrentSearch = true;
    const timeout = setTimeout(async () => {
      setIsSearchingCategories(true);
      setCategorySearchError('');

      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug')
        .ilike('name', `%${searchValue}%`)
        .order('name', { ascending: true })
        .limit(8);

      if (!isCurrentSearch) return;
      setIsSearchingCategories(false);

      if (error) {
        setCategoryResults([]);
        setCategorySearchError('Could not load categories. Try again.');
        console.warn('Failed to search categories:', error);
        return;
      }

      const selectedIds = new Set(selectedCategories.map((category) => category.id));
      setCategoryResults((data ?? []).filter((category) => !selectedIds.has(category.id)));
    }, 250);

    return () => {
      isCurrentSearch = false;
      clearTimeout(timeout);
    };
  }, [categorySearch, selectedCategories]);

  const addCategory = (category: CategoryRow) => {
    setCategoryTouched(true);
    setSelectedCategories((current) =>
      current.some((item) => item.id === category.id) ? current : [...current, category]
    );
    setCategorySearch('');
    setCategoryResults([]);
  };

  const removeCategory = (categoryId: string) => {
    setSelectedCategories((current) => current.filter((item) => item.id !== categoryId));
  };

  const handleCancel = () => {
    if (requestId) {
      router.replace(`/service-request/${requestId}` as any);
      return;
    }
    router.replace('/marketplace' as any);
  };

  const handleSubmit = async () => {
    if (!formValid || isSubmitting) return;
    setSubmitError('');
    setIsSubmitting(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setSubmitError('Please sign in again before posting a bounty.');
        return;
      }

      if (isEditing && requestId) {
        const { data: updatedRequest, error: updateError } = await supabase
          .from('service_requests')
          .update({ description: description.trim() })
          .eq('id', requestId)
          .eq('client_id', user.id)
          .select('id')
          .maybeSingle();

        if (updateError || !updatedRequest) {
          throw updateError ?? new Error('This request could not be updated.');
        }

        const selectedIds = new Set(selectedCategories.map((category) => category.id));
        const categoriesToAdd = selectedCategories.filter(
          (category) => !initialCategoryIds.includes(category.id)
        );
        const categoryIdsToRemove = initialCategoryIds.filter((id) => !selectedIds.has(id));

        if (categoriesToAdd.length > 0) {
          const { error: addCategoriesError } = await supabase.from('request_categories').insert(
            categoriesToAdd.map((category) => ({ request_id: requestId, category_id: category.id }))
          );
          if (addCategoriesError) {
            console.warn('Request description saved, but new categories failed:', addCategoriesError);
            setSubmitError('Description saved, but the category changes could not be completed.');
            return;
          }
        }

        if (categoryIdsToRemove.length > 0) {
          const { error: removeCategoriesError } = await supabase
            .from('request_categories')
            .delete()
            .eq('request_id', requestId)
            .in('category_id', categoryIdsToRemove);
          if (removeCategoriesError) {
            console.warn('Request description saved, but category removal failed:', removeCategoriesError);
            setSubmitError('Description saved, but the category changes could not be completed.');
            return;
          }
        }

        router.replace(`/service-request/${requestId}` as any);
        return;
      }

      const { data: request, error: requestError } = await supabase
        .from('service_requests')
        .insert({
          title: title.trim(),
          description: description.trim(),
          budget_min: minimumValue,
          budget_max: maximumValue,
          client_id: user.id,
        })
        .select('id')
        .single();

      if (requestError || !request) {
        throw requestError ?? new Error('The request could not be created.');
      }

      const { error: categoriesError } = await supabase.from('request_categories').insert(
        selectedCategories.map((category) => ({
          request_id: request.id,
          category_id: category.id,
        }))
      );

      if (categoriesError) {
        setSubmitError('The bounty was created, but its categories could not be saved.');
        console.warn('Failed to save request categories:', categoriesError);
        return;
      }

      router.replace('/marketplace' as any);
    } catch (error) {
      console.warn('Failed to post bounty:', error);
      setSubmitError('Could not post the bounty. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const titleError = titleTouched && !title.trim() ? 'Title is required.' : '';
  const descriptionError =
    descriptionTouched && !description.trim() ? 'Description is required.' : '';
  const budgetTouched = minimumTouched || maximumTouched;
  const budgetError =
    budgetTouched && !budgetValid
      ? 'Enter a minimum above zero and a maximum at least as large.'
      : '';

  if (isEditLoading) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
          <Pressable onPress={handleCancel} style={styles.backButton} accessibilityRole="button">
            <Text style={styles.cancelText}>Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Edit Request</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.stateContainer}>
          <Text style={styles.helperText}>Loading request...</Text>
        </View>
      </View>
    );
  }

  if (isEditing && editLoadError) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
          <Pressable onPress={handleCancel} style={styles.backButton} accessibilityRole="button">
            <Text style={styles.cancelText}>Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Edit Request</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.stateContainer}>
          <Text style={styles.errorText}>{editLoadError}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable
          onPress={handleCancel}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to Marketplace">
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path
              d="M19 12H5m0 0 7-7m-7 7 7 7"
              stroke="#E5E2E1"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Request' : 'Post Bounty'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 20) + 18 },
        ]}>
        <View style={styles.fieldSection}>
          <View style={styles.labelRow}>
            <Text style={styles.fieldLabel}>
              {isEditing ? 'Request Title' : 'Bounty Title'} <Text style={styles.required}>*</Text>
            </Text>
            <Text style={styles.counter}>{title.length} / {MAX_TITLE_LENGTH}</Text>
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={() => setTitleTouched(true)}
            editable={!isEditing}
            maxLength={MAX_TITLE_LENGTH}
            placeholder="Enter a clear, specific title"
            placeholderTextColor="#AAA69A"
            style={[styles.titleInput, titleError ? styles.inputError : null, isEditing && styles.readOnlyInput]}
            accessibilityLabel="Bounty Title"
          />
          {titleError ? <Text style={styles.errorText}>{titleError}</Text> : null}
          <View style={styles.helperRow}>
            <Text style={styles.helperIcon}>✦</Text>
            <Text style={styles.helperText}>
              {isEditing ? 'The title cannot be changed after posting.' : 'Clear, specific titles attract more relevant bids'}
            </Text>
          </View>
        </View>

        <View style={styles.fieldSection}>
          <View style={styles.labelRow}>
            <Text style={styles.fieldLabel}>
              Description <Text style={styles.required}>*</Text>
            </Text>
            <Text style={styles.counter}>
              {description.length.toLocaleString()} / {MAX_DESCRIPTION_LENGTH.toLocaleString()}
            </Text>
          </View>
          <RichTextInput
            value={description}
            onChangeText={setDescription}
            onBlur={() => setDescriptionTouched(true)}
            maxLength={MAX_DESCRIPTION_LENGTH}
            multiline
            textAlignVertical="top"
            placeholder="Describe what you need done, including any requirements or specifications."
            placeholderTextColor="#AAA69A"
            style={[styles.descriptionInput, descriptionError ? styles.inputError : null]}
            accessibilityLabel="Description"
          />
          {descriptionError ? <Text style={styles.errorText}>{descriptionError}</Text> : null}
        </View>

        <View style={styles.budgetCard}>
          <Text style={styles.fieldLabel}>
            Budget Range <Text style={styles.required}>*</Text>
          </Text>
          <Text style={styles.sectionHelper}>
            {isEditing
              ? 'The budget range cannot be changed after posting.'
              : 'Set your estimated payment range in PHP (₱). Hunters will bid within or near this range.'}
          </Text>
          <View style={styles.budgetInputsRow}>
            <View style={styles.budgetField}>
              <Text style={styles.inputLabel}>Minimum</Text>
              <View style={[styles.budgetInputWrap, budgetError ? styles.inputError : null]}>
                <Text style={styles.currencySymbol}>₱</Text>
                <TextInput
                  value={minimumBudget}
                  onChangeText={setMinimumBudget}
                  onBlur={() => setMinimumTouched(true)}
                  editable={!isEditing}
                  placeholder="0"
                  placeholderTextColor="#AAA69A"
                  keyboardType="decimal-pad"
                  style={[styles.budgetInput, isEditing && styles.readOnlyInput]}
                  accessibilityLabel="Minimum budget in pesos"
                />
              </View>
            </View>
            <View style={styles.budgetField}>
              <Text style={styles.inputLabel}>Maximum</Text>
              <View style={[styles.budgetInputWrap, budgetError ? styles.inputError : null]}>
                <Text style={styles.currencySymbol}>₱</Text>
                <TextInput
                  value={maximumBudget}
                  onChangeText={setMaximumBudget}
                  onBlur={() => setMaximumTouched(true)}
                  editable={!isEditing}
                  placeholder="0"
                  placeholderTextColor="#AAA69A"
                  keyboardType="decimal-pad"
                  style={[styles.budgetInput, isEditing && styles.readOnlyInput]}
                  accessibilityLabel="Maximum budget in pesos"
                />
              </View>
            </View>
          </View>
          {budgetError ? (
            <Text style={[styles.budgetFeedback, styles.errorText]}>{budgetError}</Text>
          ) : budgetValid ? (
            <View style={styles.budgetFeedbackRow}>
              <Svg width={24} height={24} viewBox="0 0 24 24">
                <Circle cx={12} cy={12} r={9} stroke="#FFE600" strokeWidth={2} fill="none" />
                <Path d="m8 12 2.5 2.5L16 9" stroke="#FFE600" strokeWidth={2} fill="none" />
              </Svg>
              <Text style={styles.budgetFeedback}>
                Valid range: {formatPeso(minimumBudget)} – {formatPeso(maximumBudget)} PHP
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.categoriesSection}>
          <View style={styles.labelRow}>
            <Text style={styles.fieldLabel}>
              Marketplace Categories <Text style={styles.required}>*</Text>
            </Text>
            <Text style={styles.categoryCount}>{selectedCategories.length} selected</Text>
          </View>
          <View style={styles.categorySearchWrap}>
            <Image
              source={require('@/assets/svgs/02_search_bar.svg')}
              style={styles.searchIcon}
              contentFit="contain"
              tintColor="#C8C6B9"
            />
            <TextInput
              value={categorySearch}
              onChangeText={setCategorySearch}
              onBlur={() => setCategoryTouched(true)}
              placeholder="Search categories"
              placeholderTextColor="#AAA69A"
              style={styles.categorySearchInput}
              accessibilityLabel="Search marketplace categories"
            />
            {isSearchingCategories ? <Text style={styles.searchingText}>...</Text> : null}
          </View>

          {categorySearch.trim() ? (
            <View style={styles.resultsPanel}>
              {categorySearchError ? (
                <Text style={styles.resultMessage}>{categorySearchError}</Text>
              ) : isSearchingCategories ? (
                <Text style={styles.resultMessage}>Searching categories...</Text>
              ) : categoryResults.length > 0 ? (
                categoryResults.map((category) => (
                  <Pressable
                    key={category.id}
                    style={styles.categoryResult}
                    onPress={() => addCategory(category)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${category.name}`}>
                    <Text style={styles.categoryResultName}>{category.name}</Text>
                    <Text style={styles.categoryResultAdd}>+</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.resultMessage}>No matching categories</Text>
              )}
            </View>
          ) : null}

          <View style={styles.selectedCategories}>
            {selectedCategories.map((category) => (
              <View key={category.id} style={styles.selectedChip}>
                <Text style={styles.selectedChipText}>{category.name}</Text>
                <Pressable
                  onPress={() => removeCategory(category.id)}
                  style={styles.removeChipButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${category.name}`}>
                  <Text style={styles.removeChipText}>×</Text>
                </Pressable>
              </View>
            ))}
            {selectedCategories.length === 0 ? (
              <Text style={styles.noCategoriesText}>No categories selected</Text>
            ) : null}
          </View>
          {categoryTouched && selectedCategories.length === 0 ? (
            <Text style={styles.errorText}>Select at least one category.</Text>
          ) : null}
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryAccent} />
          <View style={styles.summaryHeading}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              <Path
                d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
                stroke="#FFE600"
                strokeWidth={2}
                fill="none"
              />
              <Circle cx={12} cy={12} r={3} stroke="#FFE600" strokeWidth={2} fill="none" />
            </Svg>
            <Text style={styles.summaryTitle}>Bounty Summary</Text>
          </View>
          <View style={styles.summaryInner}>
            <Text style={styles.previewTitle} numberOfLines={2}>
              {title.trim() || 'Untitled Bounty'}
            </Text>
            <View style={styles.previewBudgetRow}>
              <Text style={styles.previewBudget}>
                {budgetValid
                  ? `${formatPeso(minimumBudget)} – ${formatPeso(maximumBudget)} PHP`
                  : 'Budget range not set'}
              </Text>
              <Text style={styles.estimatedTotal}>Estimated Total</Text>
            </View>
            <MarkdownText style={styles.previewDescription} numberOfLines={2}>
              {description.trim() || 'No description provided yet.'}
            </MarkdownText>
            <View style={styles.previewChips}>
              {selectedCategories.map((category) => (
                <Text key={category.id} style={styles.previewChip}>
                  {category.name}
                </Text>
              ))}
              {selectedCategories.length === 0 ? (
                <Text style={styles.previewEmpty}>No categories selected</Text>
              ) : null}
            </View>
          </View>
        </View>

        {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

        <View style={styles.actions}>
          <Pressable
            onPress={handleSubmit}
            disabled={!formValid || isSubmitting || isEditLoading || Boolean(editLoadError)}
            style={({ pressed }) => [
              styles.submitButton,
              (!formValid || Boolean(editLoadError)) && styles.submitButtonDisabled,
              pressed && formValid && styles.submitButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={isEditing ? 'Save Request Changes' : 'Post Bounty'}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              <Path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" fill="#201C00" />
            </Svg>
            <Text style={styles.submitButtonText}>
              {isSubmitting ? (isEditing ? 'Saving...' : 'Posting...') : isEditing ? 'Save Changes' : 'Post Bounty'}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleCancel}
            style={styles.cancelButton}
            accessibilityRole="button"
            accessibilityLabel="Cancel and return to Marketplace">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#141414',
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 24,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: '#E5E2E1',
    fontFamily: 'RobotoExtraBold',
    fontSize: 22,
    marginLeft: 14,
  },
  headerSpacer: {
    width: 32,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 2,
    gap: 28,
  },
  fieldSection: {
    gap: 8,
  },
  labelRow: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldLabel: {
    color: '#E5E2E1',
    fontFamily: 'RobotoExtraBold',
    fontSize: 16,
  },
  required: {
    color: '#FFE600',
  },
  counter: {
    color: '#C8C6B9',
    fontFamily: 'RobotoExtraBold',
    fontSize: 12,
  },
  titleInput: {
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1F1F1F',
    color: '#E5E2E1',
    fontFamily: 'Roboto',
    fontSize: 16,
  },
  descriptionInput: {
    minHeight: 184,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1F1F1F',
    color: '#E5E2E1',
    fontFamily: 'Roboto',
    fontSize: 16,
    lineHeight: 25,
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#FF7676',
  },
  readOnlyInput: {
    opacity: 0.58,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  helperIcon: {
    color: '#FFE600',
    fontSize: 16,
  },
  helperText: {
    color: '#C8C6B9',
    fontFamily: 'Roboto',
    fontSize: 13,
  },
  errorText: {
    color: '#FF7676',
    fontFamily: 'Roboto',
    fontSize: 12,
    lineHeight: 17,
  },
  budgetCard: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#1C1B1B',
    gap: 10,
  },
  sectionHelper: {
    color: '#C8C6B9',
    fontFamily: 'Roboto',
    fontSize: 13,
    lineHeight: 19,
  },
  budgetInputsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 2,
  },
  budgetField: {
    flex: 1,
    gap: 6,
  },
  inputLabel: {
    color: '#C8C6B9',
    fontFamily: 'RobotoExtraBold',
    fontSize: 12,
  },
  budgetInputWrap: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: '#2A2A2A',
  },
  currencySymbol: {
    color: '#FFE600',
    fontFamily: 'LeagueSpartanExtraBold',
    fontSize: 20,
    marginRight: 8,
  },
  budgetInput: {
    flex: 1,
    padding: 0,
    color: '#E5E2E1',
    fontFamily: 'LeagueSpartanBold',
    fontSize: 21,
  },
  budgetFeedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  budgetFeedback: {
    color: '#C8C6B9',
    fontFamily: 'RobotoExtraBold',
    fontSize: 12,
    flexShrink: 1,
  },
  categoriesSection: {
    gap: 9,
  },
  categoryCount: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#353534',
    color: '#E5E2E1',
    fontFamily: 'RobotoExtraBold',
    fontSize: 11,
  },
  categorySearchWrap: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: '#1C1B1B',
  },
  searchIcon: {
    width: 16,
    height: 16,
    marginRight: 9,
  },
  categorySearchInput: {
    flex: 1,
    minHeight: 42,
    paddingVertical: 0,
    color: '#E5E2E1',
    fontFamily: 'Roboto',
    fontSize: 14,
  },
  searchingText: {
    color: '#C8C6B9',
    fontSize: 16,
  },
  resultsPanel: {
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: '#1C1B1B',
  },
  categoryResult: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#353534',
  },
  categoryResultName: {
    color: '#E5E2E1',
    fontFamily: 'Roboto',
    fontSize: 14,
  },
  categoryResultAdd: {
    color: '#FFE600',
    fontFamily: 'RobotoExtraBold',
    fontSize: 20,
  },
  resultMessage: {
    paddingVertical: 12,
    color: '#C8C6B9',
    fontFamily: 'Roboto',
    fontSize: 13,
  },
  selectedCategories: {
    minHeight: 48,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
    padding: 10,
    borderRadius: 9,
    backgroundColor: '#1C1B1B',
  },
  selectedChip: {
    maxWidth: '100%',
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 230, 0, 0.20)',
  },
  selectedChipText: {
    flexShrink: 1,
    color: '#E5E2E1',
    fontFamily: 'RobotoExtraBold',
    fontSize: 13,
  },
  removeChipButton: {
    width: 18,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeChipText: {
    color: '#C8C6B9',
    fontSize: 18,
    lineHeight: 20,
  },
  noCategoriesText: {
    color: '#C8C6B9',
    fontFamily: 'Roboto',
    fontSize: 13,
  },
  summaryCard: {
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#1C1B1B',
    paddingBottom: 16,
  },
  summaryAccent: {
    height: 2,
    backgroundColor: '#FFE600',
    marginBottom: 16,
  },
  summaryHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 18,
    marginBottom: 12,
  },
  summaryTitle: {
    color: '#E5E2E1',
    fontFamily: 'LeagueSpartanBold',
    fontSize: 22,
  },
  summaryInner: {
    marginHorizontal: 18,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#201F1F',
    gap: 10,
  },
  previewTitle: {
    color: '#E5E2E1',
    fontFamily: 'LeagueSpartanBold',
    fontSize: 21,
    lineHeight: 25,
  },
  previewBudgetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
  },
  previewBudget: {
    color: '#FFE600',
    fontFamily: 'RobotoExtraBold',
    fontSize: 14,
  },
  estimatedTotal: {
    color: '#C8C6B9',
    fontFamily: 'RobotoExtraBold',
    fontSize: 11,
  },
  previewDescription: {
    color: '#C8C6B9',
    fontFamily: 'Roboto',
    fontSize: 13,
    lineHeight: 19,
  },
  previewChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 2,
  },
  previewChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: '#353534',
    color: '#E5E2E1',
    fontFamily: 'RobotoExtraBold',
    fontSize: 11,
    overflow: 'hidden',
  },
  previewEmpty: {
    color: '#AAA69A',
    fontFamily: 'Roboto',
    fontSize: 12,
    fontStyle: 'italic',
  },
  submitError: {
    color: '#FF7676',
    fontFamily: 'Roboto',
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    gap: 3,
  },
  submitButton: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 14,
    backgroundColor: '#FFE600',
  },
  submitButtonDisabled: {
    backgroundColor: '#6A6A6D',
  },
  submitButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  submitButtonText: {
    color: '#201C00',
    fontFamily: 'RobotoExtraBold',
    fontSize: 16,
  },
  cancelButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  cancelText: {
    color: '#C8C6B9',
    fontFamily: 'RobotoExtraBold',
    fontSize: 15,
  },
});
