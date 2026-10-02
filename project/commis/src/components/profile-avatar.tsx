import React, { useEffect, useState } from 'react';
import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

interface ProfileAvatarProps {
  avatarUrl?: string | null;
  size: number;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

export function ProfileAvatar({
  avatarUrl,
  size,
  style,
  accessibilityLabel = 'Profile avatar',
}: ProfileAvatarProps) {
  const [failedUrl, setFailedUrl] = useState(false);

  useEffect(() => {
    setFailedUrl(false);
  }, [avatarUrl]);

  const hasAvatar = Boolean(avatarUrl?.trim()) && !failedUrl;

  return (
    <Image
      source={hasAvatar ? { uri: avatarUrl!.trim() } : require('@/assets/images/commis-san.jpg')}
      contentFit="cover"
      onError={() => setFailedUrl(true)}
      accessibilityLabel={accessibilityLabel}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}