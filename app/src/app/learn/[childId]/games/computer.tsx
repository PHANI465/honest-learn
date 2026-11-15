import { Chess } from "chess.js";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChessBoard, type BoardMove } from "../../../../components/ChessBoard";
import { Banner, Button, Card, Emoji, H1, H2, P, Screen } from "../../../../components/ui";
import { chooseReply, describeMove, gameOutcome, levelsForBand, outcomeMessage, takeBack, type Side } from "../../../../../../server/src/games/computer-opponent.ts";
import { recordPlayed } from "../../../../lib/games/played";
import { Pop } from "../../../../lib/motion";
import { useChild } from "../../../../lib/session";
import { colors, scaledBandTheme } from "../../../../lib/theme";

/** How long the computer "thinks" at least, so its reply never lands the instant a child lets go of a piece. */
const MIN_THINK_MS = 450;

/** A move as kept in the game: the squares, and a queen when a pawn reached the last rank. */
interface Entry {
  from: string;
  to: string;
  promotion?: "q";
}
/** The game after these moves. The screen keeps only the list of moves and works everything else out from it. */
const replay = (entries: Entry[]) => {
  const chess = new Chess();
  for (const e of entries) chess.move(e);
  return chess;
};
const toEntries = (chess: Chess): Entry[] => chess.history({ verbose: true }).map((m) => ({ from: m.from, to: m.to, ...(m.promotion ? { promotion: "q" as const } : {}) }));

/**
 * Play chess against the computer. Everything runs on the device: the moves are judged by chess.js and the computer's moves come
 * from a small engine (server/src/games/computer-opponent.ts). No timer, no score, no rating; a child can take moves back.
 * Nothing is sent anywhere, so it works offline.
 */
