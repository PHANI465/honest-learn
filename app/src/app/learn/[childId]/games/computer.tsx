import { Chess } from "chess.js";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChessBoard, type BoardMove } from "../../../../components/ChessBoard";
import { Banner, Button, Card, Emoji, H1, H2, P, Screen } from "../../../../components/ui";
import { chooseReply, describeMove, entriesOf, gameOutcome, levelsForBand, outcomeMessage, pieceHint, replayMoves, takeBack, type Entry, type PieceHint, type SavedGame, type Side } from "../../../../../../server/src/games/computer-opponent.ts";
import { recordPlayed } from "../../../../lib/games/played";
import { loadSavedChess, saveChess } from "../../../../lib/games/saved-chess";
import { Pop } from "../../../../lib/motion";
import { useChild } from "../../../../lib/session";
import { colors, scaledBandTheme } from "../../../../lib/theme";

/** How long the computer "thinks" at least, so its reply never lands the instant a child lets go of a piece. */
const MIN_THINK_MS = 450;

/** The game after these moves. The screen keeps only the list of moves and works everything else out from it. */
const replay = (entries: Entry[]) => replayMoves(entries) ?? new Chess();
const toEntries = entriesOf;

/**
 * Play chess against the computer. Everything runs on the device: the moves are judged by chess.js and the computer's moves come
 * from a small engine (server/src/games/computer-opponent.ts). No timer, no score, no rating; a child can take moves back.
 * Nothing is sent anywhere, so it works offline. A game that is not finished is kept on the device after every move (lib/games/saved-chess.ts),
 * so a child can leave and carry on. A hint points at a piece to think about and never says where it goes (pieceHint).
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
  /** The unfinished game kept on this device, offered on the setup screen. */
  const [saved, setSaved] = useState<SavedGame | null>(null);
  /** The hint in view: it belongs to one position and goes when the position changes. */
  const [hint, setHint] = useState<{ fen: string; hint: PieceHint } | null>(null);
  // Each new game, take-back or reply gets a new number; a reply that was already on its way checks it still matches.
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const game = useMemo(() => replay(entries), [entries]);

  useEffect(() => {
    let live = true;
    if (childId) void loadSavedChess(childId, levelsForBand(band).map((l) => l.id)).then((g) => live && setSaved(g));
    return () => {
      live = false;
    };
  }, [childId, band]);

  // Keep the game after every move, and forget it when it ends. A game with no move yet is not worth keeping.
  useEffect(() => {
    if (phase !== "play" || !childId) return;
    if (gameOutcome(game).over) void saveChess(childId, null);
    else if (entries.length) void saveChess(childId, { level, mine, moves: entries });
  }, [phase, entries, game, level, mine, childId]);

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
  function computerMoves(current: Entry[], strength = level) {
    const id = ++run.current;
    setThinking(true);
    timer.current = setTimeout(() => {
      if (run.current !== id) return;
      const chess = replay(current);
      const reply = chooseReply(chess, strength);
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
    setHint(null);
    setSaved(null);
    if (childId) void saveChess(childId, null); // a new game replaces the one that was waiting
    setPhase("play");
    if (mine === "b") computerMoves([]); // White always moves first
  }

  /** Carries on with the game kept on the device. If it is the computer's turn (the app was closed while it thought), it moves now. */
  function resume(g: SavedGame) {
    cancelReply();
    setLevel(g.level);
    setMine(g.mine);
    setEntries(g.moves);
    setHint(null);
    setSaid("Welcome back! Your game is just as you left it.");
    setPhase("play");
    if (replay(g.moves).turn() !== g.mine) computerMoves(g.moves, g.level);
  }

  /** The next hint for this position: first about safety, then one piece to think about. Asking costs nothing and is not recorded. */
  function giveHint() {
    const fen = game.fen();
    setHint({ fen, hint: pieceHint(game, mine, hint && hint.fen === fen ? 2 : 1) });
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
    setHint(null);
    setSaid(`You: ${describeMove(move)}.`);
    if (gameOutcome(chess).over) void recordPlayed(child!.id, "computer");
    else computerMoves(next);
  }

  function undo() {
    cancelReply(); // a reply that is still being "thought" is cancelled
    const chess = replay(entries);
    if (takeBack(chess, mine)) {
      setEntries(toEntries(chess));
      setHint(null);
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
        {saved ? (
          <Card style={{ borderRadius: t.radius, gap: 10, backgroundColor: t.soft }}>
            <H2>Your game is waiting</H2>
            <P size={14}>You were {saved.mine === "w" ? "White" : "Black"} against the {levels.find((l) => l.id === saved.level)?.name ?? "computer"} computer, {Math.ceil(saved.moves.length / 2)} {Math.ceil(saved.moves.length / 2) === 1 ? "move" : "moves"} in.</P>
            <Button big title="Carry on with this game" color={t.accent} onPress={() => resume(saved)} />
            <P muted size={13}>Starting a new game below puts this one away for good.</P>
          </Card>
        ) : null}
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
          <Button big title={saved ? "Start a new game" : "Start the game"} color={t.accent} kind={saved ? "secondary" : "primary"} onPress={start} />
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

      <ChessBoard fen={game.fen()} onMove={play} disabled={!myTurn} lastMove={last ? { from: last.from, to: last.to } : null} accent={t.accent} flipped={mine === "b"} marked={hint && hint.fen === game.fen() ? hint.hint.square : null} />
      {hint && hint.fen === game.fen() ? (
        <View aria-live="polite" accessibilityLiveRegion="polite"><Banner tone="info">{hint.hint.text}</Banner></View>
      ) : null}

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
          <Button title="💡 Hint" kind="secondary" color={t.accent} onPress={giveHint} disabled={!myTurn} label="Give me a hint. It points at a piece to think about and never says where to move" />
          <Button title="↩ Take back my move" kind="secondary" color={t.accent} onPress={undo} disabled={!history.some((m) => m.color === mine)} label="Take back my last move and the computer's reply" />
        </View>
      )}
      {!over && thinking ? <Banner tone="info">The computer is choosing a move. Higher levels take a little longer.</Banner> : null}
    </Screen>
  );
}
