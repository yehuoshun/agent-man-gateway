// 规则表：阈值与正则集中在这里，调参只改这一个文件。
// 口径：入站先拦后降级；出站一刀切——回复里命中任何一条就不发，不打码、不改写。

export const LIMITS = {
  inboundChars: 4000,   // 单条入站超过就拒（超长本身就是攻击形态）
  urlsPerMessage: 5,    // 一条里超过 5 个链接直接拒
  outboundChars: 12000, // 回复超长直接不发（多半是上下文粘贴事故）
}

// ---------- 文件：先一律拒 ----------
// 解析文档是最大的注入面，现阶段不接任何附件：不进上下文、不抽文本、不看文件名。
// 将来要收 boss 自己的文件，改 accept: true 并加来源白名单，别在其他地方开特例。
export const FILES = {
  accept: false,
  maxBytes: 0,
}

// ---------- 入站：硬拦 ----------
// 命中即拒，整条不交给模型。宁可错杀，也不让这些字进上下文。
export const BLOCK_INBOUND = {
  override: /(忽略(?:上面|上面所有|之前|以上|前面)的?(?:所有)?(?:指令|设定|提示|规则)|ignore\s+(?:all\s+)?(?:previous|above)\s+instructions|你现在是|从现在开始你是|开发者模式|developer\s+mode|jailbreak|越狱模式)/gi,
  exfiltrate: /(把你的?(?:系统)?(?:提示词?|设定|规则)(?:原文)?(?:打印|输出|念|复述|发出来)|repeat\s+your\s+system\s+prompt|你(?:记住|存)的(?:东西|内容|记忆)(?:念|说|打印)|把(?:配置|token|密钥|钥匙|密码)(?:发|给|说)(?:出来|我))/gi,
  privilege: /(帮我|替我|代我)(?:发(?:个|一条)?(?:公告|消息|文件)|拉(?:人|群)|踢(?:人|了)|转账|付款|解绑|注销|改(?:密码|绑定)|删除|删掉)/g,
  impersonate: /(?:我是|我是你们|本人是)\s*(?:管理员|群主|老板|主人)|(?:^|\s)(?:admin|owner)\s*[:：]/gi,
  bypass: /(?:不要|别)(?:再)?(?:遵守|管|理)(?:你的)?(?:规则|设定|限制|提示)|(?:没有|去(?:掉|除))(?:任何)?限制/g,
  control: /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,
}

// ---------- 入站：可疑但放行 ----------
export const SUSPECT_INBOUND = {
  urls: /https?:\/\/[^\s<>"'）)]+/gi,
  askAboutSelf: /(?:你是谁|你是(?:什么|哪个)(?:模型|ai|机器人)|谁做的你|你(?:的)?(?:设定|提示词)是什么)/gi,
}

// 可信来源：只有这几种算"指令"，其余一律是"数据"
export const TRUSTED = new Set(["host", "self", "boss"])

// ---------- 出站：回复过滤（命中任何一条就不发）----------
// 不打码、不改写、不猜意图。要么原样发，要么不发。
export const REPLY_BLOCK = {
  credential: /(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._-]{10,})/g,
  localPath: /(?:[A-Za-z]:[\\/]|\/(?:d|mnt|home|tmp|users)\/)/g,
  phone: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  atAll: /@(?:全体成员|所有人|\ball\b|\beveryone\b)/g,
  systemPrompt: /(?:(?:我的|这是)(?:系统提示|设定|指令原文))|(?:system\s+prompt\s*[:：])/gi,
  promise: /(?:我(?:可以)?保证|一定能|百分之百|绝对没问题|包过)/g,
  privilege: /(?:我|帮你?|替你?)(?:去)?(?:发(?:个|一条)?公告|拉人进群|转账|付款|改密码)/g,
  insult: /(?:你他妈|滚蛋|傻[逼比]|废物东西)/g,
}
