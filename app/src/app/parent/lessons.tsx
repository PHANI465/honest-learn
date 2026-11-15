import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import { Banner, Button, Card, Field, H1, H2, Pill, P, Screen } from "../../components/ui";
import { friendly, type BandId } from "../../lib/api";
import { useSession } from "../../lib/session";
import { colors } from "../../lib/theme";

type SectionType = "text" | "tryit" | "fact" | "parent";
interface SectionForm {
  type: SectionType;
  body: string;
}
interface QuestionForm {
  q: string;
  options: string[];
  /** Index of the correct option in `options`. */
  answer: number;
  hints: string[];
  explain: string;
}
interface LessonForm {
  id?: string;
  title: string;
  band: BandId;
  subject: string;
  minutes: number;
  sections: SectionForm[];
  quiz: QuestionForm[];
}
interface SubjectInfo {
  id: string;
  name: string;
  bands: string[] | null;
}
interface ListResponse {
  lessons: LessonForm[];
  limit: number;
  subjects: SubjectInfo[];
}

const SECTION_NAMES: Record<SectionType, string> = { text: "Teaching text", tryit: "Try it", fact: "Did you know?", parent: "Note for grown-ups" };
const blankQuestion = (): QuestionForm => ({ q: "", options: ["", "", ""], answer: 0, hints: ["", "", ""], explain: "" });
const blankLesson = (band: BandId): LessonForm => ({ title: "", band, subject: "language", minutes: 10, sections: [{ type: "text", body: "" }], quiz: [] });

