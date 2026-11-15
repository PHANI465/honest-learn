// The two platforms (platform.ts) must agree exactly: a password hashed, a token signed or a key sealed on one is accepted by
// the other, and both match published test vectors. If this file fails, the phone app (task T8) and the server have drifted.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { isIP as nodeIsIP } from "node:net";

process.env.DB_PATH = ":memory:";
process.env.TUTOR_MODE = "mock";

const { createNodePlatform } = await import("../src/platform-node.ts");
const { createPortablePlatform, contentFromFiles } = await import("../src/platform-portable.ts");
const { pf, setPlatform } = await import("../src/platform.ts");
const bytes = await import("../src/bytes.ts");
const { hashSecret, verifySecret } = await import("../src/security.ts");
const ai = await import("../src/ai-settings.ts");
const { loadContent } = await import("../src/content.ts");
const { config } = await import("../src/config.ts");

const node = createNodePlatform();
const portable = createPortablePlatform();
const both = [node, portable] as const;
const original = pf();
after(() => setPlatform(original));

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const fromHex = (h: string) => new Uint8Array(Buffer.from(h, "hex"));
const text = (s: string) => new TextEncoder().encode(s);

describe("bytes.ts matches Buffer", () => {
  test("base64 and base64url, every length from 0 to 64", () => {
    for (let n = 0; n <= 64; n++) {
      const b = node.randomBytes(n);
      assert.equal(Object.getPrototypeOf(b), Uint8Array.prototype, "the Node platform returns plain Uint8Arrays, not Buffers");
      assert.equal(bytes.toBase64(b), Buffer.from(b).toString("base64"));
      assert.equal(bytes.toBase64Url(b), Buffer.from(b).toString("base64url"));
      assert.deepEqual(bytes.fromBase64(Buffer.from(b).toString("base64")), b);
      assert.deepEqual(bytes.fromBase64(Buffer.from(b).toString("base64url")), b);
    }
  });
  test("text, sizes and joining", () => {
    const s = "Hoot 🦉 says ¡hola! — 你好";
    assert.deepEqual(bytes.utf8(s), new Uint8Array(Buffer.from(s, "utf8")));
    assert.equal(bytes.fromUtf8(bytes.utf8(s)), s);
    assert.equal(bytes.utf8Length(s), Buffer.byteLength(s, "utf8"));
    assert.deepEqual(bytes.concatBytes(text("ab"), text(""), text("c")), text("abc"));
  });
  test("damaged base64 gives shorter output, never an exception", () => {
    assert.deepEqual(bytes.fromBase64("QUJD!!!"), text("ABC"));
    assert.deepEqual(bytes.fromBase64(""), new Uint8Array());
    assert.deepEqual(bytes.fromBase64("QU JD\n"), text("ABC"));
  });
});

