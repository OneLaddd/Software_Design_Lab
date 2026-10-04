import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PostForm } from '@/components/post-form';

export default function CreatePostScreen() {
  const params = useLocalSearchParams<{ communityId?: string }>();
  const communityId = Array.isArray(params.communityId) ? params.communityId[0] : params.communityId;
  return <View style={{ flex: 1, backgroundColor: '#131313' }}><PostForm communityId={communityId} /></View>;
}
