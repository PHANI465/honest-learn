// Move a family between places: from a data download (website), or directly between this app and another Honest Learn server
// (a phone that keeps its data on the device can send its family to a server, or bring one back). Parent area only.
//
// What happens: the family's data is read from one place, the parent picks which children to bring, and the other place adds them
// (server/src/routes/parent-import.ts). Hints opened and questions answered are not carried over, so answers are earned again.
// The email, password and PIN typed for the OTHER server go only to the address typed, are kept in memory for the length of the
// move, and are never saved.
import { router } from "expo-router";
import { useState } from "react";
import { Platform, View } from "react-native";
import { Banner, Button, Card, Field, H1, H2, P, Screen, Toggle } from "../../components/ui";
import { ApiError, apiAt, friendly } from "../../lib/api";
import { findServer } from "../../lib/server-address";
import { useSession } from "../../lib/session";

interface DownloadChild {
  id: string;
  nickname: string;
  birthYear: number;
}
interface Download {
  children: DownloadChild[];
  [key: string]: unknown;
}
interface Report {
  imported: { sourceId: string; id: string; nickname: string; progress: number; spelling: number; games: number; chats: number }[];
  skipped: { sourceId: string | null; nickname: string | null; reason: "already_here" | "invalid" | "not_chosen" | "no_room" }[];
  lessons: { added: number; reused: number; skipped: number };
  dropped: { progress: number; chats: number; spelling: number; games: number };
  notes: string[];
}
/** Where the family goes: this app (null), or another server we signed in to. */
type Destination = { base: string; parentToken: string; label: string } | null;

const WHY_SKIPPED: Record<Report["skipped"][number]["reason"], string> = {
  already_here: "is already here",
  invalid: "could not be read",
  not_chosen: "was not chosen",
  no_room: "did not fit (a family can have 8 children)",
};

const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

/** Looks like a Honest Learn download? Only enough to show the list of children: the server checks everything again. */
function asDownload(x: unknown): Download | null {
  if (!x || typeof x !== "object" || !Array.isArray((x as Download).children)) return null;
  const kids = ((x as Download).children as unknown[]).filter(
    (k): k is DownloadChild => !!k && typeof k === "object" && typeof (k as DownloadChild).id === "string" && typeof (k as DownloadChild).nickname === "string",
  );
  return { ...(x as Download), children: kids };
}

