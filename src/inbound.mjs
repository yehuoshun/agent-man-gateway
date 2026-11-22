// 入站：先拦，再降级。命中硬规则的整条不进上下文——拦了还带进去等于没拦。
// 文件优先判定：带附件的整条消息连文字一起拒（"文字+附件"是最省事的绕过口）。
import { BLOCK_INBOUND, SUSPECT_INBOUND, LIMITS, TRUSTED } from "./rules.mjs"
import { screenFile } from "./file.mjs"

function escapeClose(text) {
  // 防止外部内容提前闭合隔离块（否则它就能"跳出"数据层）
  return text.replace(/<\/?外部内容/g, (m) => m.replace("<", "‹"))
}

export function screenInbound(input) {
  const raw = String(input?.text ?? "")
  const source = String(input?.source ?? "unknown")
  const trust = String(input?.trust ?? "untrusted")
  const flags = []

  // 附件一律先拒：不看文件、不看同条的文字
  if (input?.file) {
    const f = screenFile({
      ...(typeof input.file === "object" ? input.file : { name: String(input.file) }),
      source,
      trust,
    })
    return { verdict: "block", text: "", source, trust, flags: f.flags, excerpt: f.excerpt }
  }

  if (!raw.trim()) return { verdict: "block", text: "", source, trust, flags: ["empty"] }
  if (raw.length > LIMITS.inboundChars) {
    return { verdict: "block", text: "", source, trust, flags: ["too-long:" + raw.length] }
  }

  const urlCount = (raw.match(SUSPECT_INBOUND.urls) ?? []).length
  if (urlCount > LIMITS.urlsPerMessage) {
    return { verdict: "block", text: "", source, trust, flags: ["url-flood:" + urlCount] }
  }

  // 硬拦：只回一个原因码，原文不往下传（连日志里也只用长度摘要）
  for (const [key, re] of Object.entries(BLOCK_INBOUND)) {
    re.lastIndex = 0
    const m = raw.match(re)
    re.lastIndex = 0
    if (m) {
      return {
        verdict: "block",
        text: "",
        source,
        trust,
        flags: ["blocked:" + key + ":" + m.length],
        excerpt: String(m[0]).slice(0, 12),
      }
    }
  }

  const text = raw

  const selfAsk = (text.match(SUSPECT_INBOUND.askAboutSelf) ?? []).length
  if (selfAsk) flags.push("ask-about-self:" + selfAsk)
  if (urlCount) flags.push("url:" + urlCount)

  // 可信来源：不包隔离块，原样交出去
  if (TRUSTED.has(trust)) {
    return { verdict: "pass", text, source, trust, flags }
  }

  const wrapped = '<外部内容 source="' + source + '" trust="untrusted">\n' + escapeClose(text) + "\n</外部内容>"
  return { verdict: "quarantine", text: wrapped, source, trust, flags }
}
