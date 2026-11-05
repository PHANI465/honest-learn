// Vercel Function for the whole API. vercel.json rewrites every /api/* request here;
// the Hono app (server/src/vercel.ts) has basePath "/api" and routes on the original path.
import { handler } from "../server/src/vercel.ts";

export default { fetch: handler };
