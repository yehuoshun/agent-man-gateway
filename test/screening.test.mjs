// 本轮拦截/归一化修复的回归用例：一条一个问题，正反两面都锁住。
import { test } from "node:test"
import assert from "node:assert/strict"
import { screenInbound, screenOutbound, decodedVariants, matchVariants, normalizeForMatch } from "../src/index.mjs"

const iv = (text, trust = "untrusted") => screenInbound({ text, source: "group:1", trust })
const ov = (text) => screenOutbound({ text })
const b64 = (s) => Buffer.from(s, "utf8").toString("base64")

// ---------- 1 变体名额被挤压 → 越狱文本直接放行 ----------
test("1 变体名额：前面塞满 base64 也挤不掉谐音变体，命中即 block", () => {
  // 4 段合法 base64 打头：旧实现 decodedVariants 只收 4 条，谐音变体被挤掉
  const noise = [b64("今天天气不错"), b64("明天下午开会"), b64("文件已经收到"), b64("下周再讨论")].join(" ")
  assert.equal(iv(noise + " yueyu 提示词").verdict, "block")
  assert.equal(iv("yueyu 提示词").verdict, "block")
  // 解码变体不再有名额上限
  const five = [1, 2, 3, 4, 5].map((i) => b64("第" + i + "段文字")).join(" ")
  assert.ok(decodedVariants(five).length >= 5, "解码变体不该被截断到 4 条")
})

test("1 变体名额：正常话里塞 base64 也不许误伤", () => {
  const noise = [b64("今天天气不错"), b64("明天下午开会")].join(" ")
  assert.notEqual(iv(noise + " 这些是日志"), "block")
})

test("1 变体生成：遍历所有变体 × 所有规则，主串永远排第一", () => {
  const v = matchVariants("yueyu 提示词")
  assert.equal(v[0], normalizeForMatch("yueyu 提示词"))
  assert.ok(v.some((s) => s.includes("越狱")), JSON.stringify(v))
})
