import { Pressable, StyleSheet, Text } from "react-native";

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
}

export function ActionButton({ label, onPress, variant = "primary", disabled }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.label,
          variant === "secondary" && styles.labelSecondary,
          variant === "ghost" && styles.labelGhost,
          disabled && styles.labelDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: 16,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primary: {
    backgroundColor: "#2b1d14",
  },
  secondary: {
    backgroundColor: "#f2e6d8",
  },
  ghost: {
    backgroundColor: "transparent",
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  label: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  labelSecondary: {
    color: "#2b1d14",
  },
  labelGhost: {
    color: "#2b1d14",
  },
  labelDisabled: {
    color: "#9ca3af",
  },
});
