// 入站：先拦，再降级。命中硬规则的整条不进上下文——拦了还带进去等于没拦。
// 文件优先判定：带附件的整条消息连文字一起拒（"文字+附件"是最省事的绕过口）。
//
// 判定一律在「归一化文本」上做：零宽字符、双向覆盖符、中文字之间插的空白与标点，
// 都是把正则打穿的经典手法（"忽 略 之 前 的 指 令" 模型照样读得懂，规则却一条也不中）。
// 归一化只用于判定，交给下游的仍然是原文——代码缩进、格式、emoji 一个字节都不动。
import { BLOCK_INBOUND, SUSPECT_INBOUND, LIMITS, TRUSTED } from "./rules.mjs"
import { screenFile } from "./file.mjs"

// 不可见字符：零宽空格/连接符、BOM、双向覆盖（\u202e 能让"exe"显示成"txt"）
const INVISIBLE = /[\u200b-\u200f\u2060\ufeff\u202a-\u202e\u2066-\u2069]/g
// 中文字之间插入的空白与标点：压缩掉，直到不再变化（防"忽 ，略 ，之 ，前"这种连插）
const CJK_GAP = /([\u4e00-\u9fff])[\s，,、。．.;；:：!！?？~～\-—_|/\\]+(?=[\u4e00-\u9fff])/g
// 「i g n o r e」这种把单词拆成单字母的写法：还原成一个词（只动空白，不动中文字间标点）
const LETTER_GAP = /(?:^|\s)((?:[A-Za-z0-9]\s+){2,}[A-Za-z0-9])(?=\s|$)/g
// 「a，d，m，i，n」这种用中文标点拆拉丁字母的写法：先把标点抽掉再判
const PUNCT_GAP = /(?:[A-Za-z0-9][，,、。．;；：]){2,}[A-Za-z0-9]/g

export function normalizeForMatch(text) {
  let t = String(text ?? "").normalize("NFKC").replace(INVISIBLE, "")
  t = t.replace(LETTER_GAP, (m, run) => m.replace(run, run.replace(/\s+/g, " ")))
  let prev
  do {
    prev = t
    t = t.replace(CJK_GAP, "$1")
    t = t.replace(LETTER_GAP, (m, run) => m.replace(run, run.replace(/\s+/g, "")))
    t = t.replace(PUNCT_GAP, (m) => m.replace(/[，,、。．;；：]/g, ""))
  } while (t !== prev)
  return t
}

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

  // 判定用归一化串，下游拿原文
  const text = normalizeForMatch(raw)
  if (text !== raw) {
    const hidden = (raw.match(INVISIBLE) ?? []).length
    flags.push("normalized")
    if (hidden) flags.push("invisible-chars:" + hidden)
  }

  if (!text.trim()) return { verdict: "block", text: "", source, trust, flags: ["empty"] }
  if (text.length > LIMITS.inboundChars) {
    return { verdict: "block", text: "", source, trust, flags: ["too-long:" + text.length] }
  }

  const urlCount = (text.match(SUSPECT_INBOUND.urls) ?? []).length
  if (urlCount > LIMITS.urlsPerMessage) {
    return { verdict: "block", text: "", source, trust, flags: ["url-flood:" + urlCount] }
  }

  // 硬拦：只回一个原因码，原文不往下传（连日志里也只用长度摘要）
  // 两路判定：归一化串 + 压缩串（去掉所有非字母数字，治 "t o k e n" 这种字母间插空格）。
  // 压缩串会打断英文词间空格，但英文规则在归一化串那一路照样命中，两者互补。
  const compact = text.replace(/[^\u4e00-\u9fffa-zA-Z0-9]/g, "")
  const variants = compact && compact !== text ? [text, compact] : [text]
  for (const variant of variants) {
    for (const [key, re] of Object.entries(BLOCK_INBOUND)) {
      re.lastIndex = 0
      const m = variant.match(re)
      re.lastIndex = 0
      if (m) {
        return {
          verdict: "block",
          text: "",
          source,
          trust,
          flags: ["blocked:" + key + ":" + m.length, ...flags.filter((f) => f !== "normalized")],
          excerpt: String(m[0]).slice(0, 12),
        }
      }
    }
  }

  const selfAsk = (text.match(SUSPECT_INBOUND.askAboutSelf) ?? []).length
  if (selfAsk) flags.push("ask-about-self:" + selfAsk)
  if (urlCount) flags.push("url:" + urlCount)

  // 可信来源：不包隔离块，原样交出去
  if (TRUSTED.has(trust)) {
    return { verdict: "pass", text: raw, source, trust, flags }
  }

  const wrapped = '<外部内容 source="' + source + '" trust="untrusted">\n' + escapeClose(raw) + "\n</外部内容>"
  return { verdict: "quarantine", text: wrapped, source, trust, flags }
}