import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Banner, Button, Card, Field, H1, H2, P, Screen, Toggle } from "../components/ui";
import { friendly } from "../lib/api";
import { useSession } from "../lib/session";

export default function Signup() {
  const { signup } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [adult, setAdult] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pinOk = /^\d{4,6}$/.test(pin) && pin === pin2;
  const canSubmit = email.includes("@") && password.length >= 8 && pinOk && adult && consent;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signup({ email: email.trim(), password, pin });
      router.replace("/parent/add-child");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Create your family account</H1>
      <P muted>You'll add your children as profiles next. Kids never need an email or password.</P>
      {error ? <Banner>{error}</Banner> : null}
      <Card>
        <Field label="Your email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry hint="At least 8 characters." autoComplete="new-password" />
      </Card>
      <Card>
        <H2>Parent PIN</H2>
        <P muted size={14}>A 4–6 digit PIN that only grown-ups know. It's needed to change settings, unlock sensitive topics, read chats and open outside links.</P>
        <Field label="PIN" value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, ""))} keyboardType="number-pad" secureTextEntry maxLength={6} />
        <Field label="Repeat PIN" value={pin2} onChangeText={(t) => setPin2(t.replace(/\D/g, ""))} keyboardType="number-pad" secureTextEntry maxLength={6} hint={pin2 && pin !== pin2 ? "PINs don't match yet." : undefined} />
      </Card>
      <Card>
        <Toggle label="I am a parent or legal guardian, aged 18 or over" value={adult} onChange={setAdult} />
        <Toggle
          label="I agree to the privacy notice"
          value={consent}
          onChange={setConsent}
          description="We store only: your email, your children's nicknames and birth years, learning progress, and Hoot chats (so you can review them). No ads, no tracking, no selling data. You can export or delete everything at any time from the parent area."
        />
      </Card>
      <View style={{ gap: 10 }}>
        <Button big title="Create account" onPress={submit} disabled={!canSubmit} loading={busy} />
        <Button title="Back" kind="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
