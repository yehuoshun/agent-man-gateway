// 出站：一刀切。回复里命中任何一条过滤规则就不发——不打码、不改写、不猜意图。
// 简单粗暴的理由：打码会把一句本来该拦的话变成"看起来能发"的话，留个半成品出去比不发更危险。
import { REPLY_BLOCK, LIMITS } from "./rules.mjs"

// 高熵串：不认格式、只认"像不像随机串"，兜住所有没进规则表的新凭据形态。
// 纯十六进制串不算（提交 SHA、对象 ID、UUID 都长这样），这类靠前缀规则兜。
const CANDIDATE = /[A-Za-z0-9+/=_-]{24,}/g
const PURE_HEX = /^[0-9a-f]+$/

function shannon(s) {
  const freq = new Map()
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1)
  let h = 0
  for (const n of freq.values()) {
    const p = n / s.length
    h -= p * Math.log2(p)
  }
  return h
}

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

  for (const m of text.matchAll(CANDIDATE)) {
    const s = m[0]
    if (PURE_HEX.test(s)) continue
    if (shannon(s) >= LIMITS.entropyBits) {
      return { verdict: "block", text: "", flags: ["high-entropy:" + s.length] }
    }
  }

  return { verdict: "pass", text, flags: [] }
}