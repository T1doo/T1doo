import type { SessionDetail } from '../../../shared/sessions'

function fmtTs(ts: number | null): string {
  if (ts == null) return ''
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

/** 会话 → Markdown（对话体裁；工具调用折叠为 details 块） */
export function sessionToMarkdown(detail: SessionDetail, includeTools: boolean): string {
  const s = detail.summary
  const out: string[] = []
  out.push(`# ${s.title}`)
  out.push('')
  out.push(`- 项目：${s.projectPath ?? '(未知)'}`)
  out.push(`- 会话 ID：\`${s.id}\``)
  out.push(`- 时间：${fmtTs(s.createdAt)} — ${fmtTs(s.updatedAt)}`)
  out.push(
    `- 消息数：${s.messageCount} · tokens：输入 ${s.inputTokens.toLocaleString()} / 输出 ${s.outputTokens.toLocaleString()}`
  )
  if (s.modelLast) out.push(`- 模型：${s.modelLast}`)
  out.push('')
  out.push('---')

  for (const m of detail.messages) {
    if (m.isSidechain) continue // 侧链（子代理轨迹）不进导出正文
    const who = m.role === 'user' ? '👤 用户' : '🤖 助手'
    out.push('')
    out.push(`## ${who}${m.ts ? `（${fmtTs(m.ts)}）` : ''}`)
    for (const b of m.blocks) {
      switch (b.kind) {
        case 'text':
          out.push('')
          out.push(b.text)
          break
        case 'thinking':
          if (includeTools) {
            out.push('')
            out.push(`<details><summary>💭 思考</summary>`)
            out.push('')
            out.push(b.text)
            out.push('')
            out.push('</details>')
          }
          break
        case 'tool_use':
          if (includeTools) {
            out.push('')
            out.push(`<details><summary>🔧 ${b.name}</summary>`)
            out.push('')
            out.push('```json')
            out.push(JSON.stringify(b.input, null, 2))
            out.push('```')
            out.push('')
            out.push('</details>')
          }
          break
        case 'tool_result':
          if (includeTools && b.text.trim()) {
            out.push('')
            out.push(`<details><summary>${b.isError ? '❌' : '📄'} 工具结果</summary>`)
            out.push('')
            out.push('```')
            out.push(b.text.length > 4000 ? `${b.text.slice(0, 4000)}\n…（截断）` : b.text)
            out.push('```')
            out.push('')
            out.push('</details>')
          }
          break
      }
    }
  }
  out.push('')
  return out.join('\n')
}
