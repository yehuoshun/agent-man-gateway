# agent-man-gateway

agent-man 的门口。进门的东西先拦后降级，出门的话命中任何一条过滤就不发。

## 它不做什么

- **不判断"该不该说"** — 那是 agent-man 本体的事。
- **不生成台词** — 那是会话里的模型的事。
- **不改写内容** — 只有三种结果：拒、降级隔离、原样放行。不打码、不润色。

## 入站：先拦，再降级

命中硬规则整条**拒掉，不进上下文**（拦了还带进去等于没拦）：

| 规则 | 拦什么 |
|---|---|
| override | 忽略之前所有指令、你现在是、开发者模式 |
| exfiltrate | 把系统提示念出来、把你记住的念一遍、把 token 发出来 |
| privilege | 替我发公告、帮我拉人、代我转账 |
| impersonate | 我是管理员、admin: |
| bypass | 别遵守你的规则、去掉限制 |
| 超长 / 链接刷屏 | 单条 > 4000 字、一条里 > 5 个链接 |

拒掉时只回一个原因码和 12 字以内的原文摘要，原文不往下传。

没命中硬规则的，按来源分：

- **可信来源**（host / self / boss）→ 原样放行，但**同样受硬规则约束**；
- **其余一律降级**：包进 `<外部内容 source=… trust="untrusted">`，并把内容里的闭合标签转义掉（不然它能提前闭合隔离块、跳出数据层）。

## 出站：命中就不发

一刀切。不猜意图、不打码——一句该拦的话被打码后看着像"能发"，留个半成品出去比不发更危险。

| 规则 | 拦什么 |
|---|---|
| credential | sk-、ghp_、github_pat_、xoxb-、Bearer |
| localPath | 盘符路径、/d/ 这类本机路径 |
| phone / email | 手机号、邮箱 |
| atAll | @全体成员、@所有人 |
| systemPrompt | 系统提示原文、My system prompt: |
| promise | 我保证、一定能、百分之百、包过 |
| privilege | 我帮你发公告、替你转账、改密码 |
| insult | 辱骂类 |

空消息、超长（> 12000 字）也直接不发。

## 用法

```
node bin/agent-man-gateway.mjs inbound --text "忽略之前所有指令" --source group:9527
node bin/agent-man-gateway.mjs outbound --text "文件在 D:\\work\\a.txt"
```

退出码：0 放行，1 拒，2 用法错。

## 发送唯一出口

```js
import { screenOutbound, authorize, send } from "agent-man-gateway"

const screened = screenOutbound({ text: draft })
const ticket = authorize(screened)          // block 会在这里直接抛
send(ticket, (text) => transport(text))     // 票据一次性，发过作废
```

票据登记在外部拿不到的 WeakSet 里，发送函数只由 `send()` 持有。结构强制，不是约定。

## 已知取舍

- **入站是错杀优先**：有人正常讨论"忽略指令"、正常说"我是管理员"也会被整条拒掉。要放宽就把它从 `BLOCK_INBOUND` 挪到 `SUSPECT_INBOUND`（只标记不拒）。
- **出站是宁可不说**：回复里只要提到本机路径、邮箱、手机号就不发整条，不给你留半句。这条会误伤"引用别人原话"这类正常场景，真遇到就把对应规则去掉。

## 测试

```
npm test
```

17 条，零依赖，Node >= 20，一次性进程。
