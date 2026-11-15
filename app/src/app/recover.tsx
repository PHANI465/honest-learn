import { Redirect, router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Banner, Button, Card, Field, H1, P, Screen } from "../components/ui";
import { api, friendly } from "../lib/api";
import { isDeviceMode } from "../lib/server";
import { useSession } from "../lib/session";

/**
 * Standalone mode (the app on this phone only): a forgotten password is reset with the recovery phrase shown at sign-up,
 * because there is no email. Signing in this way signs out every other session. The PIN can then be reset with the new password.
 */
export default function Recover() {
  const { signInWithToken } = useSession();
  const [email, setEmail] = useState("");
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isDeviceMode()) return <Redirect href="/forgot" />;

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ familyToken: string }>("POST", "/auth/recover", null, { email: email.trim(), phrase, newPassword: password });
      await signInWithToken(r.familyToken);
      router.replace("/");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  const letters = phrase.replace(/[^0-9a-z]/gi, "").length;
  return (
    <Screen>
      <H1>Forgot your password?</H1>
      <P muted>Use the recovery phrase you wrote down when you created the account on this phone. It has 24 letters and numbers.</P>
      {error ? <Banner>{error}</Banner> : null}
      <Card>
        <Field label="Email (your sign-in name)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field
          label="Recovery phrase"
          value={phrase}
          onChangeText={setPhrase}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          hint={letters ? `${letters} of 24 letters and numbers` : "Spaces, dashes and upper or lower case don't matter."}
        />
        <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry hint="At least 8 characters." autoComplete="new-password" />
      </Card>
      <Button big title="Set new password" onPress={reset} disabled={!email.includes("@") || letters !== 24 || password.length < 8} loading={busy} />
      <P muted size={13}>Forgot the PIN too? After signing in, use "Forgot your PIN?" on the PIN screen: your new password can set a new PIN.</P>
      <Banner tone="info">Lost the recovery phrase as well? Then the account on this phone cannot be opened again. Nobody, including us, can reset it: there is no copy anywhere else.</Banner>
      <View>
        <Button title="Back to sign in" kind="ghost" onPress={() => router.replace("/login")} />
      </View>
    </Screen>
  );
}