export default function FamilyLessons() {
  const { parentApi, map } = useSession();
  const [data, setData] = useState<ListResponse | null>(null);
  const [form, setForm] = useState<LessonForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setData(await parentApi<ListResponse>("GET", "/lessons"));
    } catch (e) {
      setError(friendly(e));
    }
  }, [parentApi]);

  useEffect(() => {
    let live = true;
    parentApi<ListResponse>("GET", "/lessons")
      .then((r) => live && setData(r))
      .catch((e) => live && setError(friendly(e)));
    return () => {
      live = false;
    };
  }, [parentApi]);

  if (!map) return <Screen><P>Loading…</P></Screen>;

  const patch = (p: Partial<LessonForm>) => setForm((f) => (f ? { ...f, ...p } : f));
  const setSection = (i: number, p: Partial<SectionForm>) => form && patch({ sections: form.sections.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const setQuestion = (i: number, p: Partial<QuestionForm>) => form && patch({ quiz: form.quiz.map((q, j) => (j === i ? { ...q, ...p } : q)) });
  const subjectsFor = (band: BandId) => (data?.subjects ?? []).filter((s) => !s.bands || s.bands.includes(band));

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    // Empty extra options and hints on an unfinished question are an error the server explains; send what was typed, minus empty extras.
    const body = {
      title: form.title,
      band: form.band,
      subject: form.subject,
      minutes: form.minutes,
      sections: form.sections.filter((s) => s.body.trim()),
      quiz: form.quiz.map((q) => {
        const keep = q.options.map((o, i) => ({ o, i })).filter((x) => x.o.trim() || x.i === q.answer);
        return { q: q.q, options: keep.map((x) => x.o), answer: keep.findIndex((x) => x.i === q.answer), hints: q.hints, explain: q.explain };
      }),
    };
    try {
      const r = form.id
        ? await parentApi<{ warnings: string[] }>("PUT", `/lessons/${form.id}`, body)
        : await parentApi<{ warnings: string[] }>("POST", "/lessons", body);
      setWarnings(r.warnings);
      setNotice("Saved. Your child can find it in the lesson list for their age group, marked \"Added by your family\".");
      setForm(null);
      await load();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(l: LessonForm) {
    const msg = `Delete "${l.title}"? Your children's progress on it is deleted too. This cannot be undone.`;
    const ok = Platform.OS === "web" ? globalThis.confirm?.(msg) : await new Promise<boolean>((r) => Alert.alert("Delete lesson?", msg, [{ text: "Cancel", onPress: () => r(false) }, { text: "Delete", style: "destructive", onPress: () => r(true) }]));
    if (!ok) return;
    try {
      await parentApi("DELETE", `/lessons/${l.id}`);
      setNotice("Lesson deleted.");
      setWarnings([]);
      await load();
    } catch (e) {
      setError(friendly(e));
    }
  }

  const chip = (label: string, selected: boolean, onPress: () => void, key?: string) => (
    <Pressable key={key ?? label} onPress={onPress} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected, checked: selected }}
      style={{ paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: "center", borderRadius: 999, borderWidth: 2, borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brandSoft : colors.card }}>
      <Text style={{ fontWeight: "600", color: colors.ink }}>{label}</Text>
    </Pressable>
  );

  // ------------------------------------------------------------------ the form
  if (form) {
    return (
      <Screen>
        <Button title="‹ Cancel" kind="ghost" onPress={() => { setForm(null); setError(null); }} label="Cancel and go back to the list" />
        <H1>{form.id ? "Edit lesson" : "New lesson"}</H1>
        <P muted size={14}>This lesson is private to your family. It is not checked by anyone, so you are in charge of what it says. Write it for your child's age.</P>
        {error ? <Banner>{error}</Banner> : null}

        <Card>
          <Field label="Title" value={form.title} onChangeText={(t) => patch({ title: t })} maxLength={80} />
          <Text style={{ fontWeight: "600", color: colors.ink }} accessibilityRole="header">Age group</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup">
            {map.bands.map((b) => chip(`${b.name} (${b.ages.join("–")})`, form.band === b.id, () => {
              const ok = subjectsFor(b.id).some((s) => s.id === form.subject);
              patch({ band: b.id, subject: ok ? form.subject : "language" });
            }, b.id))}
          </View>
          <Text style={{ fontWeight: "600", color: colors.ink }} accessibilityRole="header">Subject</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup">
            {subjectsFor(form.band).map((s) => chip(s.name, form.subject === s.id, () => patch({ subject: s.id }), s.id))}
          </View>
        </Card>

        <H2>What your child reads</H2>
        {form.sections.map((s, i) => (
          <Card key={i}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup">
              {(Object.keys(SECTION_NAMES) as SectionType[]).map((t) => chip(SECTION_NAMES[t], s.type === t, () => setSection(i, { type: t }), t))}
            </View>
            <Field label={`Section ${i + 1}`} value={s.body} onChangeText={(t) => setSection(i, { body: t })} multiline numberOfLines={4} maxLength={2000} style={{ minHeight: 110, textAlignVertical: "top" }} />
            {form.sections.length > 1 ? <Button title="Remove this section" kind="ghost" color={colors.danger} onPress={() => patch({ sections: form.sections.filter((_, j) => j !== i) })} /> : null}
          </Card>
        ))}
        {form.sections.length < 12 ? <Button title="+ Add a section" kind="secondary" onPress={() => patch({ sections: [...form.sections, { type: "text", body: "" }] })} /> : null}

        <H2>Quiz questions (optional)</H2>
        <P muted size={14}>Mark the correct answer. Add three hints that go from a small nudge to a worked example of a different problem. Never put the answer in a hint. Your child sees the options in a shuffled order and only earns the answer by opening the hints.</P>
        {form.quiz.map((q, i) => (
          <Card key={i}>
            <Field label={`Question ${i + 1}`} value={q.q} onChangeText={(t) => setQuestion(i, { q: t })} maxLength={300} />
            <Text style={{ fontWeight: "600", color: colors.ink }}>Answer options (tap the circle next to the correct one)</Text>
            {q.options.map((o, k) => (
              <View key={k} style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                <Pressable onPress={() => setQuestion(i, { answer: k })} accessibilityRole="radio" accessibilityLabel={`Option ${k + 1} is the correct answer`} accessibilityState={{ selected: q.answer === k, checked: q.answer === k }}
                  style={{ width: 44, height: 48, alignItems: "center", justifyContent: "center" }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.brand, backgroundColor: q.answer === k ? colors.brand : "transparent" }} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Field label={`Option ${k + 1}`} value={o} onChangeText={(t) => setQuestion(i, { options: q.options.map((x, j) => (j === k ? t : x)) })} maxLength={150} />
                </View>
              </View>
            ))}
            {q.options.length < 5 ? <Button title="+ Add an option" kind="ghost" onPress={() => setQuestion(i, { options: [...q.options, ""] })} /> : null}
            <Field label="Hint 1: a small nudge" value={q.hints[0]} onChangeText={(t) => setQuestion(i, { hints: [t, q.hints[1]!, q.hints[2]!] })} maxLength={300} />
            <Field label="Hint 2: a bigger hint" value={q.hints[1]} onChangeText={(t) => setQuestion(i, { hints: [q.hints[0]!, t, q.hints[2]!] })} maxLength={300} />
            <Field label="Hint 3: a worked example of a different problem" value={q.hints[2]} onChangeText={(t) => setQuestion(i, { hints: [q.hints[0]!, q.hints[1]!, t] })} maxLength={300} />
            <Field label="Why it is right (shown after the answer is earned)" value={q.explain} onChangeText={(t) => setQuestion(i, { explain: t })} maxLength={400} />
            <Button title="Remove this question" kind="ghost" color={colors.danger} onPress={() => patch({ quiz: form.quiz.filter((_, j) => j !== i) })} />
          </Card>
        ))}
        {form.quiz.length < 10 ? <Button title="+ Add a question" kind="secondary" onPress={() => patch({ quiz: [...form.quiz, blankQuestion()] })} /> : null}

        <Button big title={form.id ? "Save changes" : "Save lesson"} onPress={save} loading={busy} disabled={!form.title.trim()} />
      </Screen>
    );
  }

  // ------------------------------------------------------------------ the list
  const firstBand = (map.bands[2]?.id ?? "b3") as BandId;
  return (
    <Screen>
      <Button title="‹ Parent area" kind="ghost" onPress={() => router.replace("/parent")} label="Back to the parent area" />
      <H1>Lessons you add</H1>
      <P muted size={14}>Write a lesson your child needs, with an optional quiz. Only your family sees it. It appears in the lesson list for the age group you choose, marked "Added by your family". Hoot can help with it like any other lesson, which means its text goes to the AI helper you have set up when your child asks Hoot about it.</P>
      {error ? <Banner>{error}</Banner> : null}
      {notice ? <Banner tone="good">{notice}</Banner> : null}
      {warnings.map((w) => <Banner key={w}>{w}</Banner>)}
      <Button big title="+ New lesson" onPress={() => { setForm(blankLesson(firstBand)); setNotice(null); setWarnings([]); setError(null); }} />
      {data && !data.lessons.length ? <P muted>No lessons yet.</P> : null}
      {data?.lessons.map((l) => (
        <Card key={l.id}>
          <Text style={{ fontWeight: "800", fontSize: 17, color: colors.ink }}>{l.title}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Pill text={map.bands.find((b) => b.id === l.band)?.name ?? l.band} />
            <Pill text={data.subjects.find((s) => s.id === l.subject)?.name ?? l.subject} />
            <Pill text={`${l.quiz.length} questions`} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button title="Edit" kind="secondary" onPress={() => { setForm(l); setNotice(null); setWarnings([]); setError(null); }} label={`Edit ${l.title}`} />
            <Button title="Delete" kind="ghost" color={colors.danger} onPress={() => remove(l)} label={`Delete ${l.title}`} />
          </View>
        </Card>
      ))}
      {data ? <P muted size={13}>{data.lessons.length} of {data.limit} lessons used.</P> : null}
    </Screen>
  );
}
