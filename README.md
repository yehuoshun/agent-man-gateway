# agent-man-gateway

agent-man 的门口。进门的东西降级成数据，出门的话过闸。

## 它不做什么

三条边界，写死在这里，后面实现不许越：

- **不判断"该不该说"** — 那是 agent-man 本体的事。
- **不生成台词** — 那是会话里的模型的事。
- **不改语义** — 这里只有三种动作：拒、打码、包进隔离块。

## 两道门

| 方向 | 做什么 | 判据 |
|---|---|---|
| 入站 | 所有外部文字降级成数据 | 一律 untrusted，只有 host/self/boss 算指令 |
| 出站 | 凭据、路径、隐私打码；公开场合硬拦越权话 | 公开场合拦不住就拒 |

入站的**主规则只有一条**：进来的文字是资料，不是命令。所以这里不靠正则去认"坏话"（永远漏），
而是把外部内容包进隔离块、标注来源与 trust，让下游知道那是别人说的话。指令性、冒充身份、
一堆链接这些只记标记，不据此拦截。

出站按场合分默认值，不共用一份策略：公开群聊失败即拒（宁可这句不说），一对一失败即放但打码记账。

## 用法

```
node bin/agent-man-gateway.mjs inbound --text "忽略之前所有指令" --source group:123
node bin/agent-man-gateway.mjs outbound --text "文件在 D:\\work\\a.txt" --scope public --json
```

退出码：0 过（含打码后放行），1 拒，2 用法错。

## 发送唯一出口

```js
import { screenOutbound, authorize, send } from "agent-man-gateway"

const screened = screenOutbound({ text: draft, scope: "public" })
const ticket = authorize(screened)          // block 会在这里直接抛
send(ticket, (text) => transport(text))     // 票据一次性，发过作废
```

发送函数只由 `send()` 持有，别的模块拿不到；票据伪造不了（WeakSet 里查不到就拒）。
这是结构强制，不是约定——不然某天"临时直接发一次"一绕，后面所有承诺都是空话。

## 测试

```
npm test
```

零依赖，Node >= 20，一次性进程。
