import { Redirect, router } from "expo-router";
import { useState } from "react";
import { Banner, Button, Card, Field, H1, Loading, P, Screen } from "../components/ui";
import { api, friendly } from "../lib/api";
import { useSession } from "../lib/session";

/** Forgot the parent PIN: the account password sets a new one. */
export default function ResetPin() {
  const { ready, familyToken } = useSession();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!ready) return <Loading />;
  if (!familyToken) return <Redirect href="/welcome" />;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/auth/reset-pin", familyToken, { password, newPin: pin });
      setDone(true);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Set a new parent PIN</H1>
      {done ? (
        <>
          <Banner tone="good">Your new PIN is set ✓</Banner>
          <Button big title="Go to the parent area" onPress={() => router.replace("/parent")} />
        </>
      ) : (
        <>
          <P muted>Enter your account password to choose a new PIN.</P>
          {error ? <Banner>{error}</Banner> : null}
          <Card>
            <Field label="Account password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
            <Field label="New PIN" value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, ""))} keyboardType="number-pad" secureTextEntry maxLength={6} hint="4–6 digits." />
            <Field label="Repeat new PIN" value={pin2} onChangeText={(t) => setPin2(t.replace(/\D/g, ""))} keyboardType="number-pad" secureTextEntry maxLength={6} />
          </Card>
          <Button big title="Save new PIN" onPress={save} disabled={!password || !/^\d{4,6}$/.test(pin) || pin !== pin2} loading={busy} />
          <Button title="Cancel" kind="ghost" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
