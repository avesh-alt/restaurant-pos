import { Platform, SafeAreaView, StatusBar, StyleSheet, View } from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";

import { SessionProvider, useSession } from "./context/session-context";
import { DashboardScreen } from "./screens/DashboardScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { Screen } from "./components/Screen";
import { LoadingState } from "./components/LoadingState";

function AppShell() {
  const { sessionState } = useSession();

  if (sessionState.status === "booting") {
    return (
      <Screen title="Waiter orders">
        <LoadingState title="Loading session" description="Restoring your secure session." />
      </Screen>
    );
  }

  if (!sessionState.session) {
    return <LoginScreen />;
  }

  return <DashboardScreen />;
}

export function App() {
  return (
    <SessionProvider>
      <SafeAreaView style={styles.safeArea}>
        <ExpoStatusBar style="dark" backgroundColor="#fffaf3" />
        {/* On Android, SafeAreaView doesn't account for the translucent status bar,
            so we add an explicit spacer equal to the status bar height. */}
        {Platform.OS === "android" && (
          <View style={{ height: StatusBar.currentHeight ?? 0 }} />
        )}
        <View style={styles.container}>
          <AppShell />
        </View>
      </SafeAreaView>
    </SessionProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fffaf3",
  },
  container: {
    flex: 1,
    backgroundColor: "#f5ede2",
  },
});