describe("both platforms give the same answers", () => {
  test("SHA-256 (FIPS 180-2 vectors)", () => {
    for (const p of both) {
      assert.equal(hex(p.sha256(text("abc"))), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", p.name);
      assert.equal(hex(p.sha256(text(""))), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", p.name);
    }
    const r = node.randomBytes(1000);
    assert.deepEqual(portable.sha256(r), node.sha256(r));
  });

  test("scrypt (RFC 7914 vector, N=16384 r=8 p=1) and the same output on both", () => {
    const want =
      "7023bdcb3afd7348461c06cd81fd38ebfda8fbba904f8e3ea9b543f6545da1f2d5432955613f0fcf62d49705242a9af9e61e85dc0d651e40dfcf017b45575887";
    for (const p of both) assert.equal(hex(p.scrypt("pleaseletmein", text("SodiumChloride"), 64)), want, p.name);
    const salt = node.randomBytes(16);
    assert.deepEqual(portable.scrypt("pässwörd 🔑", salt, 64), node.scrypt("pässwörd 🔑", salt, 64));
  });

  test("HKDF-SHA256 (RFC 5869 test case 1)", () => {
    const ikm = fromHex("0b".repeat(22));
    const salt = fromHex("000102030405060708090a0b0c");
    const info = fromHex("f0f1f2f3f4f5f6f7f8f9");
    for (const p of both) {
      assert.equal(hex(p.hkdfSha256(ikm, salt, info, 42)), "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865", p.name);
    }
  });

  test("AES-256-GCM: sealed on one, opened on the other; any change is refused", () => {
    const key = node.randomBytes(32);
    const iv = node.randomBytes(12);
    const aad = text("parent-1");
    const msg = text("sk-a-secret-key");
    for (const [a, b] of [[node, portable], [portable, node]] as const) {
      const { ct, tag } = a.aesGcmSeal(key, iv, msg, aad);
      assert.equal(tag.length, 16);
      assert.deepEqual(b.aesGcmOpen(key, iv, ct, tag, aad), msg, `${a.name} → ${b.name}`);
      const flipped = ct.slice();
      flipped[0] = flipped[0]! ^ 1;
      assert.equal(b.aesGcmOpen(key, iv, flipped, tag, aad), null);
      assert.equal(b.aesGcmOpen(key, iv, ct, tag, text("parent-2")), null);
      assert.equal(b.aesGcmOpen(key, iv, ct, tag.slice(0, 12), aad), null, "a shortened tag is refused");
      assert.equal(b.aesGcmOpen(node.randomBytes(32), iv, ct, tag, aad), null);
    }
  });

  test("constant-time compare: equal, different, different length", () => {
    for (const p of both) {
      assert.equal(p.timingSafeEqual(text("abc"), text("abc")), true);
      assert.equal(p.timingSafeEqual(text("abc"), text("abd")), false);
      assert.equal(p.timingSafeEqual(text("abc"), text("abcd")), false);
    }
  });

  test("random numbers: right sizes, in range, not repeating, version-4 ids", () => {
    for (const p of both) {
      assert.equal(p.randomBytes(70000).length, 70000);
      assert.notDeepEqual(p.randomBytes(16), p.randomBytes(16));
      const seen = new Set<number>();
      for (let i = 0; i < 2000; i++) {
        const n = p.randomInt(10);
        assert.ok(Number.isInteger(n) && n >= 0 && n < 10);
        seen.add(n);
      }
      assert.equal(seen.size, 10, `${p.name}: every value from 0 to 9 appears`);
      assert.ok(p.randomInt(1_000_000) < 1_000_000);
      assert.match(p.randomUUID(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    assert.throws(() => portable.randomInt(0));
  });

  test("without a secure random source the portable platform refuses (no Math.random fallback)", () => {
    const bare = createPortablePlatform({ getRandomValues: undefined });
    const saved = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      assert.throws(() => bare.randomBytes(8), /secure random/);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: saved, configurable: true });
    }
  });

  test("IP addresses are recognised exactly like Node's net.isIP", () => {
    const corpus = [
      "1.2.3.4", "0.0.0.0", "255.255.255.255", "256.1.1.1", "01.2.3.4", "1.2.3", "1.2.3.4.5", "1.2.3.-1", " 1.2.3.4", "1.2.3.4 ",
      "::", "::1", "1::", "fe80::1", "fe80::1%eth0", "fe80::1%", "2001:db8::1", "2001:db8:0:0:0:0:2:1", "2001:db8::2:1",
      "1:2:3:4:5:6:7:8", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7::", "::2:3:4:5:6:7:8", "1::2::3", "12345::1", "g::1",
      "::ffff:192.168.0.1", "::ffff:1.2.3.256", "1.2.3.4::", "::1.2.3.4", "1:2:3:4:5:6:1.2.3.4", "1:2:3:4:5:6:7:1.2.3.4",
      "fd00:ec2::254", "FD00:EC2::254", ":::", ":1::", "1:", "localhost", "example.org", "", "[::1]", "169.254.169.254",
    ];
    for (const s of corpus) assert.equal(portable.isIP(s), nodeIsIP(s), JSON.stringify(s));
  });
});

describe("JSON Web Tokens: identical on both platforms", () => {
  const secret = "a-test-secret";
  const future = () => Math.floor(Date.now() / 1000) + 600;

  test("the same claims give the same token, and each platform accepts the other's", async () => {
    const claims = { sub: "parent-1", scope: "family", v: 2, exp: future() };
    const a = await node.signJwt(claims, secret);
    const b = await portable.signJwt(claims, secret);
    assert.equal(a, b, "byte for byte the same as hono/jwt");
    assert.deepEqual(await portable.verifyJwt(a, secret), claims);
    assert.deepEqual(await node.verifyJwt(b, secret), claims);
  });

  test("both refuse: wrong secret, changed claims, another algorithm, no algorithm, expired, not yet valid, junk", async () => {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const good = await node.signJwt({ sub: "p", scope: "parent", exp: future() }, secret);
    const [h, , s] = good.split(".");
    const bad: [string, string][] = [
      ["wrong secret", await node.signJwt({ sub: "p", scope: "parent", exp: future() }, "another-secret")],
      ["changed claims", `${h}.${enc({ sub: "someone-else", scope: "parent", exp: future() })}.${s}`],
      ["alg none", `${enc({ alg: "none", typ: "JWT" })}.${enc({ sub: "p", exp: future() })}.`],
      ["HS512 header", `${enc({ alg: "HS512", typ: "JWT" })}.${good.split(".")[1]}.${s}`],
      ["other typ", `${enc({ alg: "HS256", typ: "JWE" })}.${good.split(".")[1]}.${s}`],
      ["crit header", `${enc({ alg: "HS256", typ: "JWT", crit: ["x"] })}.${good.split(".")[1]}.${s}`],
      ["expired", await node.signJwt({ sub: "p", exp: Math.floor(Date.now() / 1000) - 1 }, secret)],
      ["not yet valid", await node.signJwt({ sub: "p", nbf: future(), exp: future() }, secret)],
      ["issued in the future", await node.signJwt({ sub: "p", iat: future(), exp: future() }, secret)],
      ["exp not a number", await node.signJwt({ sub: "p", exp: "tomorrow" }, secret)],
      ["two parts", `${h}.${good.split(".")[1]}`],
      ["junk", "not.a.token"],
    ];
    for (const [why, token] of bad) {
      for (const p of both) await assert.rejects(p.verifyJwt(token, secret), `${p.name} must refuse: ${why}`);
    }
  });
});

describe("what the API stores is interchangeable", () => {
  test("children's option orders are exactly what they were before the platform change, on both platforms", async () => {
    const { createHash } = await import("node:crypto");
    const { seeded } = await import("../src/shuffle.ts");
    // the seed as shuffle.ts computed it before T8a
    const oldSeed = (seed: string) => createHash("sha256").update(seed).digest().readUInt32LE(0);
    for (const p of both) {
      setPlatform(p);
      for (const seed of ["child-1:b3-math-comparing-fractions:0", "x", "🦉:lesson:7", ""]) {
        let a = oldSeed(seed);
        const old = () => {
          a = (a + 0x6d2b79f5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const now = seeded(seed);
        for (let i = 0; i < 5; i++) assert.equal(now(), old(), `${p.name} ${JSON.stringify(seed)}`);
      }
    }
    setPlatform(node);
  });

  test("a password hashed on one platform verifies on the other", () => {
    setPlatform(node);
    const onServer = hashSecret("correct horse");
    setPlatform(portable);
    const onPhone = hashSecret("correct horse");
    assert.equal(verifySecret("correct horse", onServer), true);
    assert.equal(verifySecret("wrong", onServer), false);
    setPlatform(node);
    assert.equal(verifySecret("correct horse", onPhone), true);
    assert.equal(verifySecret("correct horse", "scrypt$abc$"), false);
    assert.equal(verifySecret("correct horse", "bcrypt$x$y"), false);
  });

  test("an AI key sealed on one platform opens on the other, for the same parent only", () => {
    setPlatform(portable);
    const sealed = ai.sealKey("sk-family-key-1234567890", "parent-9");
    setPlatform(node);
    assert.equal(ai.openKey(sealed, "parent-9"), "sk-family-key-1234567890");
    assert.equal(ai.openKey(sealed, "parent-8"), null);
    const back = ai.sealKey("sk-family-key-1234567890", "parent-9");
    setPlatform(portable);
    assert.equal(ai.openKey(back, "parent-9"), "sk-family-key-1234567890");
    setPlatform(node);
  });

  test("content handed in as files loads exactly like the content folder (how the phone app gets it)", () => {
    setPlatform(node);
    const fromDisk = loadContent(config.contentDir);
    const files: Record<string, unknown> = {};
    const add = (rel: string) => (files[rel] = node.content.readJson(config.contentDir, rel));
    add("knowledge-map.json");
    add("resources.json");
    add("helplines.json");
    for (const dir of ["lessons", "puzzles", "facts", "spelling", "chess"]) for (const rel of node.content.listJson(config.contentDir, dir)) add(rel);
    setPlatform(createPortablePlatform({ content: contentFromFiles(files) }));
    try {
      const fromFiles = loadContent("bundled");
      assert.deepEqual([...fromFiles.lessons.keys()].sort(), [...fromDisk.lessons.keys()].sort());
      assert.equal(fromFiles.puzzles.size, fromDisk.puzzles.size);
      assert.equal(fromFiles.facts.size, fromDisk.facts.size);
      assert.equal(fromFiles.spelling.size, fromDisk.spelling.size);
      assert.equal(fromFiles.chess.size, fromDisk.chess.size);
      assert.equal(fromFiles.resources.length, fromDisk.resources.length);
      assert.deepEqual(fromFiles.lessons.get("b3-math-comparing-fractions"), fromDisk.lessons.get("b3-math-comparing-fractions"));
    } finally {
      setPlatform(node);
    }
  });
});
