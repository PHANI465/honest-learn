import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
process.env.TUTOR_MODE = "mock";
process.env.SHOW_DRAFTS = "true";

const { config } = await import("../src/config.ts");
const { openDb } = await import("../src/db.ts");
const usePg = process.env.TEST_DB === "pglite";
const { openPglite } = usePg ? await import("./pglite.ts") : { openPglite: null };
const { MemoryMailer } = await import("../src/mailer.ts");
const { loadContent } = await import("../src/content.ts");
const { createApp, CONSENT_VERSION } = await import("../src/app.ts");
const { MockTutor } = await import("../src/tutor.ts");
const sk = await import("../src/games/sudoku.ts");

const content = loadContent(config.contentDir);
const year = new Date().getFullYear();
const SPECS = [sk.SPEC_4, sk.SPEC_6, sk.SPEC_9];

/** Every row, column and box holds each number exactly once. */
function isValidGrid(grid: number[], spec: import("../src/games/sudoku.ts").Spec): boolean {
  const geo = sk.geometry(spec);
  return geo.units.every((u) => new Set(u.map((i) => grid[i])).size === spec.size && u.every((i) => grid[i]! >= 1 && grid[i]! <= spec.size));
}

describe("sudoku generator and solver", () => {
  test("every puzzle has exactly one solution, and the clues belong to it", () => {
    for (const spec of SPECS) {
      for (const level of sk.LEVELS) {
        for (let k = 0; k < 4; k++) {
          const p = sk.generate(spec, level, `test:${spec.size}:${level}:${k}`);
          assert.ok(isValidGrid(p.solution, spec), "the solution is a valid grid");
          assert.ok(p.givens.every((g, i) => g === 0 || g === p.solution[i]), "clues match the solution");
          const r = sk.countSolutions(p.givens, spec, 3);
          assert.equal(r.count, 1, `${spec.size}x${spec.size} level ${level} puzzle ${k} must have one solution`);
          assert.deepEqual(r.first, p.solution);
        }
      }
    }
  });

  test("harder levels leave fewer clues", () => {
    for (const spec of SPECS) {
      const counts = sk.LEVELS.map((l) => sk.generate(spec, l, `clues:${spec.size}`).givens.filter(Boolean).length);
      assert.ok(counts[0]! > counts[1]! && counts[1]! > counts[2]!, `clue counts ${counts} should fall with the level`);
      sk.LEVELS.forEach((l, i) => assert.ok(counts[i]! >= sk.CLUES[spec.size]![i]!, "never fewer clues than the target"));
    }
  });

  test("a fixed seed always gives the same puzzle; other seeds give other puzzles", () => {
    const a = sk.generate(sk.SPEC_9, 2, "fixed-seed");
    const b = sk.generate(sk.SPEC_9, 2, "fixed-seed");
    const c = sk.generate(sk.SPEC_9, 2, "another-seed");
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.givens, c.givens);
    // the full grid depends on the seed only; the level only decides how many squares are hidden
    assert.deepEqual(a.solution.slice(0, 9), sk.generate(sk.SPEC_9, 3, "fixed-seed").solution.slice(0, 9), "the solution depends on the seed only, not the level");
  });

  test("the solver tells a unique puzzle from one with several solutions", () => {
    assert.equal(sk.countSolutions(new Array(16).fill(0), sk.SPEC_4, 2).count, 2);
    // keep removing clues from a unique puzzle: the solver must notice the moment the solution stops being unique
    const p = sk.generate(sk.SPEC_9, 3, "dup");
    const open = [...p.givens];
    let steps = 0;
    for (const i of open.map((v, k) => (v ? k : -1)).filter((k) => k >= 0)) {
      open[i] = 0;
      steps++;
      if (sk.countSolutions(open, sk.SPEC_9, 2).count === 2) break;
    }
    assert.equal(sk.countSolutions(open, sk.SPEC_9, 2).count, 2, "removing enough clues must give more than one solution");
    assert.ok(steps < p.givens.filter(Boolean).length, "and it happens before every clue is gone");
    // a board with a clash has no solution
    const clash = [...p.givens];
    const e = clash.findIndex((v) => v === 0);
    const peer = sk.geometry(sk.SPEC_9).peers[e]!.find((j) => clash[j])!;
    clash[e] = clash[peer]!;
    assert.equal(sk.countSolutions(clash, sk.SPEC_9, 2).count, 0);
  });

  test("the hint finder only ever suggests the correct number, and solving by hints finishes the puzzle", () => {
    for (const spec of SPECS) {
      for (const level of sk.LEVELS) {
        const p = sk.generate(spec, level, `steps:${spec.size}:${level}`);
        const board = [...p.givens];
        let guard = 0;
        while (board.includes(0) && guard++ < 100) {
          const step = sk.nextStep(board, spec, p.solution)!;
          assert.ok(step, "a step exists while squares are empty");
          assert.equal(step.value, p.solution[step.cell], `${step.kind} step must be right`);
          assert.equal(board[step.cell], 0);
          if (step.kind === "naked") assert.equal(sk.candidateMask(board, spec, step.cell).toString(2).replace(/0/g, "").length, 1, "naked single has one candidate");
          board[step.cell] = step.value;
        }
        assert.deepEqual(board, p.solution);
      }
    }
  });

  test("most steps on easy puzzles are real techniques (naked or hidden singles)", () => {
    const p = sk.generate(sk.SPEC_9, 1, "easy-singles");
    const board = [...p.givens];
    let singles = 0;
    let other = 0;
    while (board.includes(0)) {
      const step = sk.nextStep(board, sk.SPEC_9, p.solution)!;
      if (step.kind === "other") other++;
      else singles++;
      board[step.cell] = step.value;
    }
    assert.ok(singles > other, `${singles} single steps vs ${other} other`);
  });

  test("hint texts: the first never has a number in it, the third names the square and the number", () => {
    const spec = sk.SPEC_9;
    const naked = sk.hintTexts(spec, { kind: "naked", cell: 14, value: 7 });
    const hidden = sk.hintTexts(spec, { kind: "hidden", cell: 40, value: 3, unit: { type: "box", index: 4 } });
    const other = sk.hintTexts(spec, { kind: "other", cell: 0, value: 9 });
    for (const t of [naked, hidden, other]) {
      assert.equal(t.length, 3);
      assert.ok(!/\d/.test(t[0]), "the first hint has no digits");
    }
    assert.match(naked[2], /Row 2, column 6 must be 7/);
    assert.match(hidden[1], /the middle-middle box/);
    assert.match(hidden[2], /3 can only go in row 5, column 5/);
    assert.equal(sk.describeUnit(sk.SPEC_6, { type: "box", index: 0 }), "the top-left box");
    assert.equal(sk.describeUnit(sk.SPEC_6, { type: "box", index: 5 }), "the bottom-right box");
    assert.equal(sk.describeUnit(sk.SPEC_4, { type: "column", index: 2 }), "column 3");
  });
});

