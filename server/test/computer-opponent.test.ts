// Playing chess against the computer (T5d): the engine only suggests, chess.js judges. See server/src/games/computer-opponent.ts.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { chooseReply, describeMove, gameOutcome, levelsForBand, LEVELS, outcomeMessage, takeBack, type EngineFn } from "../src/games/computer-opponent.ts";

/** A small seeded random generator, so the fallback is repeatable. */
const seeded = (seed: number) => {
  let a = (seed * 2654435761) >>> 0; // spreads small seeds apart
  return () => {
    a = (a + 0x6d2b79f5) | 0; // mulberry32
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe("levels", () => {
  test("four levels, the easiest first; the oldest groups get the hardest", () => {
    assert.deepEqual(LEVELS.map((l) => l.id), [1, 2, 3, 4]);
    assert.deepEqual(levelsForBand("b2").map((l) => l.id), [1, 2, 3]);
    assert.deepEqual(levelsForBand("b3").map((l) => l.id), [1, 2, 3]);
    assert.deepEqual(levelsForBand("b4").map((l) => l.id), [1, 2, 3, 4]);
    assert.deepEqual(levelsForBand("b5").map((l) => l.id), [1, 2, 3, 4]);
    assert.equal(levelsForBand("b2")[0]!.name, "Beginner");
  });
});

describe("the computer's reply is always a legal move", () => {
  for (const level of [1, 2, 3, 4]) {
    test(`level ${level}: two whole games against itself, every move from the engine and legal`, () => {
      for (let game = 0; game < 2; game++) {
        const chess = new Chess();
        let plies = 0;
        while (!gameOutcome(chess).over && plies < 160) {
          const reply = chooseReply(chess, level);
          assert.ok(reply, "a reply while the game is not over");
          assert.equal(reply.source, "engine", `level ${level} ply ${plies}: the engine's own move was used, not the fallback (${chess.fen()})`);
          chess.move({ from: reply.from, to: reply.to, promotion: reply.promotion }); // throws if illegal
          plies++;
        }
        assert.ok(plies > 20, "a real game was played");
      }
    });
  }

  test("a game over has no reply (checkmate, stalemate)", () => {
    assert.equal(chooseReply(new Chess("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"), 2), null, "fool's mate");
    assert.equal(chooseReply(new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), 2), null, "stalemate");
  });
});

describe("what the computer finds", () => {
  test("it takes a free queen and gives a one-move checkmate (levels 2 to 4)", () => {
    for (const level of [2, 3, 4]) {
      for (let i = 0; i < 4; i++) {
        const queen = chooseReply(new Chess("4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1"), level)!;
        assert.deepEqual([queen.from, queen.to], ["e4", "d5"], `level ${level} takes the queen`);
        const mate = chooseReply(new Chess("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"), level)!;
        assert.deepEqual([mate.from, mate.to], ["a1", "a8"], `level ${level} plays Ra8#`);
      }
    }
  });

  test("it promotes to a queen, for White and for Black", () => {
    const white = chooseReply(new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1"), 2)!;
    assert.deepEqual([white.from, white.to, white.promotion], ["a7", "a8", "q"]);
    const black = chooseReply(new Chess("k7/8/8/8/8/8/p6K/8 b - - 0 1"), 2)!;
    assert.deepEqual([black.from, black.to, black.promotion], ["a2", "a1", "q"]);
    const chess = new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    assert.equal(chess.move({ from: white.from, to: white.to, promotion: white.promotion }).promotion, "q");
  });

  test("castling and en passant come out as legal moves too", () => {
    const castle = new Chess("r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 6 8");
    const moves = new Set(castle.moves({ verbose: true }).map((m) => `${m.from}${m.to}`));
    assert.ok(moves.has("e1g1") && moves.has("e1c1"), "castling is available in this position");
    for (let i = 0; i < 6; i++) {
      const r = chooseReply(castle, 3)!;
      assert.ok(moves.has(`${r.from}${r.to}`));
    }
    const ep = new Chess("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2");
    for (let i = 0; i < 4; i++) {
      const r = chooseReply(ep, 3)!;
      assert.doesNotThrow(() => ep.move({ from: r.from, to: r.to, promotion: r.promotion }) && ep.undo());
    }
  });
});

describe("an engine that fails never breaks the game", () => {
  const start = () => new Chess();
  const cases: [string, EngineFn][] = [
    ["suggests an illegal move", () => ({ from: "e2", to: "e5" })],
    ["suggests a move for the other side", () => ({ from: "e7", to: "e5" })],
    ["suggests a square that is not on the board", () => ({ from: "z9", to: "q0" })],
    ["throws", () => { throw new Error("search failed"); }],
    ["returns nothing", () => null],
    ["returns rubbish", () => "e2e4"],
    ["returns numbers", () => ({ from: 12, to: 28 })],
  ];
  for (const [name, engine] of cases) {
    test(`${name}: a random legal move is played instead, and it says so`, () => {
      const r = chooseReply(start(), 3, { engine, random: seeded(7) })!;
      assert.equal(r.source, "fallback");
      assert.doesNotThrow(() => start().move({ from: r.from, to: r.to, promotion: r.promotion }));
    });
  }

  test("the fallback is repeatable with a seeded generator and varies with it", () => {
    const pick = (seed: number) => chooseReply(start(), 3, { engine: () => null, random: seeded(seed) })!;
    assert.deepEqual(pick(1), pick(1));
    assert.ok(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => `${pick(s).from}${pick(s).to}`)).size > 1);
  });

  test("a promotion suggested by the engine is still a queen", () => {
    const r = chooseReply(new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1"), 2, { engine: () => ({ from: "a7", to: "a8" }) })!;
    assert.equal(r.promotion, "q");
    assert.equal(r.source, "engine");
  });
});

describe("how a game ends", () => {
  test("checkmate: the side that did not have to move wins", () => {
    const foolsMate = new Chess("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
    assert.deepEqual(gameOutcome(foolsMate), { over: true, kind: "checkmate", winner: "b" });
    assert.match(outcomeMessage(gameOutcome(foolsMate), "b").title, /You win/);
    assert.match(outcomeMessage(gameOutcome(foolsMate), "w").title, /computer wins/);
    assert.match(outcomeMessage(gameOutcome(foolsMate), "w").body, /try again/);
  });

  test("stalemate, bare kings, repetition and fifty moves are draws, each with its own reason", () => {
    assert.deepEqual(gameOutcome(new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")), { over: true, kind: "stalemate", winner: null, reason: "stalemate" });
    const bare = gameOutcome(new Chess("8/8/4k3/8/8/4K3/8/8 w - - 0 1"));
    assert.equal(bare.over && bare.winner, null);
    assert.equal(bare.over && "reason" in bare && bare.reason, "insufficient material");
    const repeat = new Chess();
    for (const san of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]) repeat.move(san);
    const rep = gameOutcome(repeat);
    assert.equal(rep.over && "reason" in rep && rep.reason, "threefold repetition");
    const fifty = gameOutcome(new Chess("8/8/4k3/8/8/8/R7/4K3 w - - 100 80"));
    assert.equal(fifty.over && "reason" in fifty && fifty.reason, "fifty moves");
    for (const o of [gameOutcome(new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")), bare, rep, fifty]) {
      const m = outcomeMessage(o, "w");
      assert.equal(m.title, "A draw");
      assert.ok(m.body.length > 10);
    }
  });

  test("a game in progress is not over", () => {
    assert.deepEqual(gameOutcome(new Chess()), { over: false });
    assert.deepEqual(outcomeMessage({ over: false }, "w"), { title: "", body: "" });
  });
});

describe("moves in words", () => {
  const say = (fen: string, san: string) => {
    const chess = new Chess(fen);
    return describeMove(chess.move(san));
  };
  test("plain moves, captures, castling, promotion, check and checkmate", () => {
    assert.equal(say("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "Nf3"), "Knight from g1 to f3");
    assert.equal(say("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", "exd5"), "Pawn from e4 to d5, capturing a pawn");
    assert.equal(say("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "O-O"), "Castles on the king's side");
    assert.equal(say("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "O-O-O"), "Castles on the queen's side");
    assert.equal(say("7k/P7/8/8/8/8/8/K7 w - - 0 1", "a8=Q+"), "Pawn from a7 to a8, and becomes a queen. Check");
    assert.equal(say("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", "Ra8#"), "Rook from a1 to a8. Checkmate");
  });
});

describe("taking a move back", () => {
  test("it removes the child's last move and the computer's reply, so it is the child's turn again", () => {
    const chess = new Chess();
    chess.move("e4"); chess.move("e5"); chess.move("Nf3"); chess.move("Nc6");
    assert.equal(takeBack(chess, "w"), true);
    assert.deepEqual(chess.history(), ["e4", "e5"]);
    assert.equal(chess.turn(), "w");
    assert.equal(takeBack(chess, "w"), true);
    assert.deepEqual(chess.history(), []);
    assert.equal(takeBack(chess, "w"), false, "nothing left to take back");
  });

  test("when the child's move ended the game there is no reply to remove", () => {
    const chess = new Chess("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1");
    chess.move("Ra8#");
    assert.equal(chess.isCheckmate(), true);
    assert.equal(takeBack(chess, "w"), true);
    assert.equal(chess.turn(), "w");
    assert.equal(chess.history().length, 0);
  });

  test("playing Black: the computer's first move stays, then take backs remove only the child's moves", () => {
    const chess = new Chess();
    chess.move("e4"); // the computer (White) moved first
    assert.equal(takeBack(chess, "b"), false, "Black has not moved yet, so there is nothing to take back");
    assert.deepEqual(chess.history(), ["e4"]);
    chess.move("e5"); chess.move("Nf3");
    assert.equal(takeBack(chess, "b"), true);
    assert.deepEqual(chess.history(), ["e4"]);
    assert.equal(chess.turn(), "b");
  });
});
