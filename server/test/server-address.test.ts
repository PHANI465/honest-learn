// The phone app asks the family for the address of their server. These rules decide what is accepted, so they are strict:
// https for anything outside the home network, plain http only for localhost and private addresses.
// The functions live in app/src/lib/server-address.ts (no React Native imports) and are tested here because the app has no test runner.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { candidateBases, findServer, isLocalHost, normalizeServerAddress, probeServer, type Fetcher } from "../../app/src/lib/server-address.ts";

const ok = (input: string) => {
  const r = normalizeServerAddress(input);
  assert.equal(r.ok, true, `${input} should be accepted`);
  return r.ok ? r : (undefined as never);
};
const bad = (input: string, pattern?: RegExp) => {
  const r = normalizeServerAddress(input);
  assert.equal(r.ok, false, `${input} should be refused`);
  if (!r.ok && pattern) assert.match(r.error, pattern);
};

describe("which hosts count as the home network", () => {
  test("localhost, loopback, private ranges and .local names", () => {
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.20", "172.16.0.1", "172.31.255.255", "169.254.10.10", "mac.local", "[::1]"]) assert.equal(isLocalHost(h), true, h);
  });
  test("public addresses and look-alikes do not", () => {
    for (const h of ["example.org", "8.8.8.8", "172.15.0.1", "172.32.0.1", "192.169.1.1", "11.0.0.1", "192.168.1.20.example.org", "localhost.example.org"]) assert.equal(isLocalHost(h), false, h);
  });
});

describe("normalising what a person typed", () => {
  test("a home-network address gets http, a public name gets https", () => {
    assert.deepEqual(ok("192.168.1.20:8787"), { ok: true, url: "http://192.168.1.20:8787", local: true });
    assert.deepEqual(ok("localhost:8787"), { ok: true, url: "http://localhost:8787", local: true });
    assert.deepEqual(ok("My-Mac.local:3000"), { ok: true, url: "http://my-mac.local:3000", local: true });
    assert.deepEqual(ok("learn.example.org"), { ok: true, url: "https://learn.example.org", local: false });
  });
  test("an explicit scheme is kept; surrounding spaces and trailing slashes go", () => {
    assert.equal(ok("  https://learn.example.org/  ").url, "https://learn.example.org");
    assert.equal(ok("https://learn.example.org/api/").url, "https://learn.example.org/api");
    assert.equal(ok("HTTPS://Learn.Example.ORG").url, "https://learn.example.org");
    assert.equal(ok("http://192.168.0.5:8787").url, "http://192.168.0.5:8787");
    assert.equal(ok("https://192.168.0.5:8443").url, "https://192.168.0.5:8443");
  });
  test("plain http is refused outside the home network, with a clear reason", () => {
    bad("http://learn.example.org", /https:\/\//);
    bad("http://8.8.8.8:8787", /https:\/\//);
    bad("http://172.15.0.1", /https:\/\//);
  });
  test("other schemes, credentials, queries, fragments and spaces are refused", () => {
    bad("ftp://example.org", /https/);
    bad("javascript:alert(1)");
    bad("file:///etc/passwd");
    bad("https://user:pass@example.org", /user name/);
    bad("https://example.org?x=1", /question mark/);
    bad("https://example.org/#top", /question mark/);
    bad("https://exa mple.org", /spaces/);
  });
  test("empty, nonsense hosts and bad ports are refused", () => {
    bad("", /Type the address/);
    bad("   ", /Type the address/);
    bad("https://", /web address|host/);
    bad("https://-bad-.org", /host name/);
    bad("https://exa_mple.org", /host name/);
    bad("999.1.1.1", /host name/);
    bad("192.168.1.20:0", /port/);
    bad("192.168.1.20:70000", /port/);
    bad("192.168.1.20:abc");
  });
});

describe("finding the server", () => {
  const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

  test("candidates: the address, then under /api, unless it already ends in /api", () => {
    assert.deepEqual(candidateBases("https://x.org"), ["https://x.org", "https://x.org/api"]);
    assert.deepEqual(candidateBases("https://x.org/api"), ["https://x.org/api"]);
  });
  test("a server that answers {ok:true} on /health is found, and nothing else is asked", async () => {
    const asked: string[] = [];
    const fetcher: Fetcher = async (url) => (asked.push(url), reply(200, { ok: true, lessons: 1 }));
    const r = await findServer("192.168.1.20:8787", fetcher);
    assert.deepEqual(r, { ok: true, base: "http://192.168.1.20:8787", local: true });
    assert.deepEqual(asked, ["http://192.168.1.20:8787/health"]);
  });
  test("the hosted layout is found under /api when the root does not answer", async () => {
    const fetcher: Fetcher = async (url) => (url.endsWith("/api/health") ? reply(200, { ok: true }) : reply(404, { error: "nope" }));
    assert.deepEqual(await findServer("learn.example.org", fetcher), { ok: true, base: "https://learn.example.org/api", local: false });
  });
  test("a web page that is not an Honest Learn server is not accepted", async () => {
    const html: Fetcher = async () => ({ ok: true, status: 200, json: async () => { throw new Error("not json"); } });
    const r = await findServer("example.org", html);
    assert.equal(r.ok, false);
    const wrongJson: Fetcher = async () => reply(200, { ok: "yes", hello: "world" });
    assert.equal((await findServer("example.org", wrongJson)).ok, false);
    const down: Fetcher = async () => reply(503, {});
    assert.equal((await findServer("example.org", down)).ok, false);
  });
  test("an unreachable server says so, in words that fit a home or an outside address", async () => {
    const offline: Fetcher = async () => { throw new TypeError("Network request failed"); };
    const home = await findServer("192.168.1.20:8787", offline);
    assert.equal(home.ok, false);
    if (!home.ok) assert.match(home.error, /same Wi-Fi/);
    const away = await findServer("learn.example.org", offline);
    if (!away.ok) assert.match(away.error, /spelling and your internet/);
  });
  test("a bad address is refused before any request is made", async () => {
    let called = 0;
    const fetcher: Fetcher = async () => (called++, reply(200, { ok: true }));
    assert.equal((await findServer("http://learn.example.org", fetcher)).ok, false);
    assert.equal((await findServer("", fetcher)).ok, false);
    assert.equal(called, 0);
  });
  test("a server that never answers is given up on after the timeout", async () => {
    const hang: Fetcher = (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const started = Date.now();
    assert.equal(await probeServer("http://192.168.1.20:8787", hang, 120), false);
    assert.ok(Date.now() - started < 2000);
  });
});
