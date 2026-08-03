import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

interface LoadingStateProps {
  title: string;
  description: string;
}

export function LoadingState({ title, description }: LoadingStateProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color="#9a5634" />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 12,
    justifyContent: "center",
    flex: 1,
    padding: 24,
  },
  title: {
    color: "#2b1d14",
    fontSize: 18,
    fontWeight: "700",
  },
  description: {
    color: "#6b5c4f",
    fontSize: 14,
    textAlign: "center",
  },
});
