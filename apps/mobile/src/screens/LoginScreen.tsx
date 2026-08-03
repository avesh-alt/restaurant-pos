import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { useSession } from "../context/session-context";
import { Screen } from "../components/Screen";
import { Card } from "../components/ui/Card";
import { ActionButton } from "../components/ui/ActionButton";
import { TextField } from "../components/ui/TextField";
import { LoadingState } from "../components/LoadingState";

export function LoginScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (): Promise<void> => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing credentials", "Enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      await signIn({ email: email.trim(), password });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in.";
      Alert.alert("Sign in failed", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      title="Waiter sign in"
      subtitle="Sign in to search items, choose tables, and place orders."
    >
      <Card title="Secure session" subtitle="The app stores your tokens securely on device.">
        <View style={styles.form}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="waiter@example.com"
            keyboardType="email-address"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry
          />
          <ActionButton label={loading ? "Signing in..." : "Sign in"} onPress={submit} disabled={loading} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
});
