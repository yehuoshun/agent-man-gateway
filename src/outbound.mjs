// 出站：一刀切。回复里命中任何一条过滤规则就不发——不打码、不改写、不猜意图。
// 简单粗暴的理由：打码会把一句本来该拦的话变成"看起来能发"的话，留个半成品出去比不发更危险。
import { REPLY_BLOCK, LIMITS } from "./rules.mjs"

export function screenOutbound(input) {
  const text = String(input?.text ?? "")

  if (!text.trim()) return { verdict: "block", text: "", flags: ["empty"] }
  if (text.length > LIMITS.outboundChars) {
    return { verdict: "block", text: "", flags: ["too-long:" + text.length] }
  }

  for (const [key, re] of Object.entries(REPLY_BLOCK)) {
    re.lastIndex = 0
    const hits = text.match(re)
    re.lastIndex = 0
    if (hits) return { verdict: "block", text: "", flags: ["blocked:" + key + ":" + hits.length] }
  }

  return { verdict: "pass", text, flags: [] }
}
