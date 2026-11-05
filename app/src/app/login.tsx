import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Banner, Button, Card, Field, H1, Screen } from "../components/ui";
import { friendly } from "../lib/api";
import { useSession } from "../lib/session";

export default function Login() {
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Welcome back</H1>
      {error ? <Banner>{error}</Banner> : null}
      <Card>
        <Field label="Parent email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
      </Card>
      <View style={{ gap: 10 }}>
        <Button big title="Sign in" onPress={submit} disabled={!email || !password} loading={busy} />
        <Button title="Back" kind="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
