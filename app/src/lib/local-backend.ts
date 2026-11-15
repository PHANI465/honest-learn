// The website's version of local-backend.native.ts: the website always has its server, so standalone mode does not exist here
// (expo-sqlite on the web would also need WebAssembly and extra HTTP headers). isDeviceMode() is never true on the web.
export function localRequest(_path: string, _init: RequestInit): Promise<Response> {
  return Promise.reject(new Error("Standalone mode is only available in the phone app"));
}
