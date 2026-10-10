import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";

const exec = promisify(execFile);
const settings = {
  magpie: process.env.MAGPIE_BIN || "magpie",
  gateway: process.env.MAGPIE_ADDR ? `http://${process.env.MAGPIE_ADDR}` : "http://127.0.0.1:3425",
  plugin: "magpie-middleware-response-model",
  port: "0",
};
const usage = `独立响应模型配置页面（无需修改 Magpie）

node configure.mjs [--magpie <可执行文件>] [--gateway <本机网关 URL>]
                   [--plugin <安装时的名称或路径>] [--port <页面端口>]

默认网关：http://127.0.0.1:3425；默认页面端口：自动分配。
请在运行 Magpie 的同一操作系统和用户下启动。
若网关需要密钥，可通过 MAGPIE_CONFIG_API_KEY 环境变量提供。`;

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2);
    if (!args[i].startsWith("--") || !Object.hasOwn(settings, key) || !args[i + 1]) {
      throw fail(`参数不正确：${args[i]}\n${usage}`);
    }
    settings[key] = args[i + 1];
  }
  const gateway = new URL(settings.gateway);
  if (!["http:", "https:"].includes(gateway.protocol)
      || !["127.0.0.1", "localhost", "[::1]"].includes(gateway.hostname)
      || gateway.username || gateway.password || gateway.search || gateway.hash) {
    throw fail("网关必须是本机 HTTP 或 HTTPS 地址，如 http://127.0.0.1:3425");
  }
  if (!/^\d+$/.test(settings.port) || Number(settings.port) > 65535) {
    throw fail("页面端口必须是 0 到 65535 的整数");
  }
  return new URL("v1/models", gateway.href.replace(/\/?$/, "/"));
}

async function command(args) {
  try {
    return (await exec(settings.magpie, ["plugin", "options", settings.plugin, ...args], {
      timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true,
      env: { ...process.env, NO_COLOR: "1" },
    })).stdout;
  } catch (error) {
    if (error.code === "ENOENT") throw fail("找不到 Magpie，请用 --magpie 指定可执行文件路径", 503);
    if (error.killed) throw fail("Magpie 命令等待超过两分钟，请刷新页面确认配置是否已保存后再重试", 504);
    throw fail("Magpie 命令未成功执行，请确认插件已安装、可执行文件路径正确且使用同一用户", 503);
  }
}

async function options() {
  const output = (await command([])).replace(/\x1b\[[0-9;]*m/g, "").trim();
  const start = output.indexOf("{");
  if (start < 0 && output === "No options set.") return {};
  if (start < 0) throw fail("无法读取插件选项：Magpie 未返回 JSON", 503);
  let value;
  try { value = JSON.parse(output.slice(start)); } catch { throw fail("无法读取插件选项：JSON 格式不正确", 503); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw fail("插件选项不是 JSON 对象", 503);
  return value;
}

function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function bodyOf(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8192) throw fail("配置内容过大", 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw fail("请求必须是 JSON"); }
}

async function start() {
  const modelURL = parseArgs();
  const token = randomBytes(32).toString("hex");
  let origin = "";
  let saving = false;
  const files = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
    ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ]);
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try {
      if (request.headers.host !== new URL(origin).host) throw fail("无效的本机访问地址", 403);
      const path = new URL(request.url, origin).pathname;
      if (request.method === "GET" && files.has(path)) {
        const [name, type] = files.get(path);
        const content = await readFile(new URL(`./config/${name}`, import.meta.url));
        response.writeHead(200, { "Content-Type": type });
        return response.end(content);
      }
      const given = Buffer.from(String(request.headers["x-config-token"] || ""));
      const expected = Buffer.from(token);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw fail("访问凭据失效，请使用终端中的页面地址重新打开", 403);
      if (request.method === "GET" && path === "/api/options") {
        return json(response, 200, { options: await options(), gateway: modelURL.origin, plugin: settings.plugin });
      }
      if (request.method === "GET" && path === "/api/models") {
        const key = process.env.MAGPIE_CONFIG_API_KEY;
        const result = await fetch(modelURL, { signal: AbortSignal.timeout(10000), redirect: "error", headers: key ? { Authorization: `Bearer ${key}` } : {} });
        if (!result.ok) throw fail(`模型列表读取失败（HTTP ${result.status}），请检查网关和访问密钥`, 502);
        const value = await result.json();
        if (!Array.isArray(value.data)) throw fail("网关返回的模型列表格式不正确", 502);
        const models = value.data.filter((item) => item && typeof item.id === "string")
          .map((item) => ({ id: item.id, name: item.display_name || item.magpie_label || item.id }));
        return json(response, 200, { models });
      }
      if (request.method === "POST" && path === "/api/options") {
        if (request.headers.origin !== origin || !request.headers["content-type"]?.startsWith("application/json")) throw fail("无效的保存请求", 403);
        if (saving) throw fail("正在保存，请稍后再试", 409);
        saving = true;
        try {
          const body = await bodyOf(request);
          if (!body || typeof body.model !== "string" || body.model.length > 512) throw fail("模型名称必须是最多 512 个字符的字符串");
          const current = await options();
          if (JSON.stringify(current.model ?? "") !== JSON.stringify(body.previousModel)) {
            throw fail("模型配置已被其他窗口修改，请重新加载后再保存", 409);
          }
          const updated = { ...current, model: body.model };
          await command([JSON.stringify(updated)]);
          return json(response, 200, { options: updated });
        } finally { saving = false; }
      }
      throw fail("接口不存在", 404);
    } catch (error) {
      json(response, error.status || 503, { error: error.status ? error.message : "读取失败，请确认本机网关已启动后重试" });
    }
  });
  server.requestTimeout = 30000;
  server.on("error", (error) => { console.error(`配置页面启动失败：${error.message}`); process.exitCode = 1; });
  server.listen(Number(settings.port), "127.0.0.1", () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    console.log(`配置页面：${origin}/#${token}`);
    console.log("请在浏览器打开上面的地址。选择模型并保存；关闭终端或按 Ctrl+C 结束。");
  });
}

start().catch((error) => { console.error(error.message); process.exitCode = 1; });