export default function PlayComputer() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const child = useChild(childId);
  const band = child?.band ?? "b3";
  const levels = levelsForBand(band);
  const [phase, setPhase] = useState<"setup" | "play">("setup");
  const [level, setLevel] = useState(1);
  const [mine, setMine] = useState<Side>("w");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [said, setSaid] = useState("");
  const [thinking, setThinking] = useState(false);
  // Each new game, take-back or reply gets a new number; a reply that was already on its way checks it still matches.
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const game = useMemo(() => replay(entries), [entries]);

  useEffect(() => () => {
    run.current++;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!child) return null;
  const t = scaledBandTheme(band);
  const young = band === "b2";
  const outcome = gameOutcome(game);
  const over = outcome.over;
  const history = game.history({ verbose: true });
  const last = history[history.length - 1];
  const myTurn = !over && !thinking && game.turn() === mine;

  function cancelReply() {
    run.current++;
    if (timer.current) clearTimeout(timer.current);
    setThinking(false);
  }

  /** The computer answers after a short pause. `current` is the game so far; the search itself runs when the pause ends. */
  function computerMoves(current: Entry[]) {
    const id = ++run.current;
    setThinking(true);
    timer.current = setTimeout(() => {
      if (run.current !== id) return;
      const chess = replay(current);
      const reply = chooseReply(chess, level);
      setThinking(false);
      if (!reply) return;
      const move = chess.move({ from: reply.from, to: reply.to, promotion: reply.promotion });
      setSaid(`The computer: ${describeMove(move)}.`);
      setEntries(toEntries(chess));
      if (gameOutcome(chess).over) void recordPlayed(child!.id, "computer");
    }, MIN_THINK_MS);
  }

  function start() {
    cancelReply();
    setEntries([]);
    setSaid("");
    setPhase("play");
    if (mine === "b") computerMoves([]); // White always moves first
  }

  function play(m: BoardMove) {
    if (!myTurn) return;
    const chess = replay(entries);
    let move;
    try {
      move = chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    } catch {
      return; // not a legal move (the board only offers legal ones, so this is a safety net)
    }
    const next = toEntries(chess);
    setEntries(next);
    setSaid(`You: ${describeMove(move)}.`);
    if (gameOutcome(chess).over) void recordPlayed(child!.id, "computer");
    else computerMoves(next);
  }

  function undo() {
    cancelReply(); // a reply that is still being "thought" is cancelled
    const chess = replay(entries);
    if (takeBack(chess, mine)) {
      setEntries(toEntries(chess));
      setSaid("You took your last move back. Try a different one.");
    }
  }

  function again() {
    cancelReply();
    setPhase("setup");
  }

  const chip = (label: string, hint: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${label}. ${hint}`}
      accessibilityState={{ selected, checked: selected }}
      style={{ paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: "center", borderRadius: t.radius, borderWidth: 2, borderColor: selected ? t.accent : colors.line, backgroundColor: selected ? t.soft : colors.card, minWidth: 120 }}
    >
      <Text style={{ fontWeight: "800", color: colors.ink, fontSize: t.font }}>{label}</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{hint}</Text>
    </Pressable>
  );

  // ------------------------------------------------------------------ choose a level and a colour
  if (phase === "setup") {
    return (
      <Screen>
        <Button title="‹ Games" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back to games" />
        <H1 size={young ? 30 : 26}>♞ Play chess</H1>
        <P muted size={14}>Play a game against the computer. There is no timer and no score, and you can take moves back. It all happens on this device.</P>
        <Card style={{ borderRadius: t.radius, gap: 10 }}>
          <H2>How strong should the computer be?</H2>
          <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
            {levels.map((l) => chip(l.name, l.blurb, level === l.id, () => setLevel(l.id)))}
          </View>
          <H2>You play</H2>
          <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {chip("White", "You move first", mine === "w", () => setMine("w"))}
            {chip("Black", "The computer moves first", mine === "b", () => setMine("b"))}
          </View>
          <Button big title="Start the game" color={t.accent} onPress={start} />
        </Card>
        <P muted size={13}>New to chess? The chess puzzles and lessons teach how each piece moves. Pawns that reach the end always become queens here.</P>
      </Screen>
    );
  }

  // ------------------------------------------------------------------ the game
  const check = !over && game.inCheck();
  const status = over ? "" : thinking ? "The computer is thinking…" : myTurn ? (check ? "Your move. You are in check!" : "Your move") : "";
  const end = outcomeMessage(outcome, mine);
  const won = outcome.over && outcome.kind === "checkmate" && outcome.winner === mine;
  return (
    <Screen>
      <Button title="‹ Choose again" kind="ghost" color={t.accent} onPress={again} label="Stop this game and choose the level again" />
      <H1 size={young ? 28 : 24}>♞ You are {mine === "w" ? "White" : "Black"}</H1>
      {/* Spoken or read out as it changes: whose turn it is and what the last move was. */}
      <View aria-live="polite" accessibilityLiveRegion="polite" style={{ minHeight: 44, gap: 2 }}>
        {status ? <Text style={{ fontWeight: "800", fontSize: t.font, color: check ? colors.warn : colors.ink }}>{status}</Text> : null}
        {said ? <Text style={{ color: colors.muted, fontSize: 14 }}>{said}</Text> : null}
      </View>

      <ChessBoard fen={game.fen()} onMove={play} disabled={!myTurn} lastMove={last ? { from: last.from, to: last.to } : null} accent={t.accent} flipped={mine === "b"} />

      {over ? (
        <Card style={{ borderRadius: t.radius, alignItems: "center", backgroundColor: won ? colors.goodSoft : colors.brandSoft }}>
          {won ? <Pop><Emoji size={56}>🎉</Emoji></Pop> : null}
          <View accessibilityRole="alert"><H2>{end.title}</H2></View>
          <P center size={15}>{end.body}</P>
          <Button big title="Play again" color={t.accent} onPress={again} />
          <Button title="Back to games" kind="ghost" color={t.accent} onPress={() => router.back()} />
        </Card>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button title="↩ Take back my move" kind="secondary" color={t.accent} onPress={undo} disabled={!history.some((m) => m.color === mine)} label="Take back my last move and the computer's reply" />
        </View>
      )}
      {!over && thinking ? <Banner tone="info">The computer is choosing a move. Higher levels take a little longer.</Banner> : null}
    </Screen>
  );
}
