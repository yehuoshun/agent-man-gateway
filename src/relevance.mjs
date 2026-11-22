// 相关性：答复有没有接住被回复的那句话。
// 中文按二元组覆盖率算，英文/数字按词。不做语义理解，只做字面重合——够用且可测。
export function relatedness(reply, anchor) {
  const gram = (s) => {
    const t = String(s ?? "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "")
    const set = new Set()
    for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2))
    if (t.length === 1) set.add(t)
    return set
  }
  const a = gram(reply)
  const b = gram(anchor)
  if (b.size === 0) return 1   // 没有锚点就不判
  if (a.size === 0) return 1   // 空回复交给别的规则
  let hit = 0
  for (const g of a) if (b.has(g)) hit++
  return hit / b.size          // 回复覆盖了原话多少
}
