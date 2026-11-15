// Saving a chess game against the computer, and hints that point at a piece. Both are pure logic in games/computer-opponent.ts; the
// screen (app/src/app/learn/[childId]/games/computer.tsx) and the on-device storage (app/src/lib/games/saved-chess.ts) only call it.
// A saved game comes back from storage, which can be edited or damaged, so it is treated as untrusted input.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import * as co from "../src/games/computer-opponent.ts";

/** Plays `plies` moves from the start with a seeded choice of legal moves; returns the game. */
function play(plies: number, seed = 1): Chess {
  const chess = new Chess();
  let s = seed;
  const next = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < plies && !chess.isGameOver(); i++) {
    const moves = chess.moves({ verbose: true }).filter((m) => !m.promotion || m.promotion === "q");
    const m = moves[Math.floor(next() * moves.length)]!;
    chess.move({ from: m.from, to: m.to, ...(m.promotion ? { promotion: "q" } : {}) });
  }
  return chess;
}
const saved = (chess: Chess, over: Partial<co.SavedGame> = {}): co.SavedGame => ({ level: 2, mine: "w", moves: co.entriesOf(chess), ...over });
const SQUARE_NAMES = /\b[a-h][1-8]\b/g;

// ================================================================ saving
describe("a saved game", () => {
  test("is only the list of moves, and plays back to the same position", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const chess = play(30 + seed, seed);
      const back = co.readSavedGame(JSON.stringify(saved(chess)));
      assert.ok(back, `seed ${seed}`);
      assert.equal(co.replayMoves(back!.moves)!.fen(), chess.fen());
      assert.equal(back!.level, 2);
      assert.equal(back!.mine, "w");
    }
  });

  test("comes back the same from text or from an object, and extra fields are dropped", () => {
    const g = saved(play(10));
    const text = co.readSavedGame(JSON.stringify(g))!;
    const obj = co.readSavedGame({ ...g, extra: "x", __proto__: { polluted: 1 } })!;
    assert.deepEqual(text, obj);
    assert.deepEqual(Object.keys(obj).sort(), ["level", "mine", "moves"]);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });

  test("a promotion survives (a pawn that reached the last rank is a queen)", () => {
    const chess = new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    chess.move({ from: "a7", to: "a8", promotion: "q" });
    const moves = co.entriesOf(chess);
    assert.deepEqual(moves, [{ from: "a7", to: "a8", promotion: "q" }]);
    // not from the start position, so it cannot be replayed: the whole save is ignored rather than guessed at
    assert.equal(co.readSavedGame({ level: 1, mine: "w", moves }), null);
  });

  test("anything that is not a usable game is ignored", () => {
    const good = saved(play(8));
    const bad: unknown[] = [
      null, undefined, "", "not json", "[]", "{}", 7, true, [],
      { ...good, level: 0 }, { ...good, level: 5 }, { ...good, level: 2.5 }, { ...good, level: "2" },
      { ...good, mine: "x" }, { ...good, mine: undefined },
      { ...good, moves: [] }, { ...good, moves: "e2e4" }, { ...good, moves: null },
      { ...good, moves: [...good.moves, 5] }, { ...good, moves: [...good.moves, null] },
      { ...good, moves: [{ from: "e2" }] }, { ...good, moves: [{ from: "e2", to: "e9" }] }, { ...good, moves: [{ from: "z2", to: "e4" }] },
      { ...good, moves: [{ from: "e2", to: "e4", promotion: "n" }] }, { ...good, moves: [{ from: 12, to: 34 }] },
    ];
    for (const x of bad) assert.equal(co.readSavedGame(x), null, JSON.stringify(x));
  });

  test("an illegal move anywhere makes the whole game unusable", () => {
    const good = saved(play(12));
    const moves = [...good.moves];
    moves[5] = { from: "a1", to: "a8" };
    assert.equal(co.readSavedGame({ ...good, moves }), null);
    // two moves for the same side in a row
    assert.equal(co.readSavedGame({ ...good, moves: [{ from: "e2", to: "e4" }, { from: "d2", to: "d4" }] }), null);
    // a move that leaves the king in check
    assert.equal(co.readSavedGame({ level: 1, mine: "w", moves: [{ from: "e2", to: "e4" }, { from: "f7", to: "f6" }, { from: "d1", to: "h5" }, { from: "a7", to: "a6" }] }), null);
  });

  test("a level this age group cannot choose is refused", () => {
    const g = saved(play(6), { level: 4 });
    assert.ok(co.readSavedGame(g));
    assert.equal(co.readSavedGame(g, [1, 2, 3]), null);
    assert.ok(co.readSavedGame(g, [1, 2, 3, 4]));
  });

  test("a game that is already over is not resumed", () => {
    const foolsMate = [["f2", "f3"], ["e7", "e5"], ["g2", "g4"], ["d8", "h4"]].map(([from, to]) => ({ from: from!, to: to! }));
    assert.equal(co.replayMoves(foolsMate)!.isCheckmate(), true);
    assert.equal(co.readSavedGame({ level: 1, mine: "w", moves: foolsMate }), null);
    assert.ok(co.readSavedGame({ level: 1, mine: "w", moves: foolsMate.slice(0, 3) }));
  });

  test("an absurdly long list is refused before anything is replayed", () => {
    const many = Array.from({ length: co.MAX_SAVED_MOVES + 1 }, () => ({ from: "e2", to: "e4" }));
    assert.equal(co.readSavedGame({ level: 1, mine: "w", moves: many }), null);
    assert.equal(co.replayMoves(many), null);
    // a long real game below the limit is fine
    const long = play(200, 7);
    assert.ok(long.history().length > 60);
    assert.ok(co.readSavedGame(saved(long)));
  });

  test("a game where the computer is to move can be saved and resumed (the app closed while it thought)", () => {
    const afterMine = play(1); // White has moved, Black (the computer) is to move
    const back = co.readSavedGame(saved(afterMine, { mine: "w" }))!;
    assert.equal(co.replayMoves(back.moves)!.turn(), "b");
    const reply = co.chooseReply(co.replayMoves(back.moves)!, 1);
    assert.ok(reply);
  });
});

