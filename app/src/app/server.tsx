import { router } from "expo-router";
import { useState } from "react";
import { Platform } from "react-native";
import { Banner, Button, Card, Field, H1, P, Screen } from "../components/ui";
import { chosenServerAddress, connectServer, hasDefaultServer, resetServerAddress } from "../lib/server";
import { useSession } from "../lib/session";

/**
 * Which server this phone app talks to. On first run a store-built app has none, so the family types the address of a server they
 * run (for example their own computer on the home Wi-Fi) or trust. Everything the app sends goes to that address.
 */
export default function ServerAddress() {
  const { reloadContent, familyToken } = useSession();
  const [text, setText] = useState(chosenServerAddress() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // On the website the server is the website itself: nothing to choose.
  if (Platform.OS === "web") {
    return (
      <Screen>
        <H1>Server</H1>
        <P>The website talks to its own server, so there is nothing to set up here.</P>
        <Button title="Back" onPress={() => router.replace("/")} />
      </Screen>
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    const r = await connectServer(text);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setSaved(r.base);
    await reloadContent();
  }

  async function useDefault() {
    await resetServerAddress();
    setSaved(null);
    setText("");
    await reloadContent();
    router.replace("/");
  }

  return (
    <Screen>
      <H1>Connect to your server</H1>
      <P>Type the address of the Honest Learn server your family runs or trusts. It keeps your account and your children's progress.</P>
      <Card>
        <Field
          label="Server address"
          value={text}
          onChangeText={(t) => {
            setText(t);
            setSaved(null);
          }}
          placeholder="192.168.1.20:8787 or learn.example.org"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint="On your home Wi-Fi, use your computer's address, like 192.168.1.20:8787. Anywhere else, use an https:// address."
        />
        {error ? <Banner>{error}</Banner> : null}
        {saved ? <Banner tone="good">{`Connected to ${saved}`}</Banner> : null}
        <Button big title="Check and save" onPress={save} loading={busy} disabled={!text.trim()} />
        {saved ? <Button title={familyToken ? "Continue" : "Continue to sign in"} onPress={() => router.replace("/")} /> : null}
      </Card>
      <Banner tone="info">Only use a server you run yourself or trust. Everything you type in the app, including sign-in details and your child's progress, is sent to it.</Banner>
      {hasDefaultServer() ? <Button title="Use the default server" kind="ghost" onPress={useDefault} /> : null}
      <Button title="‹ Other ways to use the app" kind="ghost" onPress={() => router.replace("/start")} />
    </Screen>
  );
}
