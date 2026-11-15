import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChessBoard, type BoardMove } from "../../../../components/ChessBoard";
import { Banner, Button, Card, Emoji, H1, Loading, P, Screen } from "../../../../components/ui";
import { api, friendly } from "../../../../lib/api";
import { Pop } from "../../../../lib/motion";
import { useChild, useSession } from "../../../../lib/session";
import { colors, scaledBandTheme } from "../../../../lib/theme";

interface Overview {
  available: boolean;
  levels: { level: number; name: string; solved: number; puzzles: { id: string; theme: string; solved: boolean }[] }[];
}
interface PuzzleData {
  id: string;
  theme: string;
  fen: string;
  toMove: "white" | "black";
  goal: "mate" | "win";
  solverMoves: number;
  solved: boolean;
}
interface MoveResponse {
  correct: boolean;
  reason?: string;
  san?: string;
  reply?: { from: string; to: string; san: string } | null;
  done?: boolean;
  fen?: string;
  fenAfterReply?: string | null;
  rest?: string[];
  explain?: string;
}

/** Chess puzzles: the server checks each move you make and never sends the answer. No clock, no rating. */
export default function ChessPuzzles() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { familyToken } = useSession();
  const child = useChild(childId);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [fen, setFen] = useState("");
  const [step, setStep] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "good" | "warn" | "info" } | null>(null);
  const [hint, setHint] = useState<{ text: string; level: number } | null>(null);
  const [nextHint, setNextHint] = useState(0);
  const [done, setDone] = useState<{ explain: string; rest: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api<Overview>("GET", `/children/${childId}/games/chess`, familyToken));
    } catch (e) {
      setError(friendly(e));
    }
  }, [childId, familyToken]);

  useEffect(() => {
    let live = true;
    api<Overview>("GET", `/children/${childId}/games/chess`, familyToken)
      .then((r) => live && setOverview(r))
      .catch((e) => live && setError(friendly(e)));
    return () => {
      live = false;
    };
  }, [childId, familyToken]);

  async function open(id: string) {
    setError(null);
    try {
      const p = await api<PuzzleData>("GET", `/children/${childId}/games/chess/${id}`, familyToken);
      setPuzzle(p);
      setFen(p.fen);
      setStep(0);
      setLastMove(null);
      setMessage(null);
      setHint(null);
      setNextHint(0);
      setDone(null);
    } catch (e) {
      setError(friendly(e));
    }
  }

  async function play(m: BoardMove) {
    if (!puzzle || busy || done) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<MoveResponse>("POST", `/children/${childId}/games/chess/${puzzle.id}/move`, familyToken, { step, from: m.from, to: m.to, promotion: m.promotion });
      if (!r.correct) {
        setMessage({ text: "Not that one. Think again: look at the squares around the king, or ask for a hint.", tone: "warn" });
        return;
      }
      setLastMove({ from: m.from, to: m.to });
      setHint(null);
      setNextHint(0);
      if (r.done) {
        setFen(r.fen!);
        setDone({ explain: r.explain ?? "", rest: r.rest ?? [] });
        setMessage(null);
        void loadOverview();
      } else if (r.reply) {
        setFen(r.fen!);
        setMessage({ text: "Good move! Black replies. Now find the next move.", tone: "good" });
        // show Black's reply a moment later, then it is the child's turn again
        const afterReply = r.fenAfterReply!;
        const replyMove = r.reply;
        setTimeout(() => {
          setFen(afterReply);
          setLastMove({ from: replyMove.from, to: replyMove.to });
          setStep(step + 2);
        }, 700);
      }
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function askHint() {
    if (!puzzle) return;
    try {
      const r = await api<{ hint: string; level: number; isLast: boolean }>("POST", `/children/${childId}/games/chess/${puzzle.id}/hint`, familyToken, { step, level: nextHint });
      setHint({ text: r.hint, level: r.level });
      setNextHint(r.isLast ? 3 : r.level + 1);
    } catch (e) {
      setError(friendly(e));
    }
  }

  if (!child) return null;
  const t = scaledBandTheme(child.band);
  if (error && !overview) return <Screen><Banner>{`${error} Chess puzzles need the internet.`}</Banner><Button title="Back" onPress={() => router.back()} /></Screen>;
  if (!overview) return <Loading />;

  const allIds = overview.levels.flatMap((l) => l.puzzles.map((p) => p.id));

  // ---------------------------------------------------------------- puzzle list
  if (!puzzle) {
    return (
      <Screen>
        <Button title="‹ Games" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back to games" />
        <H1 size={30}>♞ Chess puzzles</H1>
        <P muted size={14}>You play White. Tap a piece, then a highlighted square. No clock, no rating: take as long as you like, and ask for a hint if you are stuck.</P>
        {error ? <Banner>{error}</Banner> : null}
        {!overview.available ? <Banner tone="info">There are no chess puzzles for this age group yet.</Banner> : null}
        {overview.levels.map((l) => (
          <Card key={l.level} style={{ borderRadius: t.radius }}>
            <Text style={{ fontWeight: "800", fontSize: t.font, color: colors.ink }}>{l.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{l.solved} of {l.puzzles.length} solved</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {l.puzzles.map((p, i) => (
                <Pressable key={p.id} onPress={() => open(p.id)} accessibilityRole="button" accessibilityLabel={`Level ${l.level} puzzle ${i + 1}${p.solved ? ", solved" : ""}`}
                  style={{ width: 52, height: 52, borderRadius: 12, borderWidth: 2, borderColor: p.solved ? colors.good : t.accent, backgroundColor: p.solved ? colors.goodSoft : "#fff", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontWeight: "800", fontSize: 17, color: colors.ink }}>{i + 1}</Text>
                  {p.solved ? <Text style={{ position: "absolute", top: 0, right: 4, fontSize: 12, color: colors.good }} aria-hidden>✓</Text> : null}
                </Pressable>
              ))}
            </View>
          </Card>
        ))}
      </Screen>
    );
  }

  // ---------------------------------------------------------------- one puzzle
  const goalText = puzzle.goal === "mate" ? `White to move. Find checkmate${puzzle.solverMoves > 1 ? ` in ${puzzle.solverMoves}` : " in 1"}.` : "White to move. Find the move that wins material by force.";
  const index = allIds.indexOf(puzzle.id);
  const nextId = allIds[index + 1];
  return (
    <Screen>
      <Button title="‹ Puzzles" kind="ghost" color={t.accent} onPress={() => { setPuzzle(null); void loadOverview(); }} label="Back to the puzzle list" />
      <Text style={{ color: t.accent, fontWeight: "800" }}>Puzzle {index + 1} of {allIds.length}</Text>
      <View accessibilityRole="alert"><Text style={{ fontSize: t.font, fontWeight: "700", color: colors.ink }}>{goalText}</Text></View>
      {error ? <Banner>{error}</Banner> : null}
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <ChessBoard fen={fen} onMove={play} disabled={busy || !!done} lastMove={lastMove} accent={t.accent} />

      {done ? (
        <Card style={{ borderRadius: t.radius, alignItems: "center", backgroundColor: colors.goodSoft }}>
          <Pop><Emoji size={48}>🎉</Emoji></Pop>
          <View accessibilityRole="alert"><H1>Well done!</H1></View>
          <P center>{done.explain}</P>
          {done.rest.length ? <P center muted size={14}>What happens next: {done.rest.join(", ")}.</P> : null}
          {nextId ? <Button big title="Next puzzle" color={t.accent} onPress={() => open(nextId)} /> : null}
          <Button title="Back to the list" kind="ghost" color={t.accent} onPress={() => { setPuzzle(null); void loadOverview(); }} />
        </Card>
      ) : (
        <>
          {hint ? (
            <Card style={{ borderRadius: t.radius, backgroundColor: "#FFF7DB" }}>
              <Text style={{ fontWeight: "800", color: colors.ink }}>💡 Hint {hint.level + 1} of 3</Text>
              <Text style={{ fontSize: t.font, lineHeight: t.font * 1.45, color: colors.ink }} accessibilityLiveRegion="polite">{hint.text}</Text>
            </Card>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {nextHint < 3 ? <Button title={`Hint ${nextHint + 1} of 3`} color={t.accent} onPress={askHint} label={`Get hint ${nextHint + 1} of 3`} /> : null}
            <Button title="Start this puzzle again" kind="ghost" color={colors.muted} onPress={() => open(puzzle.id)} />
          </View>
        </>
      )}
    </Screen>
  );
}