// ================================================================ hints
describe("hints that point at a piece", () => {
  test("in check: the king is marked, and the three ways out are named", () => {
    const chess = new Chess("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1");
    assert.equal(chess.inCheck(), true);
    const h = co.pieceHint(chess, "w", 1);
    assert.equal(h.square, "e1");
    assert.match(h.text, /in check/);
    assert.match(h.text, /move it, block the attack, or capture/);
  });

  test("a piece that could be captured for nothing is marked", () => {
    const chess = new Chess("4k3/8/8/4p3/3Q4/8/8/4K3 w - - 0 1");
    const h = co.pieceHint(chess, "w", 1);
    assert.equal(h.square, "d4");
    assert.match(h.text, /queen on d4 could be captured/);
  });

  test("the most valuable piece in danger is the one marked", () => {
    // the pawn on b4 is attacked by the bishop and the queen on d4 by a pawn, and both are undefended: the queen matters more
    const chess = new Chess("4k3/4b3/8/4p3/1P1Q4/8/8/4K3 w - - 0 1");
    assert.equal(chess.attackers("b4", "b").length, 1);
    assert.equal(chess.attackers("d4", "b").length, 1);
    assert.equal(co.pieceHint(chess, "w", 1).square, "d4");
  });

  test("a protected piece attacked by a piece worth the same or more is a fair trade, not a danger", () => {
    // the knight on b5 attacks d4 and c3, and both pawns are defended by a pawn
    const chess = new Chess("4k3/8/8/1n6/3P4/2P5/1P6/4K3 w - - 0 1");
    const h = co.pieceHint(chess, "w", 1);
    assert.equal(h.square, null);
    assert.match(h.text, /None of your pieces looks in danger/);
  });

  test("a protected piece attacked by a cheaper piece is still in danger", () => {
    // the queen on d4 is defended by the king on e3... and attacked by a pawn on e5: losing a queen for a pawn
    const chess = new Chess("4k3/8/8/4p3/3Q4/4K3/8/8 w - - 0 1");
    assert.equal(chess.attackers("d4", "w").length > 0, true, "defended");
    assert.equal(co.pieceHint(chess, "w", 1).square, "d4");
  });

  test("when in check, the king comes first even if another piece is also in danger", () => {
    const chess = new Chess("4k3/8/8/4p3/3Q4/8/8/r3K3 w - - 0 1");
    assert.equal(chess.inCheck(), true);
    assert.equal(co.pieceHint(chess, "w", 1).square, "e1");
  });

  test("stage 2 points at the piece the engine would move, and never says where it goes", () => {
    const chess = new Chess();
    const h = co.pieceHint(chess, "w", 2, { engine: () => ({ from: "g1", to: "f3" }) });
    assert.equal(h.stage, 2);
    assert.equal(h.square, "g1");
    assert.match(h.text, /knight on g1/);
    assert.deepEqual(h.text.match(SQUARE_NAMES), ["g1"], "only the piece's own square is named");
  });

  test("stage 2 with no engine idea does not point at a random piece", () => {
    const chess = new Chess();
    for (const engine of [() => { throw new Error("broken"); }, () => null, () => ({ from: "a1", to: "a8" }), () => "nonsense"]) {
      const h = co.pieceHint(chess, "w", 2, { engine });
      assert.equal(h.square, null);
      assert.equal(h.text.match(SQUARE_NAMES), null);
    }
  });

  test("hints are for the child's own move only, and never in a finished game", () => {
    const chess = new Chess();
    assert.equal(co.pieceHint(chess, "b", 1).square, null, "it is White's turn");
    assert.equal(co.pieceHint(chess, "b", 2).square, null);
    const mate = new Chess("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
    assert.equal(mate.isCheckmate(), true);
    assert.equal(co.pieceHint(mate, "w", 1).square, null);
  });

  test("asking for a hint never changes the game", () => {
    const chess = play(20, 3);
    const before = chess.fen();
    const hist = chess.history().join(",");
    co.pieceHint(chess, chess.turn(), 1);
    co.pieceHint(chess, chess.turn(), 2, { level: 1 });
    assert.equal(chess.fen(), before);
    assert.equal(chess.history().join(","), hist);
  });

  test("in any position: it does not throw, a marked square holds a piece of the side to move, and at most that one square is named", () => {
    let marked = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const chess = play(4 + (seed % 5) * 6, seed);
      if (chess.isGameOver()) continue;
      const side = chess.turn();
      for (const stage of [1, 2] as const) {
        const h = co.pieceHint(chess, side, stage, { level: 1 });
        assert.ok(h.text.length > 5);
        const named = h.text.match(SQUARE_NAMES) ?? [];
        if (h.square) {
          marked++;
          assert.equal(chess.get(h.square as never)?.color, side, `seed ${seed} stage ${stage}`);
          assert.deepEqual(named, [h.square], "only the marked square is named");
          if (stage === 2) assert.ok(chess.moves({ square: h.square as never }).length > 0, "the piece can move");
        } else assert.deepEqual(named, []);
      }
    }
    assert.ok(marked >= 15, `only ${marked} hints pointed at a piece`);
  });
});
