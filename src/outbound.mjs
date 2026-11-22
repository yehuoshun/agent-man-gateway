// 出站：确定性闸门。两件事——过滤能不能发（打码/拦截）、过滤是不是答非所问。
// 场合决定默认值：public 拦不住就拒；private 拦不住也拒，但只在答非所问上放宽。
import { OUTBOUND, LIMITS, MASK, relatedness } from "./rules.mjs"

const ACK = /^(?:好|好的|嗯|嗯嗯|行|可以|收到|明白|好嘞|ok|okay|yes|no|对|是的)[。.!！~ ]*$/i

export function screenOutbound(input) {
  const scope = input?.scope === "public" ? "public" : "private"
  const anchor = input?.anchor
  let text = String(input?.text ?? "")
  const flags = []

  if (!text.trim()) return { verdict: "block", text: "", scope, flags: ["empty"] }
  if (text.length > LIMITS.outboundChars) {
    return { verdict: "block", text: "", scope, flags: ["too-long:" + text.length] }
  }

  // 相关性：回复接没接住被回复的那句话（短应答豁免）
  const plain = text.replace(/\s/g, "")
  if (anchor && plain.length > LIMITS.shortReplyChars && !ACK.test(plain)) {
    const score = relatedness(text, anchor)
    if (score < LIMITS.minRelevance) {
      if (scope === "public") return { verdict: "block", text: "", scope, flags: ["off-topic:" + score.toFixed(2)] }
      flags.push("warn:off-topic:" + score.toFixed(2))
    } else {
      flags.push("related:" + score.toFixed(2))
    }
  }

  // 公开场合的硬拦：这些不是"打码能救"的东西
  OUTBOUND.atAll.lastIndex = 0
  if (OUTBOUND.atAll.test(text)) {
    OUTBOUND.atAll.lastIndex = 0
    if (scope === "public") return { verdict: "block", text: "", scope, flags: ["blocked:atAll"] }
    flags.push("warn:atAll")
  }
  OUTBOUND.atAll.lastIndex = 0

  for (const key of ["secret", "bearer", "path", "phone", "email"]) {
    const hits = text.match(OUTBOUND[key])
    if (!hits) continue
    text = text.replace(OUTBOUND[key], MASK[key])
    flags.push("masked:" + key + ":" + hits.length)
  }

  for (const key of ["sysPromptHint", "promise"]) {
    const hits = text.match(OUTBOUND[key])
    if (hits) flags.push("flagged:" + key + ":" + hits.length)
  }

  const verdict = flags.some((f) => f.startsWith("masked:")) ? "redact" : "pass"
  return { verdict, text, scope, flags }
}
