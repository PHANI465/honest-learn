import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";

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
const ch = await import("../src/games/chess.ts");

const content = loadContent(config.contentDir);
const allPuzzles = [...content.chess.values()].flatMap((set) => set.puzzles.map((p) => ({ level: set.level, p: p as import("../src/games/chess.ts").ChessPuzzle })));
const year = new Date().getFullYear();

describe("the chess verifier", () => {
  test("a sound mate in one passes", () => {
    const v = ch.verifyPuzzle({ id: "t", fen: "6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1", theme: "t", goal: "mate", solverMoves: 1, solution: ["Ra8#"], hints: ["a", "b", "c"], explain: "e" });
    assert.deepEqual(v, { ok: true, problems: [] });
  });
  test("it rejects a puzzle with two ways to mate, a line that does not mate, an illegal line and a bad FEN", () => {
    const base = { id: "t", theme: "t", goal: "mate" as const, solverMoves: 1, hints: ["a", "b", "c"] as [string, string, string], explain: "e" };
    // Qa8# and Qh1# style duplicates: a queen with many mates
    const two = ch.verifyPuzzle({ ...base, fen: "k7/2Q5/1K6/8/8/8/8/8 w - - 0 1", solution: ["Qa7#"] });
    assert.equal(two.ok, false);
    assert.match(two.problems.join(" "), /first moves/);
    assert.equal(ch.verifyPuzzle({ ...base, fen: "6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1", solution: ["Ra7"] }).ok, false);
    assert.equal(ch.verifyPuzzle({ ...base, fen: "6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1", solution: ["Qh5#"] }).ok, false);
    assert.equal(ch.verifyPuzzle({ ...base, fen: "not a fen", solution: ["Ra8#"] }).ok, false);
  });
  test("it rejects a mate in two that is really a mate in one", () => {
    const v = ch.verifyPuzzle({ id: "t", fen: "6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1", theme: "t", goal: "mate", solverMoves: 2, solution: ["Ra8#"], hints: ["a", "b", "c"], explain: "e" });
    assert.equal(v.ok, false);
  });
  test("a win puzzle must really win material, with a first move that stands out", () => {
    // a plain knight fork: the knight on e5 forks king and queen with Nf7? use a clean royal fork
    const good = ch.verifyPuzzle({ id: "t", fen: "8/8/8/8/7q/K7/7N/4k3 w - - 0 1", theme: "Knight fork", goal: "win", solverMoves: 1, solution: ["Nf3+"], hints: ["a", "b", "c"], explain: "e" });
    assert.deepEqual(good, { ok: true, problems: [] });
    const bad = ch.verifyPuzzle({ id: "t", fen: "8/8/8/8/7q/K7/7N/4k3 w - - 0 1", theme: "Knight fork", goal: "win", solverMoves: 1, solution: ["Kb3"], hints: ["a", "b", "c"], explain: "e" });
    assert.equal(bad.ok, false);
  });
});

describe("every chess puzzle shipped in content/chess", () => {
  test("there are puzzles for all three levels", () => {
    assert.deepEqual([...content.chess.keys()].sort(), ["1", "2", "3"]);
    for (const set of content.chess.values()) assert.ok(set.puzzles.length >= 6, `level ${set.level} has ${set.puzzles.length}`);
  });
  test("each one is proven sound: legal, the goal really happens, and the first move is the only one that works", () => {
    for (const { p } of allPuzzles) {
      const v = ch.verifyPuzzle(p);
      assert.deepEqual(v.problems, [], `${p.id} (${p.fen})`);
    }
  });
  test("ids are unique, every puzzle is a draft, hints do not contain the solution move, and the side to move is White", () => {
    const ids = allPuzzles.map((x) => x.p.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const set of content.chess.values()) assert.equal(set.status, "draft");
    for (const { p } of allPuzzles) {
      assert.equal(p.fen.split(" ")[1], "w", `${p.id}: White to move`);
      assert.ok(!p.hints[0].includes(p.solution[0]!) && !p.hints[1].includes(p.solution[0]!), `${p.id}: only the last hint may give the move`);
    }
  });
  test("levels get harder: level 3 puzzles are all mate in two, level 1 all mate in one", () => {
    for (const { level, p } of allPuzzles) {
      if (level === 1) assert.deepEqual([p.goal, p.solverMoves], ["mate", 1]);
      if (level === 3) assert.deepEqual([p.goal, p.solverMoves], ["mate", 2]);
      if (level === 2) assert.equal(p.goal, "win");
    }
  });
});

