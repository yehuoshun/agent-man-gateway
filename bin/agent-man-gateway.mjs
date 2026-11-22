#!/usr/bin/env node
// 一次性进程：读参数、判一遍、打印、退出。不常驻、不联网、不写盘。
import { screenInbound, screenOutbound } from "../src/index.mjs"

const argv = process.argv.slice(2)
const cmd = argv[0]
const flag = (name) => {
  const i = argv.indexOf("--" + name)
  return i === -1 ? undefined : argv[i + 1]
}
const has = (name) => argv.includes("--" + name)

function usage() {
  process.stderr.write("用法:\n  agent-man-gateway inbound --text <文字> [--source group:1] [--trust untrusted|boss|host|self] [--json]\n  agent-man-gateway outbound --text <文字> [--scope public|private] [--json]\n")
  process.exit(2)
}

const text = flag("text")
if (!cmd || text === undefined) usage()

let result
if (cmd === "inbound") {
  result = screenInbound({ text, source: flag("source"), trust: flag("trust") })
} else if (cmd === "outbound") {
  result = screenOutbound({ text, scope: flag("scope") })
} else usage()

if (has("json")) {
  process.stdout.write(JSON.stringify(result) + "\n")
} else {
  process.stdout.write(result.verdict + (result.flags.length ? " [" + result.flags.join(" ") + "]" : "") + "\n" + result.text + "\n")
}
process.exit(result.verdict === "block" ? 1 : 0)
