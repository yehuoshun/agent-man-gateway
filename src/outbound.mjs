// 出站：确定性闸门。两种场合两套默认值——
// public（群聊/公开）拦不住就拒；private（一对一）拦不住放行，但打码并记日志。
import { OUTBOUND, LIMITS, MASK } from "./rules.mjs"

const HARD = ["atAll"]

export function screenOutbound(input) {
  const scope = input?.scope === "public" ? "public" : "private"
  let text = String(input?.text ?? "")
  const flags = []

  if (!text.trim()) return { verdict: "block", text: "", scope, flags: ["empty"] }
  if (text.length > LIMITS.outboundChars) {
    return { verdict: "block", text: "", scope, flags: ["too-long:" + text.length] }
  }

  // 公开场合的硬拦：这些不是"打码能救"的东西
  for (const key of HARD) {
    if (OUTBOUND[key].test(text)) {
      OUTBOUND[key].lastIndex = 0
      if (scope === "public") return { verdict: "block", text: "", scope, flags: ["blocked:" + key] }
      flags.push("warn:" + key)
    }
    OUTBOUND[key].lastIndex = 0
  }

  // 打码类：凭据、路径、手机号、邮箱
  for (const key of ["secret", "bearer", "path", "phone", "email"]) {
    const hits = text.match(OUTBOUND[key])
    if (!hits) continue
    text = text.replace(OUTBOUND[key], MASK[key])
    flags.push("masked:" + key + ":" + hits.length)
  }

  // 标记类：不拦，只记账
  for (const key of ["sysPromptHint", "promise"]) {
    const hits = text.match(OUTBOUND[key])
    if (hits) flags.push("flagged:" + key + ":" + hits.length)
  }

  const verdict = flags.some((f) => f.startsWith("masked:")) ? "redact" : "pass"
  return { verdict, text, scope, flags }
}
