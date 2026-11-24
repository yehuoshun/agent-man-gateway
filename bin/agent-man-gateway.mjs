#!/usr/bin/env node
// 一次性进程：读参数、判一遍、打印、退出。不常驻、不联网、不写盘。
import { screenInbound, screenOutbound, screenFile, TRUSTED } from "../src/index.mjs"

const argv = process.argv.slice(2)
const cmd = argv[0]

// 开关就这些：多余的位置参数、拼错的开关一律退 2。
// 之前 `--text` 后面紧跟开关时会把开关名当正文收下（`inbound --text --json` 的正文成了字面量
// `--json`，还 exit 0）——静默降级比报错贵得多，尤其在这种"看起来过了闸"的地方。
const KNOWN = new Set(["text", "file", "name", "mime", "bytes", "source", "trust", "json"])

function usage(why) {
  if (why) process.stderr.write("! " + why + "\n")
  process.stderr.write("用法:\n" +
    "  agent-man-gateway inbound --text <文字> [--file <附件名>] [--source group:1] " +
    "[--trust untrusted|host|self|boss] [--json]\n" +
    "  agent-man-gateway file --name <附件名> [--mime <类型>] [--bytes <大小>] " +
    "[--source group:1] [--trust untrusted] [--json]\n" +
    "  agent-man-gateway outbound --text <文字> [--json]\n")
  process.exit(2)
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

if (cmd === undefined) usage()
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

if (got.json === true) {
  process.stdout.write(JSON.stringify(result) + "\n")
} else {
  // 人类分支也带 12 字摘要：拒绝时人要能一眼对上"是哪句话被拦的"，不必再翻 --json。
  const head = result.verdict + (result.flags?.length ? " [" + result.flags.join(" ") + "]" : "")
  process.stdout.write(head + (result.excerpt ? " · " + result.excerpt : "") + "\n" + (result.text || "") + "\n")
}
process.exit(result.verdict === "block" ? 1 : 0)
