// 入站：把外面进来的东西降级成数据。这里不做语义判断，只做三件事——
// 截断超长、剥控制字符、包进隔离块并标注来源与 trust。指令性说法只记标记，不拦。
import { INBOUND, LIMITS } from "./rules.mjs"

function escapeClose(text) {
  // 防止外部内容提前闭合隔离块（否则它就能"跳出"数据层）
  return text.replace(/<\/?外部内容/g, (m) => m.replace("<", "‹"))
}

export function screenInbound(input) {
  const raw = String(input?.text ?? "")
  const source = String(input?.source ?? "unknown")
  const trust = String(input?.trust ?? "untrusted")
  const flags = []

  if (!raw.trim()) return { verdict: "block", text: "", source, trust, flags: ["empty"] }

  let text = raw.replace(INBOUND.control, "")
  if (text.length !== raw.length) flags.push("control-chars-stripped")

  let truncated = false
  if (text.length > LIMITS.inboundChars) {
    text = text.slice(0, LIMITS.inboundChars)
    truncated = true
    flags.push("truncated")
  }

  const count = (re) => (text.match(re) ?? []).length

  const instruction = count(INBOUND.instructionLike)
  if (instruction) flags.push("instruction-like:" + instruction)
  const identity = count(INBOUND.identityClaim)
  if (identity) flags.push("identity-claim:" + identity)
  const urls = count(INBOUND.urls)
  if (urls) flags.push("url:" + urls)
  if (urls > LIMITS.urlsPerMessage) flags.push("url-flood")

  // 可信来源：不包隔离块，直接原样交出去（仍受过长度约束）
  if (INBOUND.trusted.has(trust)) {
    return { verdict: "pass", text, source, trust, flags, truncated }
  }

  const body = escapeClose(text)
  const wrapped = '<外部内容 source="' + source + '" trust="untrusted">\n' + body + "\n</外部内容>"
  return { verdict: "degrade", text: wrapped, source, trust, flags, truncated }
}
