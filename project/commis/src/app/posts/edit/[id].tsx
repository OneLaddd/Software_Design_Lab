import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PostForm } from '@/components/post-form';

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <View style={{ flex: 1, backgroundColor: '#131313' }}><PostForm postId={Array.isArray(id) ? id[0] : id} /></View>;
}
