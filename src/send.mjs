// 唯一的发送出口。结构上强制，不靠纪律：
// 票据只能由 authorize() 签发，签发后只能被 send() 用一次，别的模块拿不到发送函数。
const approved = new WeakSet()
// 同一份筛查结果只能签一张票：否则"过一次闸"能变成"过 N 次"，
// 一份 pass 的 screened 对象被循环二十遍就是二十条消息，闸门等于没有。
const signed = new WeakSet()

export function authorize(screened, meta = {}) {
  if (!screened) throw new Error("authorize 需要 screenOutbound 的结果")
  // 白名单：只有 pass 能签票。quarantine 的 text 是"带隔离块的原文"，放它出门等于绕过出站闸。
  if (screened.verdict !== "pass") {
    throw new Error("未过闸：" + String(screened.verdict ?? "未知") + " 的筛查结果不许签发票据")
  }
  if (signed.has(screened)) {
    throw new Error("这份筛查结果已经签过票了：要再发一条，重新 screenOutbound 一次")
  }
  signed.add(screened)
  const ticket = { text: screened.text, scope: screened.scope ?? meta.scope ?? "private" }
  approved.add(ticket)
  return ticket
}

export function send(ticket, transport) {
  if (!ticket || !approved.has(ticket)) throw new Error("未过闸：这不是网关签发的票据")
  if (typeof transport !== "function") throw new Error("send 需要 transport 函数")
  approved.delete(ticket) // 一次性：发过就作废，防重复投递
  return transport(ticket.text)
}
