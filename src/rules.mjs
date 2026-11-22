// 规则表：所有阈值与正则集中在这里，调参只改这一个文件。
// 原则：入站不靠"识别坏话"拦截，靠"降级成数据"；出站才做确定性拦截。

export const LIMITS = {
  inboundChars: 4000,   // 单条入站超过就截断（截断要留标记，不许悄悄改内容）
  outboundChars: 12000, // 出站超过就拦（多半是上下文粘贴事故）
  urlsPerMessage: 5,    // 一条里超过 5 个链接只标出来，不自动取
}

// ---------- 入站 ----------
export const INBOUND = {
  // 指令性说法：只做标记 + 降级，不据此拦截（拦会漏，也会误伤正常讨论）
  instructionLike: /(忽略(?:上面|上面所有|之前|以上|前面)的?(?:所有)?(?:指令|设定|提示)|ignore\s+(?:all\s+)?(?:previous|above)\s+instructions|你现在是|从现在开始你是|开发者模式|developer\s+mode|jailbreak|把你的?(?:系统)?(?:提示词?|设定)(?:原文)?(?:打印|输出|念|复述)|repeat\s+your\s+system\s+prompt)/gi,
  // 身份声明：群里谁说都不算数，只记标记
  identityClaim: /(?:我是|这里是|本人是)\s*(?:管理员|群主|老板|主人)|(?:^|\s)(?:admin|owner)\s*[:：]/gi,
  urls: /https?:\/\/[^\s<>"'）)]+/gi,
  // 控制字符：NUL/退格这类会污染下游日志与终端
  control: /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,
  // 可信来源：只有这几种算"指令"，其余一律是"数据"
  trusted: new Set(["host", "self", "boss"]),
}

// ---------- 出站 ----------
export const OUTBOUND = {
  path: /(?:[A-Za-z]:[\\/][^\s"'<>|，。；）)]+)|(?:(?<=[\s（(])\/(?:d|mnt|home|tmp|users)\/[^\s"'<>|，。；）)]+)/gi,
  secret: /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
  bearer: /\bBearer\s+[A-Za-z0-9._-]{10,}/gi,
  phone: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // 公开场合硬拦：对全体喊话不是它能做的动作
  atAll: /@(?:全体成员|所有人|\ball\b|\beveryone\b)/g,
  // 只是标记，不当泄露处理（正常讨论里也会提到）
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
