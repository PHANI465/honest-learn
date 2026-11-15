// Hoot's AI: a family can connect its own model (a free local one, or a hosted service with its own key). PIN-protected like the
// rest of the parent area; saving also needs the account password. The key is sent once, when saved, and never comes back: the
// server only ever returns its last four characters. See server/src/ai-settings.ts and docs/FREE_AGENTS.md.
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import { Banner, Button, Card, Field, H1, H2, P, Pill, Screen } from "../../components/ui";
import { friendly } from "../../lib/api";
import { useSession } from "../../lib/session";
import { colors } from "../../lib/theme";

type Provider = "ollama" | "lmstudio" | "openrouter" | "groq" | "custom";
type Settings =
  | { configured: false; allowLocal: boolean }
  | {
      configured: true;
      provider: Provider;
      baseUrl: string;
      model: string;
      safetyModel: string | null;
      hasKey: boolean;
      keyLast4: string | null;
      keyUnreadable: boolean;
      tested: boolean;
      updatedAt: string;
      allowLocal: boolean;
    };
interface TestResult {
  model: string;
  ok: boolean;
  error: string | null;
  ms: number;
}

const PRESETS: Record<Provider, { name: string; baseUrl: string; local: boolean; keyNeeded: boolean; example: string }> = {
  ollama: { name: "Ollama", baseUrl: "http://localhost:11434/v1", local: true, keyNeeded: false, example: "llama3.2" },
  lmstudio: { name: "LM Studio", baseUrl: "http://localhost:1234/v1", local: true, keyNeeded: false, example: "the model name LM Studio shows" },
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", local: false, keyNeeded: true, example: "openai/gpt-4o-mini" },
  groq: { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", local: false, keyNeeded: true, example: "llama-3.1-8b-instant" },
  custom: { name: "Other (OpenAI-compatible)", baseUrl: "", local: false, keyNeeded: false, example: "the provider's model name" },
};

/** What the test categories mean. The server never passes on the model server's own words. */
const TEST_ERRORS: Record<string, string> = {
  blocked_address: "That address is not allowed from this server.",
  unreachable: "Could not connect. Check the address, and that the program is running.",
  redirect: "The server tried to send us somewhere else. Use the address it redirects to.",
  timeout: "It took too long to answer.",
  key_refused: "The key was refused. Check it, or make a new one.",
  model_not_found: "The server does not know that model name.",
  rate_limited: "The service says too many requests. Try again later.",
  server_error: "The service had a problem. Try again later.",
  bad_response: "It answered, but not like an OpenAI-compatible server.",
  key_unreadable: "The stored key can no longer be read (the server's secret changed). Type the key again and save.",
};

function confirmed(title: string, message: string, action: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  return new Promise((r) => Alert.alert(title, message, [{ text: "Cancel", style: "cancel", onPress: () => r(false) }, { text: action, style: "destructive", onPress: () => r(true) }]));
}

export default function HootAi() {
  const { parentApi } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [provider, setProvider] = useState<Provider>("ollama");
  const [baseUrl, setBaseUrl] = useState(PRESETS.ollama.baseUrl);
  const [model, setModel] = useState("");
  const [safetyModel, setSafetyModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [removeKey, setRemoveKey] = useState(false);
  const [password, setPassword] = useState("");
  const [readWarning, setReadWarning] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A save error is shown next to the Save button, which is far down the page on a phone. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [results, setResults] = useState<TestResult[] | null>(null);

  const fill = (s: Settings) => {
    setSettings(s);
    if (s.configured) {
      setProvider(s.provider);
      setBaseUrl(s.baseUrl);
      setModel(s.model);
      setSafetyModel(s.safetyModel ?? "");
    } else if (!s.allowLocal) {
      setProvider("openrouter");
      setBaseUrl(PRESETS.openrouter.baseUrl);
    }
  };

  useEffect(() => {
    let live = true;
    parentApi<{ settings: Settings }>("GET", "/ai")
      .then((r) => live && fill(r.settings))
      .catch((e) => live && setError(friendly(e)));
    return () => {
      live = false;
    };
  }, [parentApi]);

  if (!settings) {
    return (
      <Screen>
        {error ? <Banner>{error}</Banner> : <P>Loading…</P>}
      </Screen>
    );
  }

  const preset = PRESETS[provider];
  const choose = (p: Provider) => {
    setProvider(p);
    if (PRESETS[p].baseUrl) setBaseUrl(PRESETS[p].baseUrl);
    setResults(null);
  };
  const reset = () => {
    setPassword("");
    setApiKey("");
    setRemoveKey(false);
  };

  async function save() {
    setBusy("save");
    setError(null);
    setSaveError(null);
    setNotice(null);
    setResults(null);
    try {
      const body: Record<string, unknown> = { password, provider, baseUrl: baseUrl.trim(), model: model.trim() };
      if (safetyModel.trim()) body.safetyModel = safetyModel.trim();
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      else if (removeKey) body.apiKey = null;
      const r = await parentApi<{ settings: Settings; hootTurnedOff: number; keyCleared: boolean }>("PUT", "/ai", body);
      fill(r.settings);
      const parts = ["Saved."];
      if (r.keyCleared) parts.push("The address changed, so the old key was removed: a key is only ever sent to the server it was typed for. Type it again if this server needs it.");
      if (r.hootTurnedOff) parts.push(`Hoot was turned off for ${r.hootTurnedOff === 1 ? "1 child" : `${r.hootTurnedOff} children`}. Test the model, read a few of its replies, then turn Hoot on again in each child's settings.`);
      else parts.push("Hoot stays off until you turn it on in a child's settings.");
      setNotice(parts.join(" "));
      reset();
    } catch (e) {
      setSaveError(friendly(e));
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setError(null);
    setResults(null);
    try {
      const r = await parentApi<{ ok: boolean; results: TestResult[]; error?: string }>("POST", "/ai/test");
      if (r.error) setError(TEST_ERRORS[r.error] ?? "The test did not work.");
      setResults(r.results);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!(await confirmed("Stop using your own model?", "Hoot goes back to this server's default helper. The stored key is deleted.", "Remove"))) return;
    setBusy("remove");
    setError(null);
    try {
      const r = await parentApi<{ settings: Settings }>("DELETE", "/ai");
      setSettings(r.settings);
      setModel("");
      setSafetyModel("");
      setResults(null);
      reset();
      setNotice("Removed. Hoot uses this server's default helper again.");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(null);
    }
  }

  const chip = (p: Provider) => {
    const selected = provider === p;
    const disabled = PRESETS[p].local && !settings.allowLocal;
    return (
      <Pressable key={p} onPress={() => !disabled && choose(p)} disabled={disabled} accessibilityRole="radio" accessibilityLabel={PRESETS[p].name} accessibilityState={{ selected, checked: selected, disabled }}
        style={{ paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: "center", borderRadius: 999, borderWidth: 2, opacity: disabled ? 0.45 : 1, borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brandSoft : colors.card }}>
        <Text style={{ fontWeight: "600", color: colors.ink }}>{PRESETS[p].name}</Text>
      </Pressable>
    );
  };

  const keyNote = settings.configured && settings.hasKey ? `A key ending in ${settings.keyLast4 ?? "(hidden: it is short)"} is saved. Leave this empty to keep it.` : preset.keyNeeded ? "This service needs a key. Make one on its website." : "Only if your server asks for one.";
  const canSave = !!password && !!model.trim() && !!baseUrl.trim() && readWarning;

  return (
    <Screen>
      <Button title="‹ Parent area" kind="ghost" onPress={() => router.replace("/parent")} label="Back to the parent area" />
      <H1>Hoot's AI</H1>
      <P muted size={14}>
        Hoot can use a model you choose instead of this server's default helper: a free model on your own computer, or a hosted service with your own key.
      </P>

      <Banner>
        Small free models are much weaker at staying safe for children and at not giving answers away. Honest Learn keeps all of its own protections on for every
        model (checks before any AI call, fixed checks on every reply, a second AI check, daily limits), but no filter is perfect. Models you connect here have not been
        through the project's safety test set. Read Hoot's chats in the parent area, especially in the first weeks.
      </Banner>

      {error ? <Banner>{error}</Banner> : null}
      {notice ? <Banner tone="good">{notice}</Banner> : null}

      {settings.configured ? (
        <Card>
          <Text style={{ fontWeight: "800", fontSize: 17, color: colors.ink }}>In use now</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Pill text={PRESETS[settings.provider].name} />
            <Pill text={settings.model} />
            {settings.safetyModel && settings.safetyModel !== settings.model ? <Pill text={`check: ${settings.safetyModel}`} /> : null}
            <Pill text={settings.hasKey ? `key …${settings.keyLast4 ?? "saved"}` : "no key"} />
            <Pill text="not safety-tested" color={colors.warn} />
          </View>
          <P muted size={13}>{settings.baseUrl}</P>
          {settings.keyUnreadable ? <Banner>{TEST_ERRORS.key_unreadable}</Banner> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button title="Test the connection" kind="secondary" onPress={test} loading={busy === "test"} label="Send one harmless test message to the model" />
            <Button title="Stop using it" kind="ghost" color={colors.danger} onPress={remove} loading={busy === "remove"} />
          </View>
          {results?.map((r) => (
            <P key={r.model} size={14}>
              {r.ok ? "✅" : "❌"} {r.model}: {r.ok ? `answered in ${(r.ms / 1000).toFixed(1)} s` : (TEST_ERRORS[r.error ?? ""] ?? "did not answer")}
            </P>
          ))}
          {results ? <P muted size={13}>The test sends one fixed message ("Reply with the single word: ready"). It shows the model can be reached, not that it is safe.</P> : null}
        </Card>
      ) : (
        <P muted size={14}>No model of your own is set. Hoot uses this server's default helper.</P>
      )}

      <H2>{settings.configured ? "Change the model" : "Connect a model"}</H2>
      <Card>
        <Text style={{ fontWeight: "600", color: colors.ink }} accessibilityRole="header">Where the model runs</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup">
          {(Object.keys(PRESETS) as Provider[]).map(chip)}
        </View>
        {settings.allowLocal ? (
          <P muted size={13}>"localhost" means the computer the Honest Learn server runs on, not this phone or tablet.</P>
        ) : (
          <P muted size={13}>This server does not allow models on a local network, so only hosted services with an https:// address work.</P>
        )}
        <Field label="Address" hint="An OpenAI-compatible address, usually ending in /v1." value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={300} />
        <Field label="Model name" hint={`Exactly as the provider writes it, for example ${preset.example}.`} value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} maxLength={120} />
        <Field label="Safety-check model (optional)" hint="Judges every reply before your child sees it. Use the strongest model you can. Empty means the same model." value={safetyModel} onChangeText={setSafetyModel} autoCapitalize="none" autoCorrect={false} maxLength={120} />
        <Field label="Key" hint={keyNote} value={apiKey} onChangeText={(t) => { setApiKey(t); if (t) setRemoveKey(false); }} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={500} />
        {settings.configured && settings.hasKey && !apiKey ? (
          <Pressable onPress={() => setRemoveKey((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: removeKey }} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.brand, backgroundColor: removeKey ? colors.brand : "transparent" }} />
            <Text style={{ color: colors.ink, flex: 1 }}>Delete the saved key</Text>
          </Pressable>
        ) : null}
        <P muted size={13}>
          The key is stored encrypted on the server and is never shown again, not even here, and never included in the data download. It is only sent to the address above.
          Your child's messages to Hoot, the lesson text and the quiz question will go to this provider, under its own privacy rules.
        </P>
        <Pressable onPress={() => setReadWarning((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: readWarning }} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
          <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.brand, backgroundColor: readWarning ? colors.brand : "transparent" }} />
          <Text style={{ color: colors.ink, flex: 1 }}>I have read the warning above. I will read Hoot's chats with this model.</Text>
        </Pressable>
        <Field label="Account password" hint="Needed to save, because a child may know the PIN." value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" />
        {saveError ? <Banner>{saveError}</Banner> : null}
        <Button big title="Save" onPress={save} loading={busy === "save"} disabled={!canSave} />
        <P muted size={13}>Saving turns Hoot off for every child, so you can test the new model first.</P>
      </Card>
    </Screen>
  );
}
