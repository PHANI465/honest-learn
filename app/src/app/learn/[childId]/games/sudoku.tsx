import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Banner, Button, Card, Emoji, H1, Loading, P, Screen } from "../../../../components/ui";
import { api, friendly } from "../../../../lib/api";
import { Pop } from "../../../../lib/motion";
import { useChild, useSession } from "../../../../lib/session";
import { colors, scaledBandTheme } from "../../../../lib/theme";

interface Overview {
  size: number;
  boxRows: number;
  boxCols: number;
  levels: { level: number; solved: number; next: number; clues: number }[];
}
interface PuzzleData {
  n: number;
  level: number;
  size: number;
  boxRows: number;
  boxCols: number;
  givens: number[];
  solved: boolean;
}
interface Snapshot {
  cells: number[];
  notes: Record<number, number[]>;
}

/** The youngest group plays with pictures instead of digits (4x4 only). */
const PICTURES = [
  { symbol: "🍎", name: "apple" },
  { symbol: "🐱", name: "cat" },
  { symbol: "⭐", name: "star" },
  { symbol: "🌙", name: "moon" },
];
const LEVEL_NAMES = ["Easy", "Medium", "Hard"];

/** Boards in progress are kept while the app is open, so leaving the screen does not lose them. */
const savedBoards = new Map<string, Snapshot>();