// ---------------------------------------------------------------- routes
async function setup(age = 9) {
  const db = openPglite ? openPglite() : openDb(":memory:");
  const app = createApp({ db, content, tutor: new MockTutor(), mailer: new MemoryMailer() });
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  const s = await call("POST", "/auth/signup", { email: `g${Math.random()}@example.com`, password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION });
  const fam = s.json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  const kid = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: year - age }, par)).json.child.id as string;
  return { call, fam, par, kid, db };
}
/** The puzzle the server made for this child, rebuilt from the same seed. */
const serverPuzzle = (kid: string, spec: import("../src/games/sudoku.ts").Spec, level: 1 | 2 | 3, n: number) => sk.generate(spec, level, `${kid}:${spec.size}:${level}:${n}`);

describe("sudoku routes", () => {
  test("grid size follows the age group", async () => {
    for (const [age, size] of [[4, 4], [7, 4], [9, 6], [13, 9], [17, 9]] as const) {
      const { call, fam, kid } = await setup(age);
      const r = await call("GET", `/children/${kid}/games/sudoku`, undefined, fam);
      assert.equal(r.json.size, size, `age ${age}`);
      assert.equal(r.json.levels.length, 3);
    }
  });

  test("a puzzle comes as clues only, the same each time", async () => {
    const { call, fam, kid } = await setup(9);
    const a = await call("GET", `/children/${kid}/games/sudoku/1?level=2`, undefined, fam);
    const b = await call("GET", `/children/${kid}/games/sudoku/1?level=2`, undefined, fam);
    assert.deepEqual(a.json, b.json);
    assert.deepEqual(Object.keys(a.json).sort(), ["boxCols", "boxRows", "givens", "level", "n", "size", "solved"]);
    assert.equal(a.json.givens.length, 36);
    assert.deepEqual(a.json.givens, serverPuzzle(kid, sk.SPEC_6, 2, 1).givens);
    assert.equal(JSON.stringify(a.json).includes("solution"), false);
    const other = await call("GET", `/children/${kid}/games/sudoku/2?level=2`, undefined, fam);
    assert.notDeepEqual(other.json.givens, a.json.givens);
  });

  test("check names the wrong squares but never sends the solution; clues cannot be changed", async () => {
    const { call, fam, kid } = await setup(9);
    const p = serverPuzzle(kid, sk.SPEC_6, 1, 1);
    const cells = p.givens.map((g, i) => (g ? g : p.solution[i]!));
    const empty = p.givens.findIndex((g) => g === 0);
    // all right except one empty square left blank and one filled wrong
    const blank = [...cells];
    blank[empty] = 0;
    const other = p.givens.findIndex((g, i) => g === 0 && i !== empty);
    const wrongValue = (p.solution[other]! % 6) + 1;
    blank[other] = wrongValue;
    const r = await call("POST", `/children/${kid}/games/sudoku/1/check?level=1`, { cells: blank }, fam);
    assert.deepEqual(r.json.wrong, [other]);
    assert.equal(r.json.solved, false);
    assert.deepEqual(Object.keys(r.json).sort(), ["filled", "solved", "wrong"]);
    // tampering with a clue changes nothing
    const tampered = [...cells];
    const clue = p.givens.findIndex((g) => g !== 0);
    tampered[clue] = (p.givens[clue]! % 6) + 1;
    const t = await call("POST", `/children/${kid}/games/sudoku/1/check?level=1`, { cells: tampered }, fam);
    assert.equal(t.json.solved, true);
    assert.deepEqual(t.json.wrong, []);
  });

  test("a solved puzzle is recorded once and moves the 'next' puzzle on", async () => {
    const { call, fam, kid, db } = await setup(9);
    const p = serverPuzzle(kid, sk.SPEC_6, 1, 1);
    const full = await call("POST", `/children/${kid}/games/sudoku/1/check?level=1`, { cells: p.solution }, fam);
    assert.equal(full.json.solved, true);
    await call("POST", `/children/${kid}/games/sudoku/1/check?level=1`, { cells: p.solution }, fam);
    assert.equal((await db.all("SELECT * FROM games_solved WHERE child_id = ?", [kid])).length, 1);
    const o = await call("GET", `/children/${kid}/games/sudoku`, undefined, fam);
    assert.deepEqual(o.json.levels[0], { level: 1, solved: 1, next: 2, clues: 22 });
    assert.equal(o.json.levels[1].solved, 0);
    assert.equal((await call("GET", `/children/${kid}/games/sudoku/1?level=1`, undefined, fam)).json.solved, true);
  });

  test("hint ladder: in order, three steps, then a new chain; the number is only in the last", async () => {
    const { call, fam, kid } = await setup(13); // 9x9
    const p = serverPuzzle(kid, sk.SPEC_9, 1, 1);
    const hint = (level: number, cells = p.givens) => call("POST", `/children/${kid}/games/sudoku/1/hint?level=1`, { cells, level }, fam);
    assert.equal((await hint(1)).status, 400, "cannot skip to the second hint");
    assert.equal((await hint(2)).status, 400, "cannot skip to the third hint");
    const h0 = await hint(0);
    assert.equal(h0.status, 200);
    assert.equal(h0.json.chain, 0);
    assert.ok(!/\d/.test(h0.json.hint), "the first hint names no number");
    assert.equal((await hint(2)).status, 400, "still cannot skip the second");
    const h1 = await hint(1);
    assert.equal(h1.status, 200);
    const h2 = await hint(2);
    assert.equal(h2.json.isLast, true);
    const step = sk.nextStep(p.givens, sk.SPEC_9, p.solution)!;
    assert.match(h2.json.hint, new RegExp(`${step.value}`));
    assert.match(h2.json.hint, new RegExp(`row ${Math.floor(step.cell / 9) + 1}, column ${(step.cell % 9) + 1}`, "i"));
    // after the third hint a new chain starts at the first again
    const again = await hint(0);
    assert.equal(again.json.chain, 1);
    assert.equal((await hint(2)).status, 400);
  });

  test("with a wrong number on the board the hints say to fix it first and do not give a number", async () => {
    const { call, fam, kid } = await setup(13);
    const p = serverPuzzle(kid, sk.SPEC_9, 1, 1);
    const cells = [...p.givens];
    const at = cells.findIndex((v) => v === 0);
    cells[at] = (p.solution[at]! % 9) + 1;
    const post = (level: number) => call("POST", `/children/${kid}/games/sudoku/1/hint?level=1`, { cells, level }, fam);
    const h0 = await post(0);
    assert.match(h0.json.hint, /not right/);
    await post(1);
    const h2 = await post(2);
    assert.match(h2.json.hint, /Clear it/);
    assert.ok(!new RegExp(`must be ${p.solution[at]}`).test(h2.json.hint));
  });

  test("bad input is refused", async () => {
    const { call, fam, kid } = await setup(9);
    assert.equal((await call("GET", `/children/${kid}/games/sudoku/0?level=1`, undefined, fam)).status, 400);
    assert.equal((await call("GET", `/children/${kid}/games/sudoku/1?level=4`, undefined, fam)).status, 400);
    assert.equal((await call("GET", `/children/${kid}/games/sudoku/abc`, undefined, fam)).status, 400);
    assert.equal((await call("POST", `/children/${kid}/games/sudoku/1/check?level=1`, { cells: [1, 2, 3] }, fam)).status, 400);
    assert.equal((await call("POST", `/children/${kid}/games/sudoku/1/check?level=1`, { cells: new Array(36).fill(9) }, fam)).status, 400);
    assert.equal((await call("POST", `/children/${kid}/games/sudoku/1/hint?level=1`, { cells: new Array(36).fill(0), level: 5 }, fam)).status, 400);
  });

  test("needs sign-in; another family's child is out of reach", async () => {
    const a = await setup(9);
    const b = await setup(9);
    assert.equal((await a.call("GET", `/children/${a.kid}/games/sudoku`)).status, 401);
    assert.equal((await b.call("GET", `/children/${a.kid}/games/sudoku/1?level=1`, undefined, b.fam)).status, 404);
    assert.equal((await b.call("POST", `/children/${a.kid}/games/sudoku/1/check?level=1`, { cells: new Array(36).fill(0) }, b.fam)).status, 404);
  });

  test("finished puzzles are in the export and go when the child is deleted", async () => {
    const { call, fam, par, kid, db } = await setup(9);
    const p = serverPuzzle(kid, sk.SPEC_6, 1, 1);
    await call("POST", `/children/${kid}/games/sudoku/1/check?level=1`, { cells: p.solution }, fam);
    const exp = await call("GET", "/parent/export", undefined, par);
    assert.equal(exp.json.gamesSolved.length, 1);
    assert.equal(exp.json.gamesSolved[0].puzzle_key, "sudoku-6-1-1");
    await call("DELETE", `/parent/children/${kid}`, undefined, par);
    assert.equal((await db.all("SELECT * FROM games_solved")).length, 0);
  });
});
