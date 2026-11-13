// Creates (or reuses) a demo family on a running Honest Learn API so you can sign in and click around.
//
//   node scripts/seed-demo.mjs                       # API at http://localhost:3000/api (npm run dev at the repo root)
//   node scripts/seed-demo.mjs http://localhost:8787 # API-only server (cd server && npm run dev)
//
// These are TEST credentials for a local pre-launch copy only. Never use them (or this script) on a
// launched site. Safe to run again: an existing demo account is reused and missing children are added.
const DEMO = {
  email: "demo.parent@honestlearn.test",
  password: "OwlDemo-2468-Learn",
  pin: "2468",
  country: "IN",
  children: [
    { nickname: "Mini", birthYear: new Date().getFullYear() - 4, avatar: "owl" }, // Little Explorers (3-5)
    { nickname: "Sam", birthYear: new Date().getFullYear() - 7, avatar: "fox" }, // Early Learners (6-8)
    { nickname: "Ria", birthYear: new Date().getFullYear() - 10, avatar: "panda" }, // Discoverers (9-11)
    { nickname: "Dev", birthYear: new Date().getFullYear() - 13, avatar: "turtle" }, // Thinkers (12-14)
    { nickname: "Asha", birthYear: new Date().getFullYear() - 16, avatar: "lion" }, // Builders (15-18)
  ],
};

let base = (process.argv[2] ?? "http://localhost:3000/api").replace(/\/$/, "");
if (!/\/api$/.test(base) && /:3000$/.test(base)) base += "/api";

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const health = await call("GET", "/health").catch(() => null);
if (!health || health.status !== 200) {
  console.error(`Cannot reach the API at ${base}. Start it first (see docs/TRY_IT.md), or pass its address as the first argument.`);
  process.exit(1);
}

const CONSENT_VERSION = "2026-11-v1"; // must match CONSENT_VERSION in server/src/models.ts
const r = await call("POST", "/auth/signup", {
  email: DEMO.email,
  password: DEMO.password,
  pin: DEMO.pin,
  confirmAdult: true,
  consentVersion: CONSENT_VERSION,
  country: DEMO.country,
});
let familyToken = r.json.familyToken;
if (r.status === 409) {
  const login = await call("POST", "/auth/login", { email: DEMO.email, password: DEMO.password });
  if (login.status !== 200) {
    console.error("The demo email already exists with a different password. Delete that account or reset the database.", login.json);
    process.exit(1);
  }
  familyToken = login.json.familyToken;
  console.log("Demo account already existed: signed in.");
} else if (r.status !== 201) {
  console.error("Sign-up failed:", r.status, r.json);
  process.exit(1);
} else {
  console.log("Demo account created.");
}

const unlock = await call("POST", "/auth/parent-unlock", { pin: DEMO.pin }, familyToken);
if (unlock.status !== 200) {
  console.error("Could not unlock the parent area with the demo PIN:", unlock.status, unlock.json);
  process.exit(1);
}
const parentToken = unlock.json.parentToken;

const existing = (await call("GET", "/parent/overview", undefined, parentToken)).json;
const have = new Set((existing.children ?? []).map((c) => c.nickname));
for (const child of DEMO.children) {
  if (have.has(child.nickname)) continue;
  const c = await call("POST", "/parent/children", child, parentToken);
  console.log(c.status === 201 ? `  added ${child.nickname}` : `  could not add ${child.nickname}: ${c.status} ${JSON.stringify(c.json)}`);
}

console.log(`
Sign in at the app with:
  email:    ${DEMO.email}
  password: ${DEMO.password}
  parent PIN: ${DEMO.pin}
Children: ${DEMO.children.map((c) => c.nickname).join(", ")} (one per age group)
`);
