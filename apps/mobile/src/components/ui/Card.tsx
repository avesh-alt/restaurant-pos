import { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";

interface CardProps extends PropsWithChildren {
  title?: string;
  subtitle?: string;
}

export function Card({ title, subtitle, children }: CardProps) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fffaf3",
    borderRadius: 22,
    borderColor: "#ead9c6",
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  title: {
    color: "#2b1d14",
    fontSize: 16,
    fontWeight: "800",
  },
  subtitle: {
    color: "#6b5c4f",
    fontSize: 13,
    lineHeight: 18,
  },
});
