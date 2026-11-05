import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Banner, Button, Card, Field, H1, P, Screen } from "../components/ui";
import { api, friendly } from "../lib/api";
import { useSession } from "../lib/session";

export default function Forgot() {
  const { signInWithToken, map } = useSession();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/auth/forgot-password", null, { email: email.trim() });
      setStep("code");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ familyToken: string }>("POST", "/auth/reset-password", null, { email: email.trim(), code, newPassword: password });
      await signInWithToken(r.familyToken);
      router.replace("/");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Reset your password</H1>
      {error ? <Banner>{error}</Banner> : null}
      {map?.emailSending === false ? (
        <Banner tone="info">
          This is a test version of Honest Learn that doesn't send emails yet, so reset codes can't reach your inbox. The site owner can find the code in the server logs, or you can create a new account.
        </Banner>
      ) : null}
      {step === "email" ? (
        <>
          <P muted>Enter the parent email you signed up with. If it has an account, we'll email a 6-digit code.</P>
          <Card>
            <Field label="Parent email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          </Card>
          <Button big title="Email me a code" onPress={sendCode} disabled={!email.includes("@")} loading={busy} />
        </>
      ) : (
        <>
          <Banner tone="info">If {email} has an account, a code is on its way. It works for 15 minutes.</Banner>
          <Card>
            <Field label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={6} />
            <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry hint="At least 8 characters." autoComplete="new-password" />
          </Card>
          <Button big title="Set new password" onPress={reset} disabled={code.length !== 6 || password.length < 8} loading={busy} />
          <Button title="Send another code" kind="ghost" onPress={sendCode} />
        </>
      )}
      <View>
        <Button title="Back to sign in" kind="ghost" onPress={() => router.replace("/login")} />
      </View>
    </Screen>
  );
}
