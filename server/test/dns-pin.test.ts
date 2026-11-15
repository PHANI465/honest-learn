// DNS rebinding: a family's model address is checked, and the request must then go to exactly the addresses that were checked.
// A name whose DNS answer changes between the check and the connection must not be able to reach another address. These tests use a
// real HTTP server on 127.0.0.1 and host names that are not in DNS: the request can only arrive if the connection uses the
// checked addresses and never asks DNS again.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

process.env.DB_PATH = ":memory:";
process.env.TUTOR_MODE = "mock";

const ai = await import("../src/ai-settings.ts");
const { pf, setPlatform } = await import("../src/platform.ts");
const { createPortablePlatform } = await import("../src/platform-portable.ts");

const original = pf();
after(() => setPlatform(original));

interface Seen {
  method: string;
  url: string;
  host: string | undefined;
  headers: IncomingMessage["headers"];
  body: string;
}
let seen: Seen[] = [];
let behaviour: (req: IncomingMessage, res: ServerResponse) => void = (_req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ choices: [{ message: { content: "hi" } }] }));
};
let server: Server;
let port = 0;
before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", host: req.headers.host, headers: req.headers, body });
      behaviour(req, res);
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as { port: number }).port;
});
after(() => server.close());

const NAME = "rebind-victim.local"; // a .local name counts as local (http is allowed with local models on) and is not in DNS
const url = (path = "/v1/chat/completions") => `http://${NAME}:${port}${path}`;
const to = (...addresses: string[]) => async () => addresses.map((address) => ({ address }));
const post = (f: typeof fetch, extra: RequestInit = {}) =>
  f(url(), { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer test-key-123" }, body: JSON.stringify({ model: "m" }), ...extra });

describe("the connection uses exactly the checked addresses", () => {
  test("a name that does not exist in DNS is reached, so no second lookup is made", async () => {
    seen = [];
    const res = await post(ai.guardedFetch(true, to("127.0.0.1")));
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { choices: { message: { content: string } }[] }).choices[0]!.message.content, "hi");
    assert.equal(seen.length, 1);
    // an ordinary fetch to the same name has to ask DNS, and fails: so this test really tells the two apart
    await assert.rejects(fetch(url(), { method: "POST", body: "{}" }));
  });

  test("the name is resolved once per request, and the answer of the check is the answer used", async () => {
    // First answer: this machine (allowed here). Any later answer would be the cloud metadata address. If the connection asked again,
    // or the check and the connection used different answers, this could not work.
    let calls = 0;
    const flipping = async () => (++calls === 1 ? [{ address: "127.0.0.1" }] : [{ address: "169.254.169.254" }]);
    seen = [];
    const f = ai.guardedFetch(true, flipping);
    assert.equal((await post(f)).status, 200);
    assert.equal(calls, 1, "one lookup for one request");
    // the next request is checked again, and now the name points at a forbidden address: refused before anything is sent
    await assert.rejects(post(f), /blocked_address/);
    assert.equal(calls, 2);
    assert.equal(seen.length, 1, "nothing was sent to the second address");
  });

  test("an address that is not in the checked list is never connected to", async () => {
    // The checked list names an address with nothing listening (port 1). The connection fails; it does not fall back to asking DNS
    // or to any other address, and the real server on 127.0.0.1 is never reached.
    seen = [];
    await assert.rejects(ai.guardedFetch(true, to("127.0.0.2"))(`http://${NAME}:1/v1/chat/completions`, { method: "POST", body: "{}", signal: AbortSignal.timeout(2000) }));
    assert.equal(seen.length, 0);
  });

  test("a forbidden address is refused before anything connects, and so is a mixed list", async () => {
    seen = [];
    await assert.rejects(post(ai.guardedFetch(true, to("169.254.169.254"))), /blocked_address/);
    await assert.rejects(post(ai.guardedFetch(true, to("127.0.0.1", "169.254.169.254"))), /blocked_address/, "every address must pass");
    await assert.rejects(post(ai.guardedFetch(false, to("127.0.0.1"))), /blocked_address/, "private addresses are refused when local models are off");
    assert.equal(seen.length, 0);
  });

  test("an address written as an IP needs no lookup and is still checked", async () => {
    seen = [];
    const ok = await ai.guardedFetch(true, async () => { throw new Error("no lookup expected"); })(`http://127.0.0.1:${port}/v1/chat/completions`, { method: "POST", body: "{}" });
    assert.equal(ok.status, 200);
    await assert.rejects(ai.guardedFetch(true)("http://169.254.169.254/v1/chat/completions", { method: "POST", body: "{}" }), /blocked_address/);
    assert.equal(seen.length, 1);
  });
});

