import { stagger } from "../../lib/motion";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Platform, Share, Text, View } from "react-native";
import { CountryPicker } from "../../components/CountryPicker";
import { Banner, Button, Card, Emoji, Field, H1, H2, P, Pill, ProgressBar, Screen } from "../../components/ui";
import { friendly, type Child } from "../../lib/api";
import { openSafely, safeUrl } from "../../lib/links";
import { useSession } from "../../lib/session";
import { avatars, bandTheme, colors, subjectEmoji } from "../../lib/theme";

interface Overview {
  children: (Child & {
    stats: { lessons: number; score: number; total: number; lastActive: string | null };
    thisWeek: { lessons: number; minutes: number };
    puzzles: { best_score: number; total: number } | null;
    subjects?: { id: string; name: string; total: number; completed: number }[];
    flaggedMessages: number;
    recent: { lesson_id: string; title: string; best_score: number; total: number }[];
  })[];
}

const DONATE_URL = safeUrl(process.env.EXPO_PUBLIC_DONATE_URL);

function confirm(title: string, message: string, action = "Delete"): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: action, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

export default function ParentHome() {
  const { parentApi, parentEmail, emailVerified, verifyEmail, resendVerification, country, map, lockParent, logout, refreshFamily, signOutEverywhere, changePassword } = useSession();
  // Account forms: which one is open, and what was typed. Passwords are cleared as soon as a form closes.
  const [form, setForm] = useState<"password" | "delete" | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closeForm = () => {
    setForm(null);
    setCurrentPassword("");
    setNewPassword("");
    setFormError(null);
  };
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      parentApi<Overview>("GET", "/overview").then(setData).catch((e) => setError(friendly(e)));
      refreshFamily().catch(() => {});
    }, [parentApi, refreshFamily]),
  );

  async function exportData() {
    try {
      const json = await parentApi<unknown>("GET", "/export");
      const text = JSON.stringify(json, null, 2);
      if (Platform.OS === "web") {
        const blob = new Blob([text], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "honest-learn-family-data.json";
        a.click();
      } else {
        // Phones: hand the full file to the system share sheet (save to Files, email it, etc.).
        await Share.share({ title: "Honest Learn family data", message: text });
      }
    } catch (e) {
      setError(friendly(e));
    }
  }

  async function signOutOthers() {
    const ok = await confirm(
      "Sign out all other devices?",
      "Every other phone, tablet and browser using this account will need the password again. This one stays signed in.",
      "Sign out others",
    );
    if (!ok) return;
    try {
      await signOutEverywhere();
      setDone("Done. Every other device is signed out. This one stays signed in.");
    } catch (e) {
      setError(friendly(e));
    }
  }

  async function deleteAccount() {
    const ok = await confirm("Delete your account?", "This permanently deletes your account, every child profile, all progress and all chats. This cannot be undone.");
    if (!ok) return;
    setBusy(true);
    try {
      await parentApi("DELETE", "/account", { password: currentPassword });
      await logout();
      router.replace("/welcome");
    } catch (e) {
      setFormError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    setBusy(true);
    setFormError(null);
    try {
      await changePassword(currentPassword, newPassword);
      closeForm();
      setDone("Password changed. Every other device is signed out. This one stays signed in.");
    } catch (e) {
      setFormError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <H1>Parent area</H1>
        <Pill text="🔓 Unlocked" color={colors.good} bg={colors.goodSoft} />
      </View>
      <P muted size={14}>Signed in as {parentEmail}. This area locks itself after 10 minutes.</P>
      {error ? <Banner>{error}</Banner> : null}

      {!emailVerified && map?.emailSending !== false ? (
        <Card style={{ borderColor: colors.warn, backgroundColor: colors.warnSoft }}>
          <Text style={{ fontWeight: "800", color: colors.ink, fontSize: 16 }}>✉️ Please verify your email</Text>
          <P size={14}>We sent a 6-digit code to {parentEmail}. Verifying lets you reset your password if you forget it.</P>
          <Field label="Verification code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={6} />
          {note ? <P size={14} muted>{note}</P> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button title="Verify" disabled={code.length !== 6} onPress={async () => {
                try { await verifyEmail(code); setNote(null); } catch (e) { setNote(friendly(e)); }
              }} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Send a new code" kind="secondary" onPress={async () => {
                try { await resendVerification(); setNote("New code sent. Check your inbox (and spam folder)."); } catch (e) { setNote(friendly(e)); }
              }} />
            </View>
          </View>
        </Card>
      ) : null}

      <H2>Your children</H2>
      {data?.children.length === 0 ? <Banner tone="info">Add your first child to get started.</Banner> : null}
      {data?.children.map((c, index) => {
        const band = map?.bands.find((b) => b.id === c.band);
        return (
          <Card key={c.id} enterDelay={stagger(index)} onPress={() => router.push(`/parent/child/${c.id}`)} label={`Settings for ${c.nickname}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Emoji size={40}>{avatars[c.avatar]}</Emoji>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: colors.ink }}>{c.nickname}, {c.age}</Text>
                <Text style={{ color: bandTheme[c.band].accent, fontWeight: "700" }}>{band?.name} (ages {band?.ages.join("–")})</Text>
              </View>
              <Text style={{ fontSize: 22, color: colors.muted }} aria-hidden accessibilityElementsHidden importantForAccessibility="no">›</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Pill text={`This week: ${c.thisWeek.lessons} lesson${c.thisWeek.lessons === 1 ? "" : "s"} · ${c.thisWeek.minutes} min`} color={colors.brand} bg={colors.brandSoft} />
              <Pill text={`${c.stats.lessons} lesson${c.stats.lessons === 1 ? "" : "s"} done`} />
              {c.puzzles ? <Pill text={`🧩 Puzzles best ${c.puzzles.best_score}/${c.puzzles.total}`} /> : null}
              {c.stats.total ? <Pill text={`${Math.round((100 * c.stats.score) / c.stats.total)}% quiz score`} /> : null}
              <Pill text={c.aiEnabled ? "Hoot on" : "Hoot off"} />
              <Pill text={`${c.dailyMinutes} min/day`} />
              {c.flaggedMessages ? <Pill text={`⚠️ ${c.flaggedMessages} flagged chat${c.flaggedMessages > 1 ? "s" : ""}`} color={colors.warn} bg={colors.warnSoft} /> : null}
            </View>
            {c.subjects?.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }} accessibilityLabel={`Progress by subject: ${c.subjects.map((x) => `${x.name} ${x.completed} of ${x.total}`).join(", ")}`}>
                {c.subjects.map((x) => (
                  <View key={x.id} style={{ width: 92, gap: 3 }}>
                    <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
                      {subjectEmoji[x.id] ?? "📘"} {x.completed}/{x.total}
                    </Text>
                    <ProgressBar value={x.total ? x.completed / x.total : 0} color={bandTheme[c.band].accent} height={6} label={`${x.name}: ${x.completed} of ${x.total}`} />
                  </View>
                ))}
              </View>
            ) : null}
            {c.recent.length ? <P muted size={13}>Recently: {c.recent.map((r) => r.title).join(" · ")}</P> : null}
          </Card>
        );
      })}
      <Button title="+ Add a child" kind="secondary" onPress={() => router.push("/parent/add-child")} />

      <H2>Lessons you add</H2>
      <Card>
        <P muted size={14}>Write a lesson your child needs, with an optional quiz. Only your family sees it.</P>
        <Button title="Add or edit your own lessons" kind="secondary" onPress={() => router.push("/parent/lessons")} />
      </Card>

      <H2>Country</H2>
      <Card>
        <P muted size={14}>Optional. Used only so Hoot can name the right children's helpline in a safety reply.</P>
        <CountryPicker
          value={country}
          onChange={async (code) => {
            try {
              await parentApi("PATCH", "/settings", { country: code });
              await refreshFamily();
            } catch (e) {
              setError(friendly(e));
            }
          }}
        />
      </Card>

      <H2>Account</H2>
      {done ? <Banner tone="info">{done}</Banner> : null}
      <Card style={{ gap: 10 }}>
        <Button title="Download all our data" kind="secondary" onPress={exportData} />
        {DONATE_URL ? <Button title="💚 Donate to keep Honest Learn free" kind="secondary" onPress={() => openSafely(DONATE_URL)} /> : null}
        <Button title="Lock parent area" kind="ghost" onPress={() => { lockParent(); router.replace("/profiles"); }} />
        <Button title="Sign out of this device" kind="ghost" onPress={async () => { await logout(); router.replace("/welcome"); }} />
        <Button title="Sign out all other devices" kind="ghost" onPress={signOutOthers} label="Sign out all other devices, for example a lost phone" />
        <Button title="Change password" kind="ghost" onPress={() => (form === "password" ? closeForm() : (closeForm(), setForm("password")))} />
        {form === "password" ? (
          <View style={{ gap: 10 }}>
            <Field label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" />
            <Field label="New password" hint="At least 8 characters." value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
            {formError ? <Banner>{formError}</Banner> : null}
            <Button title="Save new password" onPress={savePassword} loading={busy} disabled={!currentPassword || newPassword.length < 8} />
          </View>
        ) : null}
        <Button title="Delete account and all data" kind="danger" onPress={() => (form === "delete" ? closeForm() : (closeForm(), setForm("delete")))} />
        {form === "delete" ? (
          <View style={{ gap: 10 }}>
            <P size={14}>To delete everything, enter your account password. The PIN alone is not enough.</P>
            <Field label="Account password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" />
            {formError ? <Banner>{formError}</Banner> : null}
            <Button title="Delete everything for good" kind="danger" onPress={deleteAccount} loading={busy} disabled={!currentPassword} />
            <Button title="Keep my account" kind="ghost" onPress={closeForm} />
          </View>
        ) : null}
      </Card>
      {data?.children.length ? <Button big title="Back to learning →" onPress={() => { lockParent(); router.replace("/profiles"); }} /> : null}
    </Screen>
  );
}
