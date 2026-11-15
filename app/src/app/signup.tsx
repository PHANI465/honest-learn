import { router } from "expo-router";
import { useState } from "react";
import { Text, View, type TextStyle } from "react-native";
import { CountryPicker } from "../components/CountryPicker";
import { RecoveryPhrase } from "../components/RecoveryPhrase";
import { Banner, Button, Card, Field, H1, H2, P, Screen, Toggle } from "../components/ui";
import { friendly } from "../lib/api";
import { isDeviceMode } from "../lib/server";
import { useSession } from "../lib/session";
import { colors } from "../lib/theme";

const linkStyle: TextStyle = { color: colors.brand, fontSize: 15, fontWeight: "600", textDecorationLine: "underline", paddingVertical: 6 };

export default function Signup() {
  const { signup } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [adult, setAdult] = useState(false);
  const [consent, setConsent] = useState(false);
  const [country, setCountry] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const onPhone = isDeviceMode();

  const pinOk = /^\d{4,6}$/.test(pin) && pin === pin2;
  const canSubmit = email.includes("@") && password.length >= 8 && pinOk && adult && consent;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await signup({ email: email.trim(), password, pin, country });
      // standalone mode: the recovery phrase first (shown only now), then the first child
      if (r.recoveryPhrase) setPhrase(r.recoveryPhrase);
      else router.replace("/parent/add-child");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  if (phrase) {
    return (
      <Screen>
        <H1>One more thing</H1>
        <RecoveryPhrase phrase={phrase} onDone={() => router.replace("/parent/add-child")} doneTitle="Continue: add a child" />
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>Create your family account</H1>
      <P muted>You'll add your children as profiles next. Kids never need an email or password.</P>
      {onPhone ? <Banner tone="info">This account is only on this phone. Nothing you type here is sent anywhere.</Banner> : null}
      {error ? <Banner>{error}</Banner> : null}
      <Card>
        <Field
          label="Your email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          hint={onPhone ? "Used only as your sign-in name on this phone. No email is ever sent." : undefined}
        />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry hint="At least 8 characters." autoComplete="new-password" />
      </Card>
      <Card>
        <H2>Parent PIN</H2>
        <P muted size={14}>A 4–6 digit PIN that only grown-ups know. It's needed to change settings, unlock sensitive topics, read chats and open outside links.</P>
        <Field label="PIN" value={pin} onChangeText={(t) => setPin(t.replace(/\D/g, ""))} keyboardType="number-pad" secureTextEntry maxLength={6} />
        <Field label="Repeat PIN" value={pin2} onChangeText={(t) => setPin2(t.replace(/\D/g, ""))} keyboardType="number-pad" secureTextEntry maxLength={6} hint={pin2 && pin !== pin2 ? "PINs don't match yet." : undefined} />
      </Card>
      <Card>
        <H2>Your country (optional)</H2>
        <P muted size={14}>Only used so Hoot can point to the right children's helpline if your child ever says they feel unsafe. You can change it later.</P>
        <CountryPicker value={country} onChange={setCountry} />
      </Card>
      <Card>
        <Toggle label="I am a parent or legal guardian, aged 18 or over" value={adult} onChange={setAdult} />
        <Toggle
          label="I agree to the privacy notice and terms"
          value={consent}
          onChange={setConsent}
          description={
            onPhone
              ? "Kept only on this phone: your email, your children's nicknames and birth years, learning progress, and Hoot chats (so you can review them). Nothing is sent to us. No ads, no tracking. You can download or delete everything at any time from the parent area."
              : "We store only: your email, your children's nicknames and birth years, learning progress, and Hoot chats (so you can review them). No ads, no tracking, no selling data. You can export or delete everything at any time from the parent area."
          }
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
          <Text accessibilityRole="link" onPress={() => router.push("/privacy")} style={linkStyle}>
            Read the privacy notice
          </Text>
          <Text accessibilityRole="link" onPress={() => router.push("/terms")} style={linkStyle}>
            Read the terms
          </Text>
          <Text accessibilityRole="link" onPress={() => router.push("/licences")} style={linkStyle}>
            Open source licences
          </Text>
        </View>
      </Card>
      <View style={{ gap: 10 }}>
        <Button big title="Create account" onPress={submit} disabled={!canSubmit} loading={busy} />
        <Button title="Back" kind="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
