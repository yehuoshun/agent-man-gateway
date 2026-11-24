#!/usr/bin/env node
// 一次性进程：读参数、判一遍、打印、退出。不常驻、不联网、不写盘。
//
// 两种身份（design §8「插件契约」）：
// - 自己用：`inbound|outbound|file` 三个子命令，退 0 放行 / 1 拒 / 64 用法错；
// - 当 agent-man 的零件：无参答一行（只读）、`--describe` 报五个字段、stdout ≤8KB。
//   零件这一侧不许"跑起来才发现参数不对"：所以无参永远是只读的一行，不占任何写通道。
import {
  BLOCK_INBOUND, COMPLIANCE_BLOCK, COMPLIANCE_CUSTOM, COMPLIANCE_POLICY,
  PART, REPLY_BLOCK, TRUSTED, screenFile, screenInbound, screenOutbound,
} from "../src/index.mjs"

// design §8：退 64 是参数错、69 是缺依赖、75 是超时。网关没有外部依赖，69/75 用不上，
// 但用法错必须说 64——骨架据此把"调用方写错了"与"零件坏了"分开，不冤枉一个好零件。
const EXIT = { ok: 0, block: 1, usage: 64 }
// 骨架那边超过 8192 字节会截断并标 truncated；零件先自己守住这条线，别把截断权交出去。
const STDOUT_MAX = 8192

const argv = process.argv.slice(2)
const cmd = argv[0]

// 开关就这些：多余的位置参数、拼错的开关一律退 64。
// 之前 `--text` 后面紧跟开关时会把开关名当正文收下（`inbound --text --json` 的正文成了字面量
// `--json`，还 exit 0）——静默降级比报错贵得多，尤其在这种"看起来过了闸"的地方。
const KNOWN = new Set(["text", "file", "name", "mime", "bytes", "source", "trust", "json"])

const USAGE = "用法:\n" +
  "  agent-man-gateway                        （无参）只读答一行，给 agent-man 当零件用\n" +
  "  agent-man-gateway --describe              报五个字段，给 agent-man 当零件用\n" +
  "  agent-man-gateway inbound --text <文字> [--file <附件名>] [--source group:1] " +
  "[--trust untrusted|host|self|boss] [--json]\n" +
  "  agent-man-gateway file --name <附件名> [--mime <类型>] [--bytes <大小>] " +
  "[--source group:1] [--trust untrusted] [--json]\n" +
  "  agent-man-gateway outbound --text <文字> [--json]\n" +
  "\n" +
  "退出码：0 放行 / 1 拒 / 64 用法错。\n"

function usage(why) {
  if (why) process.stderr.write("! " + why + "\n")
  process.stderr.write(USAGE)
  process.exit(EXIT.usage)
}

function help() {
  process.stdout.write(USAGE)
  process.exit(EXIT.ok)
}

// 零件的无参答话：一行、只读、成本压在 30 以内（半角 0.28 / 全角 1.0，每行 +8）。
// 它只说"我在、我手里有几条规矩"，不替调用方判任何东西——判断要走 --text。
function senseLine() {
  const compliance = Object.keys(COMPLIANCE_BLOCK).length + COMPLIANCE_POLICY.length +
    COMPLIANCE_CUSTOM.length
  return "网关在：入站 " + Object.keys(BLOCK_INBOUND).length + " 条 · 合规 " + compliance +
    " 类 · 出站 " + Object.keys(REPLY_BLOCK).length + " 项"
}

function parse(rest) {
  const got = {}
  for (let i = 0; i < rest.length; i += 1) {
    const one = rest[i]
    if (!one.startsWith("--")) usage("多余的位置参数「" + one + "」")
    const key = one.slice(2)
    if (!KNOWN.has(key)) usage("不认识的开关「" + one + "」")
    if (key === "json") {
      got.json = true
      continue
    }
    const next = rest[i + 1]
    if (next === undefined || next.startsWith("--")) usage("--" + key + " 后面要跟一个值")
    got[key] = next
    i += 1
  }
  return got
}

// 一次判定的正文可能很长（隔离块里带着原文）。超了就把正文往下砍到装得下为止，
// 整体仍是合法 JSON，并如实标 truncated——截断了还装作完整，比截断本身更坏。
function jsonOf(result) {
  let out = JSON.stringify(result)
  if (Buffer.byteLength(out, "utf8") <= STDOUT_MAX) return out + "\n"
  let body = typeof result.text === "string" ? result.text : ""
  let keep = { ...result, truncated: true }
  while (Buffer.byteLength(JSON.stringify(keep), "utf8") > STDOUT_MAX && body.length > 0) {
    body = body.slice(0, body.length - Math.max(64, body.length >> 3))
    keep = { ...result, truncated: true, text: body }
  }
  return JSON.stringify(keep) + "\n"
}

function textOf(result) {
  // 人类分支也带 12 字摘要：拒绝时人要能一眼对上"是哪句话被拦的"，不必再翻 --json。
  const head = result.verdict + (result.flags?.length ? " [" + result.flags.join(" ") + "]" : "")
  let out = head + (result.excerpt ? " · " + result.excerpt : "") + "\n" + (result.text || "") + "\n"
  if (Buffer.byteLength(out, "utf8") <= STDOUT_MAX) return out
  let body = result.text || ""
  while (Buffer.byteLength(out, "utf8") > STDOUT_MAX - 24 && body.length > 0) {
    body = body.slice(0, body.length - Math.max(64, body.length >> 3))
    out = head + "\n" + body + "\n"
  }
  return out + "! 正文太长，这里截断了（要看全文用 --json 会给出 truncated 标记）\n"
}

if (cmd === undefined) {
  // 无参 = 只读的一行：骨架把它当"这个零件现在怎么说"。
  process.stdout.write(senseLine() + "\n")
  process.exit(EXIT.ok)
}
if (cmd === "--describe" || cmd === "describe") {
  if (argv.length > 1) usage("--describe 不带参数")
  process.stdout.write(JSON.stringify(PART) + "\n")
  process.exit(EXIT.ok)
}
if (cmd === "--help" || cmd === "-h" || cmd === "help") help()

const got = parse(argv.slice(1))
// 信任级别写错不许静默降级成 untrusted：调用方以为在走"本人直发"，实际被当外部内容包起来，
// 两边的行为差一整层，出错时没人会想到是这里拼错了。
if (got.trust !== undefined && got.trust !== "untrusted" && !TRUSTED.has(got.trust)) {
  usage("--trust 只认 untrusted / host / self / boss，拿到「" + got.trust + "」")
}
if (got.bytes !== undefined && !/^\d+$/.test(got.bytes)) {
  usage("--bytes 要写非负整数，拿到「" + got.bytes + "」")
}

let result
if (cmd === "inbound") {
  if (got.text === undefined && got.file === undefined) usage("inbound 至少要有 --text 或 --file")
  result = screenInbound({ text: got.text, file: got.file, source: got.source, trust: got.trust })
} else if (cmd === "file") {
  if (got.name === undefined) usage("file 要 --name")
  result = screenFile({ name: got.name, mime: got.mime, bytes: got.bytes, source: got.source, trust: got.trust })
} else if (cmd === "outbound") {
  if (got.text === undefined) usage("outbound 要 --text")
  result = screenOutbound({ text: got.text })
} else {
  usage("还不认识「" + cmd + "」")
}

process.stdout.write(got.json === true ? jsonOf(result) : textOf(result))
process.exit(result.verdict === "block" ? EXIT.block : EXIT.ok)
