# Magpie 响应模型名称插件

用于改写 Magpie 返回给客户端的模型名称的网关中间件。

例如，实际由模型 `actual-model` 生成回复，客户端收到的响应可以显示为 `display-model`。插件只修改响应中的模型字段，实际调用的模型、请求内容与路由保持不变。

## 安装

需要使用支持网关中间件的 Magpie。插件尚未发布到 npm，可直接从 GitHub 添加：

```bash
magpie plugin add github:sailliu/magpie-middleware-response-model
```

也可以在 Magpie 的“插件 → 添加插件”中输入：

```text
github:sailliu/magpie-middleware-response-model
```

本地开发时，可以添加克隆后的目录：

```bash
git clone https://github.com/sailliu/magpie-middleware-response-model.git
magpie plugin add ./magpie-middleware-response-model
```

## 配置

### 在界面中配置

进入“插件 → 已安装”，找到本插件，点击“选项”。

普通 JSON 编辑器中填写并保存：

```json
{
  "model": "display-model"
}
```

`model` 是希望返回给客户端的模型名称，不要求它是实际可调用的模型 ID。空字符串或仅含空白的字符串表示不改写。

保存后从下一次请求起生效。已有的流式请求会继续使用其开始时的配置。

### 下拉框选择

本插件在 `package.json` 中声明了：

```json
{
  "magpie": {
    "optionsModel": "model"
  }
}
```

**下拉框需要 Magpie 主程序支持 `magpie.optionsModel`。本仓库只包含插件，不包含对 Magpie 主程序的界面改动。仅安装本插件不会给普通 JSON 编辑器增加下拉框。**

使用包含这项界面改动的 Magpie 时，可在本插件的“选项”里搜索并选择模型，然后点击“保存”。下拉框保存所选模型的 ID，而不是显示名称。选择“保留原模型名称”后保存，可停止改写。

### 命令行配置

以下命令适用于 Bash、WSL 或 Linux 终端：

```bash
magpie plugin options github:sailliu/magpie-middleware-response-model '{"model":"display-model"}'
```

恢复原模型名称：

```bash
magpie plugin options github:sailliu/magpie-middleware-response-model '{"model":""}'
```

## 支持的协议

插件同时处理流式响应的 `onEvent` 和非流式响应的 `onResponse`。

| 客户端 API | 改写的字段 |
| --- | --- |
| OpenAI Chat Completions | `model` |
| Anthropic Messages | `model`、流式事件中的 `message.model` |
| OpenAI Responses | `model`、流式事件中的 `response.model` |
| Gemini | `modelVersion` |

仅改写响应中已经存在的字符串字段，不会给原本没有模型字段的事件添加字段。响应正文、工具调用和用量字段不做修改。

## 边界

- 未配置名称、配置为空或配置类型不是字符串时，响应按原样返回。
- 非流式 HTTP 错误，以及插件识别到的错误对象和失败事件，按原样返回。
- Magpie 会将压缩响应原样放行，这些响应不会经过改写钩子。
- 客户端是否显示改后的名称，取决于它是否读取响应中的模型字段。
- Magpie 自己发起的内部请求不经过网关中间件。

## 源码

- `response-model.middleware.js`：响应模型字段改写逻辑。
- `package.json`：中间件入口、默认选项与下拉框字段声明。

参考：[Magpie 插件开发文档](https://usemagpie.ai/docs/zh/plugins#middleware)。
