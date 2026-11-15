// The memory and logic games run on the device with no server. Their rules live in app/src/lib/games/*.ts as plain functions,
// and are tested here because the app has no test runner of its own.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { seeded } from "../src/shuffle.ts";
import * as pairs from "../../app/src/lib/games/pairs.ts";
import * as seq from "../../app/src/lib/games/sequence.ts";
import * as changed from "../../app/src/lib/games/changed.ts";
import * as slide from "../../app/src/lib/games/slide.ts";
import * as nono from "../../app/src/lib/games/nonogram.ts";

const BANDS = ["b1", "b2", "b3", "b4", "b5"] as const;

describe("pairs", () => {
  test("a deck has each picture exactly twice, and its size follows the age group", () => {
    for (const band of BANDS) {
      const deck = pairs.makeDeck(pairs.PAIR_COUNT[band], seeded("deck:" + band));
      assert.equal(deck.length, pairs.PAIR_COUNT[band] * 2);
      const counts = new Map<string, number>();
      for (const c of deck) counts.set(c.symbol, (counts.get(c.symbol) ?? 0) + 1);
      assert.ok([...counts.values()].every((n) => n === 2), `${band}: every picture twice`);
      assert.deepEqual(deck.map((c) => c.index), deck.map((_, i) => i));
      assert.equal(deck.length % pairs.PAIR_COLUMNS[band], 0, `${band}: the cards fill whole rows`);
    }
  });
  test("a seed gives the same deck; other seeds give other orders; there are enough different pictures", () => {
    assert.deepEqual(pairs.makeDeck(8, seeded("a")), pairs.makeDeck(8, seeded("a")));
    assert.notDeepEqual(pairs.makeDeck(8, seeded("a")), pairs.makeDeck(8, seeded("b")));
    assert.equal(new Set(pairs.PAIR_SYMBOLS).size, pairs.PAIR_SYMBOLS.length);
    assert.ok(pairs.PAIR_SYMBOLS.length >= pairs.PAIR_COUNT.b5);
    assert.throws(() => pairs.makeDeck(0));
    assert.throws(() => pairs.makeDeck(99));
  });
  test("two different cards with the same picture match; a card never matches itself", () => {
    const deck = pairs.makeDeck(3, seeded("m"));
    const first = deck[0]!;
    const mate = deck.find((c) => c.index !== first.index && c.symbol === first.symbol)!;
    const other = deck.find((c) => c.symbol !== first.symbol)!;
    assert.equal(pairs.isMatch(first, mate), true);
    assert.equal(pairs.isMatch(first, other), false);
    assert.equal(pairs.isMatch(first, first), false);
  });
});

describe("sequence recall", () => {
  test("patterns use only the buttons that exist and grow by one", () => {
    for (const band of BANDS) {
      const n = seq.SEQ_BUTTON_COUNT[band];
      assert.ok(n <= seq.SEQ_BUTTONS.length);
      let s = seq.newSequence(seq.SEQ_START_LENGTH[band], n, seeded("s:" + band));
      assert.equal(s.length, seq.SEQ_START_LENGTH[band]);
      for (let i = 0; i < 20; i++) {
        const next = seq.extend(s, n, seeded("e:" + band + i));
        assert.equal(next.length, s.length + 1);
        assert.deepEqual(next.slice(0, s.length), s);
        s = next;
      }
      assert.ok(s.every((b) => b >= 0 && b < n));
    }
  });
  test("every button can be told apart by picture, name and colour", () => {
    assert.equal(new Set(seq.SEQ_BUTTONS.map((b) => b.symbol)).size, seq.SEQ_BUTTONS.length);
    assert.equal(new Set(seq.SEQ_BUTTONS.map((b) => b.name)).size, seq.SEQ_BUTTONS.length);
    assert.equal(new Set(seq.SEQ_BUTTONS.map((b) => b.color)).size, seq.SEQ_BUTTONS.length);
  });
  test("tapping the pattern in order finishes it; a wrong tap is just 'wrong'", () => {
    const s = [2, 0, 1];
    assert.deepEqual(seq.tap(s, 0, 2), { kind: "right", progress: 1 });
    assert.deepEqual(seq.tap(s, 1, 0), { kind: "right", progress: 2 });
    assert.deepEqual(seq.tap(s, 2, 1), { kind: "done" });
    assert.deepEqual(seq.tap(s, 1, 3), { kind: "wrong" });
    assert.deepEqual(seq.tap(s, 0, 0), { kind: "wrong" });
  });
});

describe("which one changed", () => {
  test("the two pictures differ in exactly one place, and the new picture was not in the first", () => {
    for (const band of BANDS) {
      const { cols, rows } = changed.CHANGE_GRID[band];
      for (let k = 0; k < 25; k++) {
        const r = changed.makeRound(cols * rows, seeded(`c:${band}:${k}`));
        assert.equal(r.a.length, cols * rows);
        assert.equal(new Set(r.a).size, r.a.length, "all pictures in the first scene are different");
        const diffs = r.a.map((v, i) => (v === r.b[i] ? -1 : i)).filter((i) => i >= 0);
        assert.deepEqual(diffs, [r.changed]);
        assert.ok(!r.a.includes(r.b[r.changed]!));
      }
    }
  });
  test("the change is in different places over many rounds", () => {
    const places = new Set(Array.from({ length: 60 }, (_, k) => changed.makeRound(12, seeded("p" + k)).changed));
    assert.ok(places.size >= 6);
  });
  test("grids are large enough for the pictures available", () => {
    for (const band of BANDS) {
      const g = changed.CHANGE_GRID[band];
      assert.ok(g.cols * g.rows < changed.CHANGE_SYMBOLS.length);
    }
  });
});

