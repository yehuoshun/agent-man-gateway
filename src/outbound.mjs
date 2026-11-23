// 出站：一刀切。回复里命中任何一条过滤规则就不发——不打码、不改写、不猜意图。
// 简单粗暴的理由：打码会把一句本来该拦的话变成"看起来能发"的话，留个半成品出去比不发更危险。
//
// 判定前处理与入站共用同一份（surface.mjs）：繁简、拆字、编码、谐音在这里一样要吃透，
// 否则「入站拦得住、出站照样发出去」——回复里带违规内容，封的也是同一个账号。
// 唯一仍按**原文**量的是长度：归一化只用于判定，不是压缩放行的凭证。
import { REPLY_BLOCK, LIMITS } from "./rules.mjs"
import { screenCompliance } from "./compliance.mjs"
import { matchVariants } from "./surface.mjs"

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

  // 判定变体：与入站同一个入口，不设名额，所有变体 × 所有规则
  const variants = matchVariants(text)
  const flags = []
  if (variants[0] !== text) flags.push("normalized")

  // 回复里带违规内容，发到微信/QQ 一样会把平台账号搭进去——先判合规
  const compliance = screenCompliance(variants[0], variants)
  if (compliance.hit) {
    return { verdict: "block", text: "", flags: ["compliance:" + compliance.hit, ...flags], excerpt: compliance.excerpt }
  }

  for (const variant of variants) {
    for (const [key, re] of Object.entries(REPLY_BLOCK)) {
      re.lastIndex = 0
      const hits = variant.match(re)
      re.lastIndex = 0
      if (hits) {
        return {
          verdict: "block",
          text: "",
          flags: ["blocked:" + key + ":" + hits.length, ...flags],
          excerpt: String(hits[0]).slice(0, 12),
        }
      }
    }
  }

  for (const m of text.matchAll(CANDIDATE)) {
    const s = m[0]
    if (PURE_HEX.test(s)) continue
    if (shannon(s) >= LIMITS.entropyBits) {
      return { verdict: "block", text: "", flags: ["high-entropy:" + s.length] }
    }
  }

  return { verdict: "pass", text, flags }
}