/** Web only: asks for a file and returns its text. */
function pickFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export default function Transfer() {
  const { parentApi } = useSession();
  const [stage, setStage] = useState<"start" | "connect" | "choose" | "done">("start");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [data, setData] = useState<Download | null>(null);
  const [dest, setDest] = useState<Destination>(null);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [chats, setChats] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forgetSecrets = () => {
    setPassword("");
    setPin("");
  };
  const open = (d: Download, to: Destination) => {
    setData(d);
    setDest(to);
    setChosen(Object.fromEntries(d.children.map((k) => [k.id, true])));
    setChats(false);
    setError(null);
    setStage("choose");
  };

  async function fromFile() {
    setError(null);
    try {
      const text = await pickFile();
      if (text === null) return;
      const d = asDownload(JSON.parse(text));
      if (!d || !d.children.length) {
        setError(friendly(new ApiError(400, "not_a_download", {})));
        return;
      }
      open(d, null);
    } catch {
      setError("That file could not be read. Use the file from \"Download all our data\".");
    }
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const found = await findServer(address, (url, init) => fetch(url, init));
      if (!found.ok) {
        setError(found.error);
        return;
      }
      const login = await apiAt<{ familyToken: string }>(found.base, "POST", "/auth/login", null, { email: email.trim(), password });
      const unlocked = await apiAt<{ parentToken: string }>(found.base, "POST", "/auth/parent-unlock", login.familyToken, { pin });
      forgetSecrets();
      if (direction === "in") {
        const d = asDownload(await apiAt<unknown>(found.base, "GET", "/parent/export", unlocked.parentToken));
        if (!d || !d.children.length) {
          setError("That account has no children to bring over.");
          return;
        }
        open(d, null);
      } else {
        const d = asDownload(await parentApi<unknown>("GET", "/export"));
        if (!d || !d.children.length) {
          setError("There are no children here to send yet.");
          return;
        }
        open(d, { base: found.base, parentToken: unlocked.parentToken, label: found.base });
      }
    } catch (e) {
      forgetSecrets();
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!data) return;
    const only = data.children.filter((k) => chosen[k.id]).map((k) => k.id);
    if (!only.length) {
      setError("Choose at least one child.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = { data, only, includeChats: chats };
      const r = dest ? await apiAt<Report>(dest.base, "POST", "/parent/import", dest.parentToken, body) : await parentApi<Report>("POST", "/import", body);
      setReport(r);
      setData(null);
      setDest(null);
      setStage("done");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  const web = Platform.OS === "web";
  return (
    <Screen>
      <Button title="‹ Back" kind="ghost" onPress={() => router.back()} />
      <H1>Move your family</H1>
      {error ? <Banner>{error}</Banner> : null}

      {stage === "start" ? (
        <View style={{ gap: 14 }}>
          <P muted>
            Bring your children, their progress and your own lessons from one place to another: from a download, or between this app and a server. Nothing is deleted from where it came from.
          </P>
          {web ? (
            <Card style={{ gap: 10 }}>
              <H2>From a download</H2>
              <P muted size={14}>Choose the file you saved with "Download all our data".</P>
              <Button title="Choose a file" onPress={fromFile} />
            </Card>
          ) : (
            <>
              <Card style={{ gap: 10 }}>
                <H2>Bring a family here</H2>
                <P muted size={14}>From a server you have an account on. You will need its address, your email and password there, and your parent PIN there.</P>
                <Button title="Bring a family here" onPress={() => { setDirection("in"); setStage("connect"); }} />
              </Card>
              <Card style={{ gap: 10 }}>
                <H2>Send this family to a server</H2>
                <P muted size={14}>To an account you have already made on that server. Make the account first, then come back.</P>
                <Button title="Send this family to a server" kind="secondary" onPress={() => { setDirection("out"); setStage("connect"); }} />
              </Card>
              <P muted size={13}>To restore from a downloaded file, open Honest Learn in a web browser.</P>
            </>
          )}
        </View>
      ) : null}

      {stage === "connect" ? (
        <Card style={{ gap: 12 }}>
          <H2>{direction === "in" ? "Where is the family now?" : "Where should it go?"}</H2>
          <P muted size={14}>
            Your email, password and PIN are sent only to this address, to sign in once. They are not saved.
          </P>
          <Field label="Server address" value={address} onChangeText={setAddress} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="learn.example.org" />
          <Field label="Email on that server" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" />
          <Field label="Password on that server" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" textContentType="password" />
          <Field label="Parent PIN on that server" value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" maxLength={8} />
          <Button title="Continue" onPress={connect} loading={busy} disabled={!address.trim() || !email.trim() || !password || !pin} />
          <Button title="Cancel" kind="ghost" onPress={() => { forgetSecrets(); setStage("start"); setError(null); }} />
        </Card>
      ) : null}

      {stage === "choose" && data ? (
        <View style={{ gap: 14 }}>
          <H2>{dest ? `Send to ${dest.label}` : "Bring into this account"}</H2>
          <Card style={{ gap: 6 }}>
            {data.children.map((k) => (
              <Toggle key={k.id} label={k.nickname} description={typeof k.birthYear === "number" ? `Born ${k.birthYear}` : undefined} value={!!chosen[k.id]} onChange={(v) => setChosen((c) => ({ ...c, [k.id]: v }))} />
            ))}
          </Card>
          <Card style={{ gap: 6 }}>
            <Toggle label="Include Hoot chats" description="Large chat histories can make the file too big to send. Hoot is switched off for the children you bring; you can turn it on in their settings." value={chats} onChange={setChats} />
          </Card>
          <Banner tone="info">
            Progress, spelling, finished games, settings and your own lessons come across. Hints opened and questions answered do not: answers are earned again here.
          </Banner>
          <Button title="Move them" onPress={run} loading={busy} />
          <Button title="Cancel" kind="ghost" onPress={() => { setData(null); setDest(null); setStage("start"); setError(null); }} />
        </View>
      ) : null}

      {stage === "done" && report ? (
        <View style={{ gap: 14 }}>
          <Banner tone={report.imported.length ? "good" : "info"}>
            {report.imported.length ? `Brought over ${report.imported.length} ${report.imported.length === 1 ? "child" : "children"}.` : "Nothing new was added."}
          </Banner>
          {report.imported.map((k) => (
            <Card key={k.id} style={{ gap: 4 }}>
              <H2>{k.nickname}</H2>
              <P muted size={14}>
                {plural(k.progress, "lesson or puzzle set")} · {plural(k.spelling, "spelling word")} · {plural(k.games, "finished game")}{k.chats ? ` · ${plural(k.chats, "Hoot message")}` : ""}
              </P>
            </Card>
          ))}
          {report.skipped.length ? (
            <Card style={{ gap: 4 }}>
              <H2>Left out</H2>
              {report.skipped.map((s, i) => (
                <P key={i} muted size={14}>{s.nickname ?? "A profile in the file"} {WHY_SKIPPED[s.reason]}.</P>
              ))}
            </Card>
          ) : null}
          {report.lessons.added || report.lessons.reused || report.lessons.skipped ? (
            <P muted size={14}>
              Your own lessons: {report.lessons.added} added, {report.lessons.reused} already there{report.lessons.skipped ? `, ${report.lessons.skipped} could not be used` : ""}.
            </P>
          ) : null}
          {Object.values(report.dropped).some((n) => n > 0) ? (
            <P muted size={14}>
              Some rows were damaged or about lessons this version does not have, so they were left out ({report.dropped.progress} progress, {report.dropped.spelling} spelling, {report.dropped.games} games, {report.dropped.chats} messages).
            </P>
          ) : null}
          <Card style={{ gap: 6 }}>
            <H2>Things to know</H2>
            {report.notes.map((n, i) => (
              <P key={i} muted size={14}>• {n}</P>
            ))}
          </Card>
          <Button title="Done" onPress={() => router.replace("/parent")} />
        </View>
      ) : null}
    </Screen>
  );
}