describe("what is sent, and what comes back", () => {
  test("method, headers and body arrive as sent, and the Host header is the name (not the address)", async () => {
    seen = [];
    await post(ai.guardedFetch(true, to("127.0.0.1")));
    const s = seen[0]!;
    assert.equal(s.method, "POST");
    assert.equal(s.url, "/v1/chat/completions");
    assert.equal(s.host, `${NAME}:${port}`);
    assert.equal(s.headers.authorization, "Bearer test-key-123");
    assert.equal(s.headers["content-type"], "application/json");
    assert.equal(s.headers["content-length"], String(Buffer.byteLength('{"model":"m"}')));
    assert.equal(s.headers["accept-encoding"], "identity");
    assert.equal(s.body, '{"model":"m"}');
  });

  test("a multi-byte body gets the right length", async () => {
    seen = [];
    const body = JSON.stringify({ m: "naïve café ✓ 🦉" });
    await ai.guardedFetch(true, to("127.0.0.1"))(url(), { method: "POST", body });
    assert.equal(seen[0]!.body, body);
  });

  test("the status and headers come back, so an error answer is an error", async () => {
    behaviour = (_req, res) => {
      res.statusCode = 401;
      res.setHeader("x-test", "yes");
      res.end("nope");
    };
    try {
      const res = await post(ai.guardedFetch(true, to("127.0.0.1")));
      assert.equal(res.ok, false);
      assert.equal(res.status, 401);
      assert.equal(res.headers.get("x-test"), "yes");
      assert.equal(await res.text(), "nope");
      behaviour = (_req, r) => (r.statusCode = 204, r.end());
      assert.equal((await post(ai.guardedFetch(true, to("127.0.0.1")))).status, 204);
    } finally {
      behaviour = (_req, res) => res.end(JSON.stringify({ choices: [{ message: { content: "hi" } }] }));
    }
  });

  test("a redirect is refused, never followed, and is reported as a redirect", async () => {
    behaviour = (_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", "http://169.254.169.254/latest/meta-data/");
      res.end();
    };
    try {
      seen = [];
      const err = await post(ai.guardedFetch(true, to("127.0.0.1"))).then(() => null, (e: unknown) => e);
      assert.ok(err instanceof Error);
      assert.equal(ai.errorCategory(err), "redirect");
      assert.equal(seen.length, 1, "only the first request was made");
    } finally {
      behaviour = (_req, res) => res.end(JSON.stringify({ choices: [{ message: { content: "hi" } }] }));
    }
  });

  test("an answer over 1 MB is cut off", async () => {
    behaviour = (_req, res) => {
      res.write("x".repeat(600_000));
      res.write("x".repeat(600_000));
      res.end();
    };
    try {
      await assert.rejects(post(ai.guardedFetch(true, to("127.0.0.1"))), /too large/);
    } finally {
      behaviour = (_req, res) => res.end(JSON.stringify({ choices: [{ message: { content: "hi" } }] }));
    }
  });

  test("a slow server is stopped by the caller's timeout, and that is reported as a timeout", async () => {
    behaviour = () => {
      /* never answers */
    };
    try {
      const err = await post(ai.guardedFetch(true, to("127.0.0.1")), { signal: AbortSignal.timeout(150) }).then(() => null, (e: unknown) => e);
      assert.ok(err instanceof Error);
      assert.equal(ai.errorCategory(err), "timeout");
    } finally {
      behaviour = (_req, res) => res.end(JSON.stringify({ choices: [{ message: { content: "hi" } }] }));
    }
  });

  test("only text bodies are supported (a model server is only ever sent JSON text)", async () => {
    await assert.rejects(ai.guardedFetch(true, to("127.0.0.1"))(url(), { method: "POST", body: new Uint8Array([1, 2, 3]) }), /unsupported body/);
  });

  test("https is used for an https address (a plain-http server answers with a TLS error, not a reply)", async () => {
    seen = [];
    await assert.rejects(ai.guardedFetch(true, to("127.0.0.1"))(`https://${NAME}:${port}/v1/chat/completions`, { method: "POST", body: "{}", signal: AbortSignal.timeout(3000) }));
    assert.equal(seen.length, 0, "the server never saw a plain request");
  });
});

describe("where there is nothing to pin", () => {
  test("the test seam is used as it is, with redirects still refused", async () => {
    const calls: { url: string; redirect?: RequestRedirect }[] = [];
    const inner = (async (u: string, init?: RequestInit) => (calls.push({ url: u, redirect: init?.redirect }), new Response("{}"))) as typeof fetch;
    await ai.guardedFetch(true, to("127.0.0.1"), inner)(url(), { method: "POST", redirect: "follow" });
    assert.deepEqual(calls, [{ url: url(), redirect: "error" }]);
    assert.equal(seen.length, 0, "the pinned transport was not used");
  });

  test("on a platform with no pinned transport (the phone), the ordinary fetch is used", async () => {
    const real = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (u: string) => (calls.push(String(u)), new Response("{}"))) as typeof fetch;
    setPlatform(createPortablePlatform({})); // no DNS lookup, no pinned transport
    try {
      await ai.guardedFetch(false)("https://models.example.org/v1/chat/completions", { method: "POST", body: "{}" });
      assert.deepEqual(calls, ["https://models.example.org/v1/chat/completions"]);
      await assert.rejects(ai.guardedFetch(false)("https://169.254.169.254/v1/chat/completions", { method: "POST", body: "{}" }), /blocked_address/, "the written address is still checked");
    } finally {
      globalThis.fetch = real;
      setPlatform(original);
    }
  });
});