describe("checking one move at a time", () => {
  const mate1 = allPuzzles.find((x) => x.level === 1)!.p;
  const mate2 = allPuzzles.find((x) => x.level === 3)!.p;
  const move = (san: string, fen: string) => {
    const m = new Chess(fen).move(san);
    return { from: m.from, to: m.to, promotion: m.promotion };
  };
  test("the right mate in one finishes the puzzle", () => {
    const r = ch.playStep(mate1, 0, move(mate1.solution[0]!, mate1.fen));
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.done, true);
  });
  test("a legal wrong move is just 'wrong', an impossible move is 'illegal'", () => {
    const chess = new Chess(mate1.fen);
    const other = chess.moves({ verbose: true }).find((m) => m.san !== mate1.solution[0])!;
    assert.deepEqual(ch.playStep(mate1, 0, { from: other.from, to: other.to }), { ok: false, reason: "wrong" });
    assert.deepEqual(ch.playStep(mate1, 0, { from: "a1", to: "h8" }), { ok: false, reason: "illegal" });
    assert.deepEqual(ch.playStep(mate1, 1, { from: "a1", to: "a2" }), { ok: false, reason: "illegal" }, "odd steps are the opponent's");
    assert.deepEqual(ch.playStep(mate1, 4, { from: "a1", to: "a2" }), { ok: false, reason: "illegal" }, "past the end of the line");
  });
  test("in a mate in two the first move brings the opponent's reply, and the last step accepts any mating move", () => {
    const first = ch.playStep(mate2, 0, move(mate2.solution[0]!, mate2.fen));
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.done, false);
    assert.equal(first.reply!.san, mate2.solution[1]);
    // every mating move at the end is accepted
    const after = ch.positionAt(mate2, 2);
    const mates = after.moves({ verbose: true }).filter((m) => {
      after.move(m);
      const mate = after.isCheckmate();
      after.undo();
      return mate;
    });
    assert.ok(mates.length >= 1);
    for (const m of mates) {
      const r = ch.playStep(mate2, 2, { from: m.from, to: m.to, promotion: m.promotion });
      assert.equal(r.ok && r.done, true);
    }
    const notMate = after.moves({ verbose: true }).find((m) => !mates.some((x) => x.san === m.san))!;
    assert.deepEqual(ch.playStep(mate2, 2, { from: notMate.from, to: notMate.to }), { ok: false, reason: "wrong" });
  });
});

// ---------------------------------------------------------------- routes
async function setup(age = 13) {
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
  const s = await call("POST", "/auth/signup", { email: `c${Math.random()}@example.com`, password: "correct horse", pin: "2468", confirmAdult: true, consentVersion: CONSENT_VERSION });
  const fam = s.json.familyToken as string;
  const par = (await call("POST", "/auth/parent-unlock", { pin: "2468" }, fam)).json.parentToken as string;
  const kid = (await call("POST", "/parent/children", { nickname: "Sam", birthYear: year - age }, par)).json.child.id as string;
  return { call, fam, par, kid, db };
}
const mv = (san: string, fen: string, extra = {}) => {
  const m = new Chess(fen).move(san);
  return { from: m.from, to: m.to, ...extra };
};

