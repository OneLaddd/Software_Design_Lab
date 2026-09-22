import { Image, StyleSheet, Text, View } from 'react-native';

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <Image
        source={require('@/assets/images/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>Explore</Text>
      <Text style={styles.copy}>
        This route is temporarily kept as a placeholder while the main Commis start flow is being
        built.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f1ee',
    padding: 24,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 10,
  },
  copy: {
    fontSize: 16,
    color: '#333333',
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 24,
  },
});
