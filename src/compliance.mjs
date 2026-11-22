// 内容合规闸：目的不是保护模型，是保护「中转 API 的账号」。
// 请求带着这类内容上行，上游按内容策略判定，封的是账号——所以命中就整条拒：
//   · 不做隔离块（隔离只是换个说法，原文照样上行）
//   · 不区分来源（boss 自己发的也拦，号是同一个号）
//   · 宁可错杀（少回一句是体验问题，漏一句可能是没号）
import { COMPLIANCE_BLOCK, COMPLIANCE_CUSTOM } from "./rules.mjs"

export const COMPLIANCE = COMPLIANCE_BLOCK

function entries() {
  return [...Object.entries(COMPLIANCE_BLOCK), ...COMPLIANCE_CUSTOM]
}

// 在传入的所有文本变体（归一化串 / 压缩串）上判，任一命中即返回
export function screenCompliance(text, variants) {
  const list = entries()
  for (const variant of variants && variants.length ? variants : [String(text ?? "")]) {
    for (const [key, re] of list) {
      re.lastIndex = 0
      const m = variant.match(re)
      re.lastIndex = 0
      if (m) return { hit: key, excerpt: String(m[0]).slice(0, 12) }
    }
  }
  return { hit: null, excerpt: "" }
}