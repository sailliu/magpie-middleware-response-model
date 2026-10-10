// Rewrite only response metadata; the request and routing stay unchanged.
function rewrite(body, ctx) {
  const model = ctx.options.model;
  if (typeof model !== "string" || !model.trim() || body.error || body.response?.error
      || body.type === "error" || body.type === "response.failed") return;
  let changed = false;
  const field = ctx.protocol === "gemini" ? "modelVersion" : "model";
  const targets = ctx.protocol === "anthropic" ? [body, body.message]
    : ctx.protocol === "responses" ? [body, body.response] : [body];
  for (const target of targets) {
    if (target && typeof target[field] === "string") {
      target[field] = model;
      changed = true;
    }
  }
  if (changed) return body;
}

export function onEvent(event, ctx) {
  return rewrite(event, ctx);
}

export function onResponse(body, ctx) {
  if (ctx.status >= 400) return;
  return rewrite(body, ctx);
}