describe("sliding tiles", () => {
  test("shuffled boards are solvable, not already solved, and hold every tile once", () => {
    for (const n of [3, 4]) {
      for (let k = 0; k < 30; k++) {
        const b = slide.shuffleBoard(n, 40 + k, seeded(`sl:${n}:${k}`));
        assert.equal(b.length, n * n);
        assert.deepEqual([...b].sort((x, y) => x - y), [...Array(n * n).keys()]);
        assert.ok(slide.isSolvable(b, n), "solvable");
        assert.equal(slide.isSolved(b, n), false);
      }
    }
  });
  test("the parity rule recognises an unsolvable board (two tiles swapped)", () => {
    for (const n of [3, 4]) {
      const b = slide.solvedBoard(n);
      [b[0], b[1]] = [b[1]!, b[0]!];
      assert.equal(slide.isSolvable(b, n), false);
      assert.equal(slide.isSolvable(slide.solvedBoard(n), n), true);
    }
  });
  test("only a tile next to the gap can slide, and sliding back restores the board", () => {
    const n = 3;
    const solved = slide.solvedBoard(n); // gap at the bottom right (index 8)
    assert.equal(slide.slideTile(solved, n, 0), null, "a tile far from the gap cannot move");
    assert.equal(slide.slideTile(solved, n, 4), null, "a diagonal neighbour cannot move");
    const moved = slide.slideTile(solved, n, 7)!;
    assert.equal(moved[8], 8);
    assert.equal(moved[7], 0);
    assert.deepEqual(slide.slideTile(moved, n, 8), solved);
    assert.equal(slide.isSolved(solved, n), true);
  });
  test("solving a shuffled board by undoing the shuffle is possible (a breadth-first search finds a solution for 3x3)", () => {
    const n = 3;
    const start = slide.shuffleBoard(n, 12, seeded("bfs"));
    const goal = slide.solvedBoard(n).join();
    const seen = new Set([start.join()]);
    let frontier = [start];
    let steps = 0;
    while (frontier.length && !seen.has(goal) && steps < 40) {
      const next: number[][] = [];
      for (const b of frontier) {
        for (const i of slide.neighbours(b.indexOf(0), n)) {
          const nb = slide.slideTile(b, n, i)!;
          if (!seen.has(nb.join())) {
            seen.add(nb.join());
            next.push(nb);
          }
        }
      }
      frontier = next;
      steps++;
    }
    assert.ok(seen.has(goal), "the solved board is reachable");
    assert.ok(steps <= 12, "within the number of shuffle moves");
  });
});

describe("nonograms", () => {
  test("clues are the run lengths", () => {
    assert.deepEqual(nono.cluesOf([1, 1, 0, 1, 1, 1]), [2, 3]);
    assert.deepEqual(nono.cluesOf([0, 0, 0]), []);
    assert.deepEqual(nono.cluesOf([1, 0, 1]), [1, 1]);
    assert.deepEqual(nono.cluesOf([1, 1, 1]), [3]);
  });
  test("the solver agrees with brute force on every 4x4 grid it is asked about", () => {
    const n = 4;
    const byClues = new Map<string, number>();
    const grids: number[][] = [];
    for (let mask = 0; mask < 1 << (n * n); mask++) {
      const g = Array.from({ length: n * n }, (_, i) => (mask >> i) & 1);
      const { rows, cols } = nono.cluesFor(g, n);
      const key = JSON.stringify([rows, cols]);
      byClues.set(key, (byClues.get(key) ?? 0) + 1);
      grids.push(g);
    }
    const rand = seeded("brute");
    for (let k = 0; k < 40; k++) {
      const g = grids[Math.floor(rand() * grids.length)]!;
      const { rows, cols } = nono.cluesFor(g, n);
      const expected = byClues.get(JSON.stringify([rows, cols]))!;
      assert.equal(nono.countSolutions(rows, cols, 99), expected, "solution count must match brute force");
      assert.equal(nono.countSolutions(rows, cols, 2), Math.min(expected, 2));
    }
  });
  test("generated puzzles have exactly one solution, the picture fits its clues, and no row or column is empty", () => {
    for (const n of [5, 7]) {
      for (let k = 0; k < 6; k++) {
        const p = nono.generate(n, seeded(`g:${n}:${k}`));
        assert.equal(p.size, n);
        assert.equal(nono.countSolutions(p.rows, p.cols, 3), 1, `${n}x${n} puzzle ${k}`);
        assert.ok(nono.isComplete(p.solution, n, p.rows, p.cols));
        assert.ok(p.rows.every((c) => c.length > 0) && p.cols.every((c) => c.length > 0));
      }
    }
  });
  test("feedback: a half-finished grid satisfies some lines, a wrong grid is not complete", () => {
    const p = nono.generate(5, seeded("fb"));
    const empty = new Array(25).fill(0);
    assert.equal(nono.isComplete(empty, 5, p.rows, p.cols), false);
    const wrong = [...p.solution];
    wrong[0] = wrong[0] ? 0 : 1;
    assert.equal(nono.isComplete(wrong, 5, p.rows, p.cols), false);
    const s = nono.satisfied(p.solution, 5, p.rows, p.cols);
    assert.ok(s.rows.every(Boolean) && s.cols.every(Boolean));
  });
  test("only ages 12 and up are offered nonograms", () => {
    assert.deepEqual(BANDS.map((b) => nono.NONO_SIZE[b]), [null, null, null, 5, 7]);
  });
});
