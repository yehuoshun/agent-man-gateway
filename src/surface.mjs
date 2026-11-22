// 表面形式还原：中转政策点名的规避手法是「拆字、谐音、编码、外语」。
//   拆字 / 字符间插入 → inbound.mjs 的 normalizeForMatch 已经处理
//   编码（base64 / \uXXXX / \xNN / HTML 实体 / rot13）→ 这里解码出一条新变体再判
//   谐音与拼音（yueyu / pojia）→ 这里做有限替换
// 全都只为一件事：让规则吃到"模型真正读到的那句话"，而不是攻击者写的那层皮。

const CJK = /[\u4e00-\u9fff]/

// 拼音/同音替换：只收高危词的常见写法，宁缺毋滥（替换多了会把正常文本改烂）
const HOMOPHONE = [
  [/(?:yue\s*yu|yve\s*yu|yueyu)/gi, "越狱"],
  [/(?:po\s*jia|pojia)/gi, "破甲"],
  [/(?:wu\s*xian\s*zhi|wuxianzhi)/gi, "无限制"],
  [/(?:越域|越玉|阅狱)/g, "越狱"],
  [/(?:破夹|破钾)/g, "破甲"],
]

export function homophoneize(text) {
  let t = String(text ?? "")
  for (const [re, to] of HOMOPHONE) t = t.replace(re, to)
  return t
}

function printable(out) {
  if (!out) return false
  let ok = 0
  for (const ch of out) if (ch >= " " || ch === "\n" || ch === "\t") ok++
  return ok / out.length >= 0.9
}

function tryBase64(s) {
  const pad = s.length % 4 === 0 ? s : s + "=".repeat(4 - (s.length % 4))
  try {
    const out = Buffer.from(pad, "base64").toString("utf8")
    if (!printable(out)) return null
    // 解出来得有中文或成词英文，否则多半是巧合（比如一串普通字母）
    if (!CJK.test(out) && !/[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(out)) return null
    return out
  } catch {
    return null
  }
}

function rot13(s) {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })
}

function unescapeAll(s) {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
}

// 返回「额外」的判定变体（不含调用方已经有的归一化串）
export function decodedVariants(normalized) {
  const out = []
  const push = (v) => {
    const s = String(v ?? "")
    if (!s || s === normalized) return
    if (out.includes(s)) return
    if (out.length < 4) out.push(s)
  }

  // 1) 转义序列（\uXXXX / \xNN / HTML 实体）
  if (/\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}|&#x?[0-9a-fA-F]+;/i.test(normalized)) {
    push(unescapeAll(normalized))
  }

  // 2) base64 块（长度 >= 16，且以 = 结尾或解出来像话）
  for (const m of normalized.matchAll(/[A-Za-z0-9+/]{16,}={0,2}/g)) {
    const dec = tryBase64(m[0])
    if (dec) push(dec)
  }

  // 3) rot13（只在纯 ASCII 文本上试，中文无意义）
  if (!CJK.test(normalized) && /[A-Za-z]{4,}/.test(normalized)) push(rot13(normalized))

  // 4) 拼音/同音
  const homo = homophoneize(normalized)
  if (homo !== normalized) push(homo)

  return out
}