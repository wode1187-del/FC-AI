# gemini 系图生图尺寸修复记录（款式上身 · 请求 2K/4K 却生成 1K）

> 适用模型：`gemini-nano-banana-2.1` / `nano-banana-2` / `nano-banana-pro`
> 现象：款式上身（双槽）请求 2K / 4K，生成结果却回落 1K 且比例变 1:1。
> 结论时间：2026-10-12 15:52 确认方案，2026-10-13 复现后回滚到该方案。

---

## 一、问题现象

- 用户在【款式上身】功能选择 gemini 系模型，请求 `2K · 3:4`（1792×2400）或 `4K · 3:4`（3584×4800）。
- 实际生成结果回落为 **1K、1:1**（约 896×1200 或 1024×1024）。
- 问题反复出现，用户多次反馈"又是之前那个问题"。

## 二、涉及链路

款式上身是**双槽**任务（图1衣服款式 + 图2模特底图），gemini 系走：

- 端点：`/chat/completions`（多模态，保证两张参考图都传给上游）
  - 说明：曾尝试走 `/images/generations`，但该中转对 generations 的多图 `images` 数组**只认第一张**，导致图2（模特底图）丢失，结果变成单图重绘，故双槽 gemini 固定走 chat 多模态。
- 尺寸参数：见下方"四、根因"。

## 三、排查过程（关键证据）

| 尝试方案 | 结果 |
|---|---|
| 顶层只发 `image_size:"2K"/"4K"` + `aspect_ratio` | 中转后台能记录显示"大小 3584x4800"，但转发上游 Gemini 时被静默忽略 → 仍 1K |
| 图生图按档位把模型名改为 `-4k/-2k` 后缀 | HTTP 503 `model_not_found`（该后缀模型不存在） |
| `response_format` 对象携带尺寸 | 致 3:4 变 1:1 |
| **图生图 chat 只发 `size` 像素字段** | ✅ **正确出 2K/4K**（中转只认 size 像素） |

决定性证据（日志，2026-10-12 15:52）：

```
chat body 尺寸参数: image_size=undefined aspect_ratio=undefined size="1792x2400"
```

即：**图生图 chat 端点只发 `size` 像素（如 "1792x2400"）即可出正确分辨率**。

## 四、根因

- 中转（`ai.t8star.org`）对 **chat/completions 图生图**只认 OpenAI 兼容的 **`size` 像素字段**（如 `1792x2400`）。
- **`image_size` / `aspect_ratio` / `generationConfig` / `extra_body` 等字段是文生图（images 接口）才用的**；在 chat 图生图端点，它们被上游静默忽略。
- 之前的代码在 google 分支**同时设置** `image_size` + `size`，且 chat 分支用 `if (image_size){三层} else if (size){...}` 二选一，导致 `image_size` 存在时走了被忽略的三层、`size` 像素被跳过 → 回落 1K。

## 五、最终修复方案（已落地）

`src/context/AppContext.tsx`，chat 分支（款式上身双槽 gemini）改为**只发 `size` 像素**：

```ts
// 图生图 chat/completions 端点：中转只认 size 像素字段（如 "1792x2400"），
// 不认 image_size/generationConfig/extra_body（image_size 仅文生图/images 接口用）。
const pm = task.ratio.match(/(\d+)\s*[x×X]\s*(\d+)/);   // "2K·3:4·1792×2400" → "1792x2400"
if (pm) {
  chatBody.size = `${pm[1]}x${pm[2]}`;
} else if (variant.body.size) {
  chatBody.size = variant.body.size;
}
```

- **不再发** `image_size` / `aspect_ratio` / `generationConfig` / `extra_body`。
- 直接从 `task.ratio` 解析像素，**不依赖** `variant.body.size`（避免该字段在 chat 分支读取为 undefined 的历史坑）。
- 文生图走 images 接口，仍用 `image_size` 档位词，不受影响。

## 六、影响范围与安全

- **只影响** 款式上身双槽 gemini 系（chat 端点）。
- gpt-image 走 edits 端点、文生图走 images 端点，均**不经过此分支**，不受影响。
- 已校验：`tsc` ✅、`vite build` ✅。

## 七、待验证

- 用户强刷（Ctrl+F5）后实测款式上身 gemini 选 2K。
- 预期日志：`chat body 尺寸参数:` 行 `image_size=undefined ... size="1792x2400"`（与 2026-10-12 15:52 成功日志一致）。
- 返回 `data[0].size` 应为 2K（1792×2400）。

## 八、经验沉淀（避免再犯）

1. **中转行为分场景**：同一中转，文生图认 `image_size` 档位词，图生图 chat 认 `size` 像素——两者不能混用。
2. **双槽 gemini 只能走 chat**：generations 多图会被中转只取第一张，丢图2，宁可用 chat（保证双图）配 size 像素。
3. **不要二选一**：尺寸字段组装避免 `if(image_size){}else if(size){}`，先确认中转认哪个字段，再决定发什么。
4. **改代码后必须强刷**：`AppContext.tsx` 属大上下文文件，vite 热更新有时不生效，需 Ctrl+F5 或重启 dev server 再测。
