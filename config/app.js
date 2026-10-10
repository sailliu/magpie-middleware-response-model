const get = (id) => document.getElementById(id);
const token = location.hash.slice(1) || sessionStorage.getItem("config-token") || "";
sessionStorage.setItem("config-token", token);
history.replaceState(null, "", location.pathname);
let saved = "";
let models = [];
let ready = false;
let busy = false;
let loadingModels = false;

async function api(path, body) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "X-Config-Token": token, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "请求失败");
  return value;
}

function message(id, text, error = false) {
  get(id).textContent = text;
  get(id).classList.toggle("error", error);
}

function controls() {
  get("model").disabled = !ready || busy;
  get("search").disabled = !ready || busy;
  get("save").disabled = !ready || busy || get("model").value === saved;
  get("reset").disabled = !ready || busy || get("model").value === saved;
  get("refresh").disabled = busy || loadingModels;
  get("save").textContent = busy ? "正在保存…" : "保存配置";
}

function list(selected = get("model").value) {
  const select = get("model");
  const query = get("search").value.trim().toLowerCase();
  select.replaceChildren(new Option("保留原模型名称", ""));
  const seen = new Set([""]);
  for (const model of models) {
    if (seen.has(model.id)) continue;
    if (model.id !== selected && !`${model.name} ${model.id}`.toLowerCase().includes(query)) continue;
    seen.add(model.id);
    select.add(new Option(model.name === model.id ? model.id : `${model.name} · ${model.id}`, model.id));
  }
  for (const value of [saved, selected]) {
    if (typeof value === "string" && value && !seen.has(value)) {
      seen.add(value);
      select.add(new Option(`${value}（当前名称）`, value));
    }
  }
  select.value = selected;
  controls();
}

async function loadModels() {
  loadingModels = true;
  controls();
  message("models-status", "正在读取模型列表…");
  try {
    const value = await api("/api/models");
    models = value.models;
    list();
    message("models-status", models.length ? `已读取 ${models.length} 个模型` : "网关当前未提供模型，已保存的名称仍会保留。");
  } catch (error) {
    message("models-status", error.message, true);
  } finally { loadingModels = false; controls(); }
}

async function loadOptions() {
  try {
    const value = await api("/api/options");
    saved = value.options.model ?? "";
    get("current").textContent = typeof saved === "string" && saved ? saved : "保留原模型名称";
    get("connection").textContent = `${value.gateway} · ${value.plugin}`;
    ready = true;
    list(typeof saved === "string" ? saved : "");
    message("status", "选择模型后点击保存。取消修改不会写入配置。");
  } catch (error) { message("status", error.message + "；修正后刷新页面。", true); }
  controls();
}

get("model").onchange = () => { controls(); message("status", get("model").value === saved ? "配置未改变。" : "有未保存的修改。"); };
get("search").oninput = () => list();
get("refresh").onclick = loadModels;
get("reset").onclick = () => { get("search").value = ""; list(typeof saved === "string" ? saved : ""); message("status", "已取消修改。"); };
get("save").onclick = async () => {
  const model = get("model").value;
  busy = true;
  controls();
  try {
    const value = await api("/api/options", { model, previousModel: saved });
    saved = value.options.model;
    get("current").textContent = saved || "保留原模型名称";
    message("status", "已保存，新的请求将使用这项配置。");
  } catch (error) { message("status", error.message, true); }
  finally { busy = false; controls(); }
};

loadOptions();
loadModels();
