// JSON responses and request-body checks shared by the community API's modules.

// A JSON response that is never cached unless `headers` says otherwise.
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

export function plainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Accepts exactly {"<key>": "<string>"} -- missing/wrong keys, extra keys, null,
// arrays and non-strings are all rejected.
export function singleString(data, key) {
  return plainObject(data) && Object.keys(data).length === 1 && typeof data[key] === "string" ? data[key] : null;
}

// True when `body` holds exactly the `expected` keys, each a string.
export function fields(body, expected) {
  return plainObject(body) && Object.keys(body).length === expected.length &&
    expected.every((key) => typeof body[key] === "string");
}
