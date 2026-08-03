import { forwardRef } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, value, onChangeText, placeholder, secureTextEntry, keyboardType = "default", autoCapitalize = "none" },
  ref,
) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        secureTextEntry={secureTextEntry}
        style={styles.input}
        value={value}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#fffaf3",
    borderRadius: 16,
    borderColor: "#ead9c6",
    borderWidth: 1,
    color: "#2b1d14",
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
