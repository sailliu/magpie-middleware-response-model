# Magpie 响应模型名称插件

改写客户端收到的模型名称，并提供独立的本机配置页面。

**无需修改或重新编译 Magpie。下拉框位于独立配置页面，Magpie 原有的“插件 → 选项”仍然是 JSON 编辑器。**

例如，实际由 `actual-model` 生成回复，响应中的模型名称可以改成 `display-model`。插件只修改响应字段，实际调用的模型、请求内容与路由保持不变。

## 安装插件

需要使用支持网关中间件的 Magpie。本插件未发布到 npm，可直接从 GitHub 添加：

```bash
magpie plugin add github:sailliu/magpie-middleware-response-model
```

也可以在 Magpie 的“插件 → 添加插件”中输入：

```text
github:sailliu/magpie-middleware-response-model
```

已安装旧版时，在 Magpie 的插件页面点击“更新”。

## 使用独立配置页面

配置工具需要 Node.js 20 或更高版本，不需要安装 npm 依赖。请在运行 Magpie 的**同一操作系统和用户**下启动，以便 Magpie 命令读取正确的插件配置；Windows Magpie 应使用 Windows Node.js。

先获取配置工具：

```bash
git clone https://github.com/sailliu/magpie-middleware-response-model.git
cd magpie-middleware-response-model
```

如果 `magpie` 已加入 PATH：

```bash
node configure.mjs
```

Windows PowerShell 示例，指定 Magpie 可执行文件：

```powershell
node configure.mjs --magpie "D:\Programs\magpie-windows-amd64.exe"
```

终端会打印一个 `http://127.0.0.1:端口/#访问凭据` 地址。在浏览器打开这个地址，然后：

1. 从下拉框选择模型，可按名称或 ID 搜索。
2. 点击“保存配置”。配置从新的请求起生效。
3. 要停止改写，选择“保留原模型名称”并保存。

“取消修改”只还原页面中的选择，不写入配置。“刷新模型列表”重新读取网关模型。已保存但不在模型列表中的名称仍会保留。

配置服务仅监听本机 `127.0.0.1`，访问凭据每次启动重新生成。关闭终端或按 Ctrl+C 即可结束服务；保存的配置不会因此丢失。再次启动后使用新打印的地址。

### 可选参数

| 参数 | 用途 | 默认值 |
| --- | --- | --- |
| `--magpie` | Magpie 可执行文件名称或路径 | `magpie`，也可通过 `MAGPIE_BIN` 指定 |
| `--gateway` | 本机 Magpie 网关地址 | `http://127.0.0.1:3425`，设置了 `MAGPIE_ADDR` 时使用该地址 |
| `--plugin` | 插件的安装名称或路径 | `magpie-middleware-response-model` |
| `--port` | 配置页面端口，0 表示自动分配 | `0` |

例如，网关使用其他端口：

```bash
node configure.mjs --gateway http://127.0.0.1:4000
```

如果插件通过本地目录安装，用 `--plugin` 指定添加插件时的路径。若网关需要访问密钥，可通过 `MAGPIE_CONFIG_API_KEY` 环境变量提供；密钥只用于读取模型列表，不写入插件配置或返回给页面。

页面从网关 `/v1/models` 读取模型列表，保存所选条目的完整 `id`，而不是显示名称。配置读取与保存均通过已有的 `magpie plugin options` 命令完成；保存时重新读取选项并保留其他字段。保存前发现模型字段发生变化时，页面会拒绝覆盖，并提示重新加载。

同一个配置服务会串行处理保存请求。请只运行一个配置服务，并避免同时使用外部 CLI 修改插件选项；读取与写入是两次 CLI 调用，无法保证这些并发操作不会互相覆盖。

## 直接配置 JSON

不使用独立页面时，也可以在 Magpie 的“插件 → 已安装 → 选项”中填写：

```json
{
  "model": "display-model"
}
```

`model` 可以是任意希望返回给客户端的名称，不要求它是实际可调用的模型。空字符串或仅含空白的字符串表示不改写。

以下命令适用于 Bash、WSL 或 Linux 终端：

```bash
magpie plugin options magpie-middleware-response-model '{"model":"display-model"}'
```

恢复原模型名称：

```bash
magpie plugin options magpie-middleware-response-model '{"model":""}'
```

## 支持的协议

插件同时处理流式响应的 `onEvent` 和非流式响应的 `onResponse`。

| 客户端 API | 改写的字段 |
| --- | --- |
| OpenAI Chat Completions | `model` |
| Anthropic Messages | `model`、流式事件中的 `message.model` |
| OpenAI Responses | `model`、流式事件中的 `response.model` |
| Gemini | `modelVersion` |

仅改写响应中已经存在的字符串字段，不给其他事件新增字段。响应正文、工具调用和用量字段不做修改。

## 边界

- 未配置名称、配置为空或配置类型不是字符串时，响应按原样返回。
- 非流式 HTTP 错误，以及插件识别到的错误对象和失败事件，按原样返回。
- Magpie 会将压缩响应原样放行，这些响应不会经过改写钩子。
- 客户端是否显示改后的名称，取决于它是否读取响应中的模型字段。
- Magpie 自己发起的内部请求不经过网关中间件。
- 配置页面需要本机 Magpie 网关已启动；读取列表失败时不会清除已有配置。

## 源码

- `response-model.middleware.js`：响应模型字段改写。
- `configure.mjs`：独立配置服务及 Magpie 命令调用。
- `config/`：配置页面。
- `package.json`：中间件入口及默认选项。

参考：[Magpie 插件开发文档](https://usemagpie.ai/docs/zh/plugins#middleware)。
