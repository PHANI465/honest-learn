// Standalone mode on a phone: requests go to the API running inside the app (src/local/device.ts) instead of a server.
// The website uses local-backend.ts instead (Metro picks this .native file only for iOS and Android), so none of this, nor the
// bundled content, is part of the website.
import type { LocalApi } from "../local/core";

let opening: Promise<LocalApi> | null = null;

/** Answers a request with the app's own API. The database and content are opened on the first request, then kept. */
export function localRequest(path: string, init: RequestInit): Promise<Response> {
  opening ??= import("../local/device")
    .then((m) => m.openDeviceApi())
    .catch((e: unknown) => {
      opening = null; // try again on the next request
      throw e;
    });
  return opening.then((api) => api.request(path, init));
}
