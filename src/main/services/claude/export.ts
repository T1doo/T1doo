import type { SessionDetail } from '../../../shared/sessions'
import { getAppLocale, t } from '../i18n'

function fmtTs(ts: number | null): string {
  if (ts == null) return ''
  return new Date(ts).toLocaleString(getAppLocale() === 'en' ? 'en-US' : 'zh-CN', {
    hour12: false
  })
}

/** 会话 → Markdown（对话体裁；工具调用折叠为 details 块） */
export function sessionToMarkdown(detail: SessionDetail, includeTools: boolean): string {
  const s = detail.summary
  const out: string[] = []
  out.push(`# ${s.title}`)
  out.push('')
  out.push(`- ${t('sys.export.project', { path: s.projectPath ?? t('sys.export.unknown') })}`)
  out.push(`- ${t('sys.export.sessionId', { id: s.id })}`)
  out.push(`- ${t('sys.export.time', { from: fmtTs(s.createdAt), to: fmtTs(s.updatedAt) })}`)
  out.push(
    `- ${t('sys.export.stats', {
      count: s.messageCount,
      input: s.inputTokens.toLocaleString(),
      output: s.outputTokens.toLocaleString()
    })}`
  )
  if (s.modelLast) out.push(`- ${t('sys.export.model', { model: s.modelLast })}`)
  out.push('')
  out.push('---')

  for (const m of detail.messages) {
    if (m.isSidechain) continue // 侧链（子代理轨迹）不进导出正文
    const who = m.role === 'user' ? t('sys.export.user') : t('sys.export.assistant')
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
            out.push(`<details><summary>${t('sys.export.thinking')}</summary>`)
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
            out.push(
              `<details><summary>${b.isError ? '❌' : '📄'} ${t('sys.export.toolResult')}</summary>`
            )
            out.push('')
            out.push('```')
            out.push(
              b.text.length > 4000
                ? `${b.text.slice(0, 4000)}\n${t('sys.export.truncated')}`
                : b.text
            )
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
