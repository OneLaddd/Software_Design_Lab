import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

export type MarketplaceStatus = 'open' | 'awarded' | 'closed';
export type MarketplaceSort = 'Newest' | 'Oldest' | 'Budget: Low to High' | 'Budget: High to Low' | 'Most Bids' | 'Least Bids';

export interface MarketplaceCategory {
  id: string;
  name: string;
  slug: string;
}

export interface MarketplaceFilterValues {
  categoryIds: string[];
  categories: MarketplaceCategory[];
  minimumBudget: string;
  maximumBudget: string;
  status: MarketplaceStatus;
  sort: MarketplaceSort;
}

interface MarketplaceFilterSheetProps {
  visible: boolean;
  initialValues: MarketplaceFilterValues;
  onClose: () => void;
  onApply: (filters: MarketplaceFilterValues) => void;
}

const SORT_OPTIONS: MarketplaceSort[] = [
  'Newest',
  'Oldest',
  'Budget: Low to High',
  'Budget: High to Low',
  'Most Bids',
  'Least Bids',
];

export function MarketplaceFilterSheet({ visible, initialValues, onClose, onApply }: MarketplaceFilterSheetProps) {
  const insets = useSafeAreaInsets();
  const [filters, setFilters] = useState(initialValues);
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryResults, setCategoryResults] = useState<MarketplaceCategory[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    if (visible) {
      setFilters(initialValues);
      setCategorySearch('');
      setSearchError('');
    }
  }, [initialValues, visible]);

  useEffect(() => {
    const searchTerm = categorySearch.trim();
    if (!searchTerm) {
      setCategoryResults([]);
      setIsSearching(false);
      setSearchError('');
      return;
    }

    let active = true;
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      setSearchError('');
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug')
        .ilike('name', `%${searchTerm}%`)
        .order('name', { ascending: true })
        .limit(8);

      if (!active) return;
      setIsSearching(false);
      if (error) {
        console.warn('Failed to search marketplace categories:', error);
        setCategoryResults([]);
        setSearchError('Could not load categories. Try again.');
        return;
      }

      const selectedIds = new Set(filters.categories.map((category) => category.id));
      setCategoryResults((data ?? []).filter((category) => !selectedIds.has(category.id)));
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [categorySearch, filters.categories]);

  const updateFilters = (patch: Partial<MarketplaceFilterValues>) => {
    setFilters((current) => ({ ...current, ...patch }));
  };

  const addCategory = (category: MarketplaceCategory) => {
    const categories = filters.categories.some((item) => item.id === category.id)
      ? filters.categories
      : [...filters.categories, category];
    updateFilters({ categories, categoryIds: categories.map((item) => item.id) });
    setCategorySearch('');
    setCategoryResults([]);
  };

  const removeCategory = (categoryId: string) => {
    const categories = filters.categories.filter((category) => category.id !== categoryId);
    updateFilters({ categories, categoryIds: categories.map((item) => item.id) });
  };

  const reset = () => {
    const resetFilters: MarketplaceFilterValues = {
      categoryIds: [],
      categories: [],
      minimumBudget: '',
      maximumBudget: '',
      status: 'open',
      sort: 'Newest',
    };
    setFilters(resetFilters);
    setCategorySearch('');
    setCategoryResults([]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close filters" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.handleArea}><View style={styles.handle} /></View>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Filter Marketplace</Text>
              <Text style={styles.subtitle}>Refine requests by category, budget &amp; status</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close filter modal">
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>CATEGORY</Text>
                <Text style={styles.sectionHint}>Multi-select</Text>
              </View>
              <View style={styles.categorySearch}>
                <Image source={require('@/assets/svgs/02_search_bar.svg')} style={styles.searchIcon} tintColor="#A6A6AB" contentFit="contain" />
                <TextInput
                  value={categorySearch}
                  onChangeText={setCategorySearch}
                  placeholder="Search categories (e.g. Design, Web)..."
                  placeholderTextColor="#777777"
                  style={styles.categoryInput}
                  accessibilityLabel="Search categories"
                />
                {categorySearch ? (
                  <Pressable onPress={() => setCategorySearch('')} accessibilityRole="button" accessibilityLabel="Clear category search">
                    <Text style={styles.clearText}>×</Text>
                  </Pressable>
                ) : null}
              </View>
              {categorySearch ? (
                <View style={styles.results}>
                  {searchError ? <Text style={styles.resultMessage}>{searchError}</Text> : isSearching ? (
                    <Text style={styles.resultMessage}>Searching...</Text>
                  ) : categoryResults.length ? categoryResults.map((category) => (
                    <Pressable key={category.id} onPress={() => addCategory(category)} style={styles.resultRow}>
                      <Text style={styles.resultName}>{category.name}</Text>
                      <Text style={styles.addText}>+</Text>
                    </Pressable>
                  )) : <Text style={styles.resultMessage}>No matching categories</Text>}
                </View>
              ) : null}
              <View style={styles.chips}>
                {filters.categories.map((category) => (
                  <View key={category.id} style={styles.chip}>
                    <Text style={styles.chipText}>{category.name}</Text>
                    <Pressable onPress={() => removeCategory(category.id)} accessibilityRole="button" accessibilityLabel={`Remove ${category.name}`}>
                      <Text style={styles.removeText}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>BUDGET RANGE</Text>
                <Text style={styles.sectionHint}>Currency: PHP (₱)</Text>
              </View>
              <View style={styles.budgetRow}>
                <View style={styles.budgetInputWrap}>
                  <Text style={styles.currency}>PHP</Text>
                  <TextInput value={filters.minimumBudget} onChangeText={(value) => updateFilters({ minimumBudget: value })} placeholder="Min (no limit)" placeholderTextColor="#777777" keyboardType="numeric" style={styles.budgetInput} accessibilityLabel="Minimum request budget" />
                </View>
                <View style={styles.budgetInputWrap}>
                  <Text style={styles.currency}>PHP</Text>
                  <TextInput value={filters.maximumBudget} onChangeText={(value) => updateFilters({ maximumBudget: value })} placeholder="Max (no limit)" placeholderTextColor="#777777" keyboardType="numeric" style={styles.budgetInput} accessibilityLabel="Maximum request budget" />
                </View>
              </View>
              <Text style={styles.helpText}>Leave blank for no upper or lower budget ceiling.</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>STATUS</Text>
              <View style={styles.statusRow}>
                {(['open', 'awarded', 'closed'] as const).map((status) => (
                  <Pressable key={status} onPress={() => updateFilters({ status })} style={[styles.statusPill, filters.status === status && styles.statusPillActive]}>
                    <View style={[styles.statusDot, filters.status === status && styles.statusDotActive]} />
                    <Text style={[styles.statusText, filters.status === status && styles.statusTextActive]}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SORT BY</Text>
              {SORT_OPTIONS.map((option) => (
                <Pressable key={option} onPress={() => updateFilters({ sort: option })} style={styles.sortRow} accessibilityRole="radio" accessibilityState={{ selected: filters.sort === option }}>
                  <Text style={styles.sortText}>{option === 'Newest' ? 'Newest (Latest results)' : option}</Text>
                  <View style={[styles.radio, filters.sort === option && styles.radioSelected]}>
                    {filters.sort === option ? <View style={styles.radioDot} /> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable onPress={reset} style={styles.resetButton} accessibilityRole="button">
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            <Pressable onPress={() => onApply(filters)} style={styles.applyButton} accessibilityRole="button">
              <Text style={styles.applyText}>Apply Filters</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.75)' },
  scrim: { flex: 1 },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: '#181818' },
  handleArea: { height: 27, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#626262' },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  title: { color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 20 },
  subtitle: { marginTop: 2, color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12 },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#242424' },
  closeText: { color: '#A6A6AB', fontSize: 22, lineHeight: 24 },
  form: { paddingHorizontal: 20, paddingVertical: 17, gap: 19 },
  section: { paddingTop: 13, gap: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#333333' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { color: '#D4D4D4', fontFamily: 'RobotoExtraBold', fontSize: 11, letterSpacing: 0.5 },
  sectionHint: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 11 },
  categorySearch: { minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: '#414141', borderRadius: 11, backgroundColor: '#222222' },
  searchIcon: { width: 16, height: 16, marginRight: 9 },
  categoryInput: { flex: 1, minHeight: 40, paddingVertical: 0, color: '#FFFFFF', fontFamily: 'Roboto', fontSize: 12 },
  clearText: { color: '#A6A6AB', fontSize: 21 },
  results: { paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#222222' },
  resultRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#3A3A3A' },
  resultName: { color: '#EEEEEE', fontFamily: 'Roboto', fontSize: 12 },
  addText: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 19 },
  resultMessage: { paddingVertical: 11, color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,230,0,0.4)', borderRadius: 18, backgroundColor: 'rgba(255,230,0,0.13)' },
  chipText: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 11 },
  removeText: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  budgetRow: { flexDirection: 'row', gap: 9 },
  budgetInputWrap: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: '#414141', borderRadius: 11, backgroundColor: '#222222' },
  currency: { marginRight: 7, color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 10 },
  budgetInput: { flex: 1, minWidth: 0, padding: 0, color: '#FFFFFF', fontFamily: 'Roboto', fontSize: 12 },
  helpText: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 11 },
  statusRow: { flexDirection: 'row', gap: 6 },
  statusPill: { flex: 1, minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 5, borderWidth: 1, borderColor: '#414141', borderRadius: 10, backgroundColor: '#222222' },
  statusPillActive: { borderColor: '#FFE600', backgroundColor: '#FFE600' },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#777777' },
  statusDotActive: { backgroundColor: '#111111' },
  statusText: { color: '#D0D0D0', fontFamily: 'RobotoExtraBold', fontSize: 11 },
  statusTextActive: { color: '#111111' },
  sortRow: { minHeight: 37, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sortText: { color: '#EEEEEE', fontFamily: 'Roboto', fontSize: 12 },
  radio: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#777777', borderRadius: 9 },
  radioSelected: { borderColor: '#FFE600' },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FFE600' },
  footer: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: '#303030', backgroundColor: '#141414' },
  resetButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#444444', borderRadius: 11, backgroundColor: '#222222' },
  resetText: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  applyButton: { flex: 2, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#FFE600' },
  applyText: { color: '#111111', fontFamily: 'RobotoExtraBold', fontSize: 12 },
});