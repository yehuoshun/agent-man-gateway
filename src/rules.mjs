// 规则表：阈值与正则集中在这里，调参只改这一个文件。
// 口径：入站该拦就拦（拦掉的整条不进上下文），出站除了打码还要过滤答非所问。
import { relatedness } from "./relevance.mjs"

export const LIMITS = {
  inboundChars: 4000,    // 单条入站超过就拒（不是截断——超长本身是攻击形态）
  outboundChars: 12000,  // 出站超过就拒（多半是上下文粘贴事故）
  urlsPerMessage: 5,     // 一条里超过 5 个链接直接拒
  minRelevance: 0.15,    // 出站回复要覆盖被回复内容的至少 15%（二元组覆盖率）
  shortReplyChars: 8,    // 短应答（好/收到/行）不做相关性检查
}

// ---------- 入站：硬拦 ----------
// 命中即拒，整条不交给模型。宁可错杀，也不让这些字进上下文。
export const BLOCK_INBOUND = {
  // 指令覆盖：试图改写它的行为
  override: /(忽略(?:上面|上面所有|之前|以上|前面)的?(?:所有)?(?:指令|设定|提示|规则)|ignore\s+(?:all\s+)?(?:previous|above)\s+instructions|你现在是|从现在开始你是|开发者模式|developer\s+mode|jailbreak|越狱模式)/gi,
  // 套取：要系统提示、要记忆、要配置
  exfiltrate: /(把你的?(?:系统)?(?:提示词?|设定|规则)(?:原文)?(?:打印|输出|念|复述|发出来)|repeat\s+your\s+system\s+prompt|你(?:记住|存)的(?:东西|内容|记忆)(?:念|说|打印)|把(?:配置|token|密钥|钥匙|密码)(?:发|给|说)(?:出来|我))/gi,
  // 越权动作：让它代替账号做事
  privilege: /(帮我|替我|代我)(?:发(?:个|一条)?(?:公告|消息|文件)|拉(?:人|群)|踢(?:人|了)|转账|付款|解绑|注销|改(?:密码|绑定))/g,
  // 冒充身份
  impersonate: /(?:我是|我是你们|本人是)\s*(?:管理员|群主|老板|主人)|(?:^|\s)(?:admin|owner)\s*[:：]/gi,
  // 告诉它"不要遵守规则"
  bypass: /(?:不要|别)(?:再)?(?:遵守|管|理)(?:你的)?(?:规则|设定|限制|提示)|(?:没有|去(?:掉|除))(?:任何)?限制/g,
  control: /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,
}

// ---------- 入站：可疑但放行 ----------
// 只记标记、包隔离块，不拒。用于"可能是正常讨论"的信号。
export const SUSPECT_INBOUND = {
  urls: /https?:\/\/[^\s<>"'）)]+/gi,
  askAboutSelf: /(?:你是谁|你是(?:什么|哪个)(?:模型|ai|机器人)|谁做的你|你(?:的)?(?:设定|提示词)是什么)/gi,
}

// 可信来源：只有这几种算"指令"，其余一律是"数据"
export const TRUSTED = new Set(["host", "self", "boss"])

// ---------- 出站 ----------
export const OUTBOUND = {
  path: /(?:[A-Za-z]:[\\/][^\s"'<>|，。；）)]+)|(?:(?<=[\s（(])\/(?:d|mnt|home|tmp|users)\/[^\s"'<>|，。；）)]+)/gi,
  secret: /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
  bearer: /\bBearer\s+[A-Za-z0-9._-]{10,}/gi,
  phone: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // 公开场合硬拦：对全体喊话不是它能做的动作
  atAll: /@(?:全体成员|所有人|\ball\b|\beveryone\b)/g,
  // 只是标记，不当泄露处理
  sysPromptHint: /(?:系统提示|system\s+prompt)\s*(?:原文|[:：])/gi,
  promise: /(?:我(?:可以)?保证|一定能|百分之百|100%没问题|绝对没问题|包过)/g,
}

export const MASK = {
  path: "「本地路径」",
  secret: "「凭据」",
  bearer: "「凭据」",
  phone: "「手机号」",
  email: "「邮箱」",
}

export { relatedness }
