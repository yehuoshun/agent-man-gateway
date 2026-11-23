// 表面形式还原 = 判定前处理，入站与出站共用**同一份实现**（只在这里改）。
// 中转政策点名的规避手法是「拆字、谐音、编码、外语」：
//   拆字 / 字符间插入空白与标点 → normalizeForMatch（全折叠）与 normalizeKeepingWords（保留词边界）
//   编码（base64 / \uXXXX / \xNN / HTML 实体 / rot13）→ decodedVariants 解码出新变体再判
//   谐音与拼音（yueyu / pojia）→ homophoneize 做有限替换
// 全都只为一件事：让规则吃到"模型真正读到的那句话"，而不是攻击者写的那层皮。
// 归一化只用于判定，交给下游的仍是原文（一个字节都不动）。

const CJK = /[\u4e00-\u9fff]/

// 不可见字符：零宽空格/连接符、BOM、双向覆盖（\u202e 能让"exe"显示成"txt"）
export const INVISIBLE = /[\u200b-\u200f\u2060\ufeff\u202a-\u202e\u2066-\u2069]/g
// 中文字之间插入的空白与标点：压缩掉，直到不再变化（防"忽 ，略 ，之 ，前"这种连插）
const CJK_GAP = /([\u4e00-\u9fff])[\s，,、。．.;；:：!！?？~～\-—_|/\\]+(?=[\u4e00-\u9fff])/g
// 「i g n o r e」这种把单词拆成单字母的写法：还原成一个词（只动空白，不动中文字间标点）
const LETTER_GAP = /(?:^|\s)((?:[A-Za-z0-9]\s+){2,}[A-Za-z0-9])(?=\s|$)/g
// 「a，d，m，i，n」这种用中文标点拆拉丁字母的写法：先把标点抽掉再判
const PUNCT_GAP = /(?:[A-Za-z0-9][，,、。．;；：]){2,}[A-Za-z0-9]/g
// 压缩串：只留中文与字母数字（治「139 0013 8000」「139-0013-8000」这类插入分隔的写法）
const NON_WORD = /[^\u4e00-\u9fffa-zA-Z0-9]/g

// 归一化的共同起点：NFKC（全角拉丁 / 兼容字符）→ 剥不可见字符
function base(text) {
  return String(text ?? "").normalize("NFKC").replace(INVISIBLE, "")
}

// 全折叠：连词边界也不要。判定主串，用它吃掉「忽 略 之 前 的 指 令」「i g n o r e」这类拆字。
export function normalizeForMatch(text) {
  let t = base(text)
  let prev
  do {
    prev = t
    t = t.replace(CJK_GAP, "$1")
    t = t.replace(LETTER_GAP, (m, run) => m.replace(run, run.replace(/\s+/g, "")))
    t = t.replace(PUNCT_GAP, (m) => m.replace(/[，,、。．;；：]/g, ""))
  } while (t !== prev)
  return t
}

// 保留词边界的折叠：单空格 = 词内拆字（a c t → act），连续两格以上 = 词边界（a c t   a s → act as）。
// 少了这一路，带词边界的英文规则（如 jailbreakEn 的 `act as `）会被全折叠串绕过。
export function normalizeKeepingWords(text) {
  let t = base(text).replace(LETTER_GAP, (m, run) => {
    return run
      .split(/\s{2,}/)
      .map((word) => word.replace(/\s+/g, ""))
      .join(" ")
  })
  let prev
  do {
    prev = t
    t = t.replace(CJK_GAP, "$1")
    t = t.replace(PUNCT_GAP, (m) => m.replace(/[，,、。．;；：]/g, ""))
  } while (t !== prev)
  return t
}

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

// 返回「额外」的判定变体（不含传进来的那一串本身）。
// 不设名额：政策点名了编码规避，任何"前 4 个解出来的串"都可能被故意塞满来挤掉真变体。
export function decodedVariants(normalized) {
  const out = []
  const push = (v) => {
    const s = String(v ?? "")
    if (!s || s === normalized) return
    if (out.includes(s)) return
    out.push(s)
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

// 判定前处理的总入口：原文 → 一整套判定变体（入站、出站都只调这一个）。
// 顺序有意义：第 0 个永远是归一化主串（全折叠），其余是补充形态。
// **不做名额截断**：判定必须遍历「所有变体 × 所有规则」，命中即可拒。
export function matchVariants(text) {
  const out = []
  const add = (v) => {
    const s = String(v ?? "")
    if (s && !out.includes(s)) out.push(s)
  }

  const compact = normalizeForMatch(text)
  const words = normalizeKeepingWords(text)
  add(compact)
  add(words)
  add(compact.replace(NON_WORD, ""))
  add(words.replace(NON_WORD, ""))

  // 解码 / 谐音只在两种形态上各跑一次，解出来的串同样回归一化再收进来
  for (const seed of [compact, words]) {
    for (const d of decodedVariants(seed)) {
      const nd = normalizeForMatch(d)
      add(nd)
      add(normalizeKeepingWords(d))
      add(nd.replace(NON_WORD, ""))
    }
  }

  return out
}
