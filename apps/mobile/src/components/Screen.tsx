import type { PropsWithChildren, ReactNode } from "react";
import type { ScrollViewProps } from "react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";

interface ScreenProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  refreshControl?: ScrollViewProps["refreshControl"];
  footer?: ReactNode;
}

export function Screen({ title, subtitle, children, refreshControl, footer }: ScreenProps) {
  return (
    <View style={styles.shell}>
      <ScrollView
        contentContainerStyle={[styles.content, footer ? styles.contentWithFooter : null]}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        <View style={styles.hero}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 12,
    gap: 12,
  },
  contentWithFooter: {
    paddingBottom: 12,
  },
  hero: {
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  title: {
    color: "#2b1d14",
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 23,
  },
  subtitle: {
    color: "#6b5c4f",
    fontSize: 12,
    lineHeight: 16,
  },
  footer: {
    borderTopColor: "#ead9c6",
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: "#f5ede2",
  },
});
