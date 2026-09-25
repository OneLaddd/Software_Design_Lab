import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function Toast({
  message,
  visible,
  onHide,
}: {
  message: string;
  visible: boolean;
  onHide: () => void;
}) {
  useEffect(() => {
    if (!visible) return;

    const timeout = setTimeout(onHide, 2500);
    return () => clearTimeout(timeout);
  }, [onHide, visible]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={styles.container}>
      <View style={styles.toast}>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  toast: {
    backgroundColor: '#252527',
    borderColor: '#4B4B4E',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  message: {
    color: '#FFFFFF',
    fontFamily: 'Roboto',
    fontSize: 14,
  },
});