export default function Sudoku() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { familyToken } = useSession();
  const child = useChild(childId);
  const { width } = useWindowDimensions();

  const [overview, setOverview] = useState<Overview | null>(null);
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [cells, setCells] = useState<number[]>([]);
  const [notes, setNotes] = useState<Record<number, number[]>>({});
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [wrong, setWrong] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState<{ text: string; level: number } | null>(null);
  const [nextHint, setNextHint] = useState(0);
  const [solved, setSolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = puzzle ? `${childId}:${puzzle.size}:${puzzle.level}:${puzzle.n}` : "";

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api<Overview>("GET", `/children/${childId}/games/sudoku`, familyToken));
    } catch (e) {
      setError(friendly(e));
    }
  }, [childId, familyToken]);

  useEffect(() => {
    let live = true;
    api<Overview>("GET", `/children/${childId}/games/sudoku`, familyToken)
      .then((r) => live && setOverview(r))
      .catch((e) => live && setError(friendly(e)));
    return () => {
      live = false;
    };
  }, [childId, familyToken]);

  // keep the board while the app is open
  useEffect(() => {
    if (key && cells.length) savedBoards.set(key, { cells, notes });
  }, [key, cells, notes]);

  async function open(level: number, n: number) {
    setError(null);
    try {
      const p = await api<PuzzleData>("GET", `/children/${childId}/games/sudoku/${n}?level=${level}`, familyToken);
      const saved = savedBoards.get(`${childId}:${p.size}:${p.level}:${p.n}`);
      setPuzzle(p);
      setCells(saved && !p.solved ? saved.cells : p.givens.map(() => 0));
      setNotes(saved && !p.solved ? saved.notes : {});
      setHistory([]);
      setSelected(null);
      setWrong([]);
      setMessage(null);
      setHint(null);
      setNextHint(0);
      setSolved(p.solved);
    } catch (e) {
      setError(friendly(e));
    }
  }

  const size = puzzle?.size ?? overview?.size ?? 9;
  const young = child?.band === "b1";
  const pictureMode = young && size === 4;
  const t = child ? scaledBandTheme(child.band) : null;

  // ---------------------------------------------------------------- editing
  const isGiven = useCallback((i: number) => !!puzzle && puzzle.givens[i] !== 0, [puzzle]);

  const place = useCallback(
    (v: number) => {
      if (selected === null || isGiven(selected) || solved) return;
      if (notesMode && v !== 0) {
        if (cells[selected]) return; // notes only go in empty squares
        setHistory((h) => [...h.slice(-49), { cells: [...cells], notes: { ...notes } }]);
        const cur = notes[selected] ?? [];
        setNotes({ ...notes, [selected]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort() });
        return;
      }
      setHistory((h) => [...h.slice(-49), { cells: [...cells], notes: { ...notes } }]);
      const next = [...cells];
      next[selected] = v;
      setCells(next);
      setWrong((w) => w.filter((i) => i !== selected));
      setMessage(null);
      if (v !== 0 && notes[selected]) {
        const { [selected]: _gone, ...rest } = notes;
        setNotes(rest);
      }
    },
    [selected, isGiven, solved, notesMode, cells, notes],
  );

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setCells(last.cells);
    setNotes(last.notes);
    setHistory(history.slice(0, -1));
    setWrong([]);
    setMessage(null);
  }

  // keyboard on the web: digits, Backspace/Delete, arrows
  useEffect(() => {
    if (Platform.OS !== "web" || !puzzle) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      if (/^[1-9]$/.test(e.key) && Number(e.key) <= size) {
        place(Number(e.key));
        e.preventDefault();
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        place(0);
        e.preventDefault();
      } else if (e.key.startsWith("Arrow")) {
        setSelected((s) => {
          const cur = s ?? 0;
          const r = Math.floor(cur / size);
          const c = cur % size;
          const nr = e.key === "ArrowUp" ? Math.max(0, r - 1) : e.key === "ArrowDown" ? Math.min(size - 1, r + 1) : r;
          const nc = e.key === "ArrowLeft" ? Math.max(0, c - 1) : e.key === "ArrowRight" ? Math.min(size - 1, c + 1) : c;
          return nr * size + nc;
        });
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [place, puzzle, size]);

  // ---------------------------------------------------------------- server calls
  const board = () => (puzzle ? puzzle.givens.map((g, i) => (g ? g : cells[i] ?? 0)) : []);

  async function check() {
    if (!puzzle) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ wrong: number[]; filled: number; solved: boolean }>("POST", `/children/${childId}/games/sudoku/${puzzle.n}/check?level=${puzzle.level}`, familyToken, { cells: board() });
      setWrong(r.wrong);
      if (r.solved) {
        setSolved(true);
        setMessage(null);
        void loadOverview();
      } else if (r.wrong.length) {
        setMessage(`${r.wrong.length} ${r.wrong.length === 1 ? "square needs" : "squares need"} another look. They are marked with ✗.`);
      } else {
        setMessage("Everything you have filled in so far is right. Keep going!");
      }
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function askHint() {
    if (!puzzle) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ hint: string; level: number; isLast: boolean }>("POST", `/children/${childId}/games/sudoku/${puzzle.n}/hint?level=${puzzle.level}`, familyToken, { cells: board(), level: nextHint });
      setHint({ text: r.hint, level: r.level });
      setNextHint(r.isLast ? 0 : r.level + 1);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------- layout
  const cellSize = useMemo(() => Math.max(36, Math.min(60, Math.floor((Math.min(width, 640) - 48) / size))), [width, size]);
  if (!child || !t) return null;
  if (error && !overview) return <Screen><Banner>{`${error} Games need the internet.`}</Banner><Button title="Back" onPress={() => router.back()} /></Screen>;
  if (!overview) return <Loading />;

  const symbolOf = (v: number) => (pictureMode ? PICTURES[v - 1]!.symbol : String(v));
  const nameOf = (v: number) => (pictureMode ? PICTURES[v - 1]!.name : String(v));

  // ---------------------------------------------------------------- level chooser
  if (!puzzle) {
    return (
      <Screen>
        <Button title="‹ Games" kind="ghost" color={t.accent} onPress={() => router.back()} label="Back to games" />
        <H1 size={young ? 30 : 26}>🔢 Sudoku</H1>
        <P>{pictureMode ? "Put each picture in every row, every column and every box once." : `Fill the grid so every row, every column and every box has the numbers 1 to ${overview.size} exactly once.`}</P>
        <P muted size={14}>No timer, no scores. If you get stuck, ask for a hint: you get a small nudge first.</P>
        {error ? <Banner>{error}</Banner> : null}
        {overview.levels.map((l) => (
          <Card key={l.level} onPress={() => open(l.level, l.next)} label={`${LEVEL_NAMES[l.level - 1]}, puzzle ${l.next}`} style={{ borderRadius: t.radius, flexDirection: "row", alignItems: "center", gap: 12, borderColor: t.accent, borderWidth: 2 }}>
            <Emoji size={32}>{["🌱", "🌿", "🌳"][l.level - 1]}</Emoji>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: t.font, color: colors.ink }}>{LEVEL_NAMES[l.level - 1]}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{l.solved ? `${l.solved} solved · next is puzzle ${l.next}` : "Start with puzzle 1"} · {l.clues} squares given</Text>
            </View>
            <Text style={{ fontSize: 22, color: colors.muted }} aria-hidden accessibilityElementsHidden importantForAccessibility="no">›</Text>
          </Card>
        ))}
      </Screen>
    );
  }

  // ---------------------------------------------------------------- the board
  const sel = selected;
  const selRow = sel === null ? -1 : Math.floor(sel / size);
  const selCol = sel === null ? -1 : sel % size;
  const selBox = sel === null ? -1 : Math.floor(selRow / puzzle.boxRows) * (size / puzzle.boxCols) + Math.floor(selCol / puzzle.boxCols);
  const boxOf = (i: number) => Math.floor(Math.floor(i / size) / puzzle.boxRows) * (size / puzzle.boxCols) + Math.floor((i % size) / puzzle.boxCols);
  const noteCols = size === 4 ? 2 : 3;

  const thick = 3;
  const thin = 1;

  return (
    <Screen>
      <Button title="‹ Puzzles" kind="ghost" color={t.accent} onPress={() => { setPuzzle(null); void loadOverview(); }} label="Back to the puzzle list" />
      <Text style={{ color: t.accent, fontWeight: "800" }}>{LEVEL_NAMES[puzzle.level - 1]} · puzzle {puzzle.n}</Text>
      {error ? <Banner>{error}</Banner> : null}
      {message ? <Banner tone={wrong.length ? "warn" : "good"}>{message}</Banner> : null}

      {solved ? (
        <Card style={{ borderRadius: t.radius, alignItems: "center", backgroundColor: colors.goodSoft }}>
          <Pop><Emoji size={56}>🎉</Emoji></Pop>
          <View accessibilityRole="alert"><H1>Solved!</H1></View>
          <P center>Every row, column and box is complete. Well done for sticking with it.</P>
          <Button big title="Next puzzle" color={t.accent} onPress={() => open(puzzle.level, puzzle.n + 1)} />
          <Button title="Choose another level" kind="ghost" color={t.accent} onPress={() => { setPuzzle(null); void loadOverview(); }} />
        </Card>
      ) : null}

      <View accessibilityLabel={`Sudoku grid, ${size} by ${size}`} style={{ alignSelf: "center" }}>
        {Array.from({ length: size }, (_, r) => (
          <View key={r} style={{ flexDirection: "row" }}>
            {Array.from({ length: size }, (_, c) => {
              const i = r * size + c;
              const given = isGiven(i);
              const v = given ? puzzle.givens[i]! : cells[i] ?? 0;
              const isWrong = wrong.includes(i);
              const isSel = sel === i;
              const related = sel !== null && !isSel && (r === selRow || c === selCol || boxOf(i) === selBox);
              const sameNumber = sel !== null && v !== 0 && v === (isGiven(sel) ? puzzle.givens[sel] : cells[sel]);
              const myNotes = notes[i] ?? [];
              const label = `Row ${r + 1}, column ${c + 1}, ${given ? `given ${nameOf(v)}` : v ? nameOf(v) : myNotes.length ? `empty, notes ${myNotes.map(nameOf).join(" ")}` : "empty"}${isWrong ? ", needs another look" : ""}${isSel ? ", selected" : ""}`;
              return (
                <Pressable
                  key={c}
                  onPress={() => setSelected(i)}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: isSel }}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    alignItems: "center",
                    justifyContent: "center",
                    borderColor: colors.ink,
                    borderTopWidth: r % puzzle.boxRows === 0 ? thick : thin,
                    borderLeftWidth: c % puzzle.boxCols === 0 ? thick : thin,
                    borderRightWidth: c === size - 1 ? thick : 0,
                    borderBottomWidth: r === size - 1 ? thick : 0,
                    backgroundColor: isSel ? t.soft : sameNumber ? "#FFF7DB" : related ? "#F1EEE8" : "#fff",
                    outlineWidth: 0,
                  }}
                >
                  {isSel ? <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderColor: t.accent }} /> : null}
                  {v ? (
                    <Text style={{ fontSize: cellSize * (pictureMode ? 0.6 : 0.55), fontWeight: given ? "800" : "600", color: isWrong ? colors.danger : given ? colors.ink : t.accent }}>{symbolOf(v)}</Text>
                  ) : myNotes.length ? (
                    <View style={{ width: cellSize - 6, flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }} pointerEvents="none">
                      {myNotes.map((n) => (
                        <Text key={n} style={{ width: (cellSize - 6) / noteCols, fontSize: 12, textAlign: "center", color: colors.muted }}>{symbolOf(n)}</Text>
                      ))}
                    </View>
                  ) : null}
                  {isWrong ? <Text style={{ position: "absolute", top: 0, right: 2, fontSize: 12, fontWeight: "800", color: colors.danger }} aria-hidden>✗</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {!solved ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {Array.from({ length: size }, (_, k) => k + 1).map((v) => (
              <Pressable key={v} onPress={() => place(v)} accessibilityRole="button" accessibilityLabel={`${notesMode ? "Note " : "Put "}${nameOf(v)}`}
                style={{ minWidth: 48, minHeight: 48, borderRadius: 12, borderWidth: 2, borderColor: t.accent, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
                <Text style={{ fontSize: 24, fontWeight: "800", color: t.accent }}>{symbolOf(v)}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => place(0)} accessibilityRole="button" accessibilityLabel="Erase this square"
              style={{ minWidth: 48, minHeight: 48, paddingHorizontal: 10, borderRadius: 12, borderWidth: 2, borderColor: colors.inputLine, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>Erase</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            <Pressable onPress={() => setNotesMode(!notesMode)} accessibilityRole="switch" accessibilityState={{ checked: notesMode }} accessibilityLabel="Notes mode, for writing small possible numbers"
              style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 2, borderColor: notesMode ? colors.brand : colors.inputLine, backgroundColor: notesMode ? colors.brandSoft : "#fff", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontWeight: "700", color: colors.ink }}>✏️ Notes {notesMode ? "on" : "off"}</Text>
            </Pressable>
            <Button title="Undo" kind="secondary" color={t.accent} onPress={undo} disabled={!history.length} />
            <Button title="Check" kind="secondary" color={t.accent} onPress={check} loading={busy} />
            <Button title={`Hint ${nextHint + 1} of 3`} color={t.accent} onPress={askHint} loading={busy} label={`Get hint ${nextHint + 1} of 3`} />
          </View>
          {hint ? (
            <Card style={{ borderRadius: t.radius, backgroundColor: "#FFF7DB" }}>
              <Text style={{ fontWeight: "800", color: colors.ink }}>💡 Hint {hint.level + 1} of 3</Text>
              <Text style={{ fontSize: t.font, lineHeight: t.font * 1.45, color: colors.ink }} accessibilityLiveRegion="polite">{hint.text}</Text>
            </Card>
          ) : null}
          <P muted size={13}>{Platform.OS === "web" ? "On a keyboard: arrow keys move, number keys fill in, Backspace clears." : "Tap a square, then a number."}</P>
        </>
      ) : null}
    </Screen>
  );
}