describe("chess routes", () => {
  test("levels follow the age group: none at 3 to 5, level 1 at 6 to 8, 1 and 2 at 9 to 11, all three from 12", async () => {
    for (const [age, levels] of [[4, []], [7, [1]], [10, [1, 2]], [13, [1, 2, 3]], [17, [1, 2, 3]]] as const) {
      const { call, fam, kid } = await setup(age);
      const r = await call("GET", `/children/${kid}/games/chess`, undefined, fam);
      assert.deepEqual(r.json.levels.map((l: any) => l.level), levels, `age ${age}`);
      assert.equal(r.json.available, levels.length > 0);
    }
  });

  test("a puzzle comes as a position only, never the moves", async () => {
    const { call, fam, kid } = await setup(13);
    const p = allPuzzles.find((x) => x.level === 3)!.p;
    const r = await call("GET", `/children/${kid}/games/chess/${p.id}`, undefined, fam);
    assert.deepEqual(Object.keys(r.json).sort(), ["fen", "goal", "id", "solved", "solverMoves", "theme", "toMove"]);
    assert.equal(r.json.fen, p.fen);
    assert.equal(JSON.stringify(r.json).includes(p.solution[0]!), false);
    const list = await call("GET", `/children/${kid}/games/chess`, undefined, fam);
    const raw = JSON.stringify(list.json);
    assert.ok(!raw.includes("solution") && !raw.includes("hints") && !raw.includes("explain") && !raw.includes('"fen"'));
  });

  test("a puzzle from a level the child's age does not offer is not found", async () => {
    const { call, fam, kid } = await setup(7);
    const hard = allPuzzles.find((x) => x.level === 3)!.p;
    assert.equal((await call("GET", `/children/${kid}/games/chess/${hard.id}`, undefined, fam)).status, 404);
    assert.equal((await call("POST", `/children/${kid}/games/chess/${hard.id}/move`, { step: 0, from: "a1", to: "a2" }, fam)).status, 404);
  });

  test("a wrong move says nothing about the answer; the right one is recorded and shows the explanation only then", async () => {
    const { call, fam, kid, db } = await setup(13);
    const p = allPuzzles.find((x) => x.level === 1)!.p;
    const other = new Chess(p.fen).moves({ verbose: true }).find((m) => m.san !== p.solution[0])!;
    const wrong = await call("POST", `/children/${kid}/games/chess/${p.id}/move`, { step: 0, from: other.from, to: other.to }, fam);
    assert.deepEqual(wrong.json, { correct: false, reason: "wrong" });
    const right = await call("POST", `/children/${kid}/games/chess/${p.id}/move`, { step: 0, ...mv(p.solution[0]!, p.fen) }, fam);
    assert.equal(right.json.correct, true);
    assert.equal(right.json.done, true);
    assert.equal(right.json.explain, p.explain);
    assert.equal((await db.all("SELECT * FROM games_solved WHERE child_id = ? AND game = 'chess'", [kid])).length, 1);
    await call("POST", `/children/${kid}/games/chess/${p.id}/move`, { step: 0, ...mv(p.solution[0]!, p.fen) }, fam);
    assert.equal((await db.all("SELECT * FROM games_solved WHERE child_id = ? AND game = 'chess'", [kid])).length, 1, "recorded once");
    assert.equal((await call("GET", `/children/${kid}/games/chess/${p.id}`, undefined, fam)).json.solved, true);
  });

  test("a mate in two: the first move brings the reply, then the mate finishes it", async () => {
    const { call, fam, kid } = await setup(13);
    const p = allPuzzles.find((x) => x.level === 3)!.p;
    const first = await call("POST", `/children/${kid}/games/chess/${p.id}/move`, { step: 0, ...mv(p.solution[0]!, p.fen) }, fam);
    assert.equal(first.json.correct, true);
    assert.equal(first.json.done, false);
    assert.equal(first.json.reply.san, p.solution[1]);
    // `fen` is the position right after the child's move, so Black's reply can be played on it to reach `fenAfterReply`
    const replay = new Chess(first.json.fen);
    replay.move({ from: first.json.reply.from, to: first.json.reply.to });
    assert.equal(replay.fen(), first.json.fenAfterReply);
    assert.equal(first.json.fenAfterReply, ch.positionAt(p, 2).fen());
    assert.equal(first.json.explain, undefined, "no explanation before the puzzle is finished");
    const afterFen = ch.positionAt(p, 2).fen();
    const last = await call("POST", `/children/${kid}/games/chess/${p.id}/move`, { step: 2, ...mv(p.solution[2]!, afterFen) }, fam);
    assert.equal(last.json.done, true);
  });

  test("a win puzzle shows what happens next only after it is solved", async () => {
    const { call, fam, kid } = await setup(13);
    const p = allPuzzles.find((x) => x.level === 2)!.p;
    const r = await call("POST", `/children/${kid}/games/chess/${p.id}/move`, { step: 0, ...mv(p.solution[0]!, p.fen) }, fam);
    assert.equal(r.json.done, true);
    assert.ok(Array.isArray(r.json.rest));
  });

  test("hint ladder: in order, per move; the third hint is the move; hints never come before earlier ones", async () => {
    const { call, fam, kid } = await setup(13);
    const p = allPuzzles.find((x) => x.level === 1)!.p;
    const hint = (level: number, step = 0) => call("POST", `/children/${kid}/games/chess/${p.id}/hint`, { step, level }, fam);
    assert.equal((await hint(1)).status, 400);
    assert.equal((await hint(2)).status, 400);
    const h0 = await hint(0);
    assert.equal(h0.json.hint, p.hints[0]);
    assert.equal((await hint(2)).status, 400);
    assert.equal((await hint(1)).json.hint, p.hints[1]);
    const h2 = await hint(2);
    assert.equal(h2.json.hint, p.hints[2]);
    assert.equal(h2.json.isLast, true);
    assert.match(h2.json.hint, new RegExp(p.solution[0]!.replace(/[+#]/g, "\\$&")));
    assert.equal((await hint(0, 1)).status, 400, "odd steps are not the child's moves");
  });

  test("hints for the second move of a mate in two are made from the line", async () => {
    const { call, fam, kid } = await setup(13);
    const p = allPuzzles.find((x) => x.level === 3)!.p;
    const hint = (level: number) => call("POST", `/children/${kid}/games/chess/${p.id}/hint`, { step: 2, level }, fam);
    assert.match((await hint(0)).json.hint, /checkmate/i);
    assert.match((await hint(1)).json.hint, /Use your/);
    assert.match((await hint(2)).json.hint, /Play /);
  });

  test("bad input is refused, and nothing is reachable without sign-in or from another family", async () => {
    const a = await setup(13);
    const b = await setup(13);
    const p = allPuzzles.find((x) => x.level === 1)!.p;
    assert.equal((await a.call("POST", `/children/${a.kid}/games/chess/${p.id}/move`, { step: 0, from: "z9", to: "a1" }, a.fam)).status, 400);
    assert.equal((await a.call("POST", `/children/${a.kid}/games/chess/${p.id}/move`, { step: 0, from: "a1", to: "a2", promotion: "k" }, a.fam)).status, 400);
    assert.equal((await a.call("GET", `/children/${a.kid}/games/chess`)).status, 401);
    assert.equal((await b.call("GET", `/children/${a.kid}/games/chess/${p.id}`, undefined, b.fam)).status, 404);
    assert.equal((await a.call("GET", `/children/${a.kid}/games/chess/nope`, undefined, a.fam)).status, 404);
  });
});
