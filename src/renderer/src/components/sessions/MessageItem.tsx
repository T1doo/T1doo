import { memo, useState } from 'react'
import type { ContentBlockView, MessageView } from '@shared/sessions'
import Markdown from '../Markdown'
import CodeBlock from '../CodeBlock'
import { formatDateTime } from '../../lib/format'

function toolSummary(block: Extract<ContentBlockView, { kind: 'tool_use' }>): string {
  const input = block.input as Record<string, unknown> | null
  if (input && typeof input === 'object') {
    const p = input.file_path ?? input.notebook_path ?? input.path ?? input.command ?? input.pattern
    if (typeof p === 'string' && p)
      return `${block.name} · ${p.length > 80 ? `…${p.slice(-78)}` : p}`
  }
  return block.name
}

function Collapsible({
  summary,
  tone,
  children
}: {
  summary: string
  tone: 'tool' | 'thinking' | 'error'
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const icon = tone === 'thinking' ? '💭' : tone === 'error' ? '❌' : '🔧'
  return (
    <div className="my-1 rounded-md border border-[var(--border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
      >
        <span className="shrink-0">{open ? '▾' : '▸'}</span>
        <span className="min-w-0 truncate">
          {icon} {summary}
        </span>
      </button>
      {open && <div className="border-t border-[var(--border)] p-3">{children}</div>}
    </div>
  )
}

function Block({ block }: { block: ContentBlockView }): React.JSX.Element | null {
  switch (block.kind) {
    case 'text':
      return <Markdown text={block.text} />
    case 'thinking':
      return (
        <Collapsible summary="思考过程" tone="thinking">
          <div className="text-[13px] whitespace-pre-wrap text-[var(--fg-muted)]">{block.text}</div>
        </Collapsible>
      )
    case 'tool_use':
      return (
        <Collapsible summary={toolSummary(block)} tone="tool">
          <CodeBlock code={JSON.stringify(block.input, null, 2) ?? ''} lang="json" />
        </Collapsible>
      )
    case 'tool_result': {
      if (!block.text.trim()) return null
      const text = block.text.length > 8000 ? `${block.text.slice(0, 8000)}\n…（截断）` : block.text
      return (
        <Collapsible summary="工具结果" tone={block.isError ? 'error' : 'tool'}>
          <pre className="max-h-80 overflow-auto text-[13px] whitespace-pre-wrap">{text}</pre>
        </Collapsible>
      )
    }
  }
}

interface MessageItemProps {
  message: MessageView
}

const MessageItem = memo(function MessageItem({ message }: MessageItemProps): React.JSX.Element {
  const isUser = message.role === 'user'
  return (
    <div
      className={`border-l-2 py-2 pr-4 pl-4 ${
        isUser ? 'border-[var(--accent)]' : 'border-[var(--border)]'
      }`}
    >
      <div className="mb-1 flex items-baseline gap-2 text-xs text-[var(--fg-muted)]">
        <span className={isUser ? 'font-medium text-[var(--accent)]' : 'font-medium'}>
          {isUser ? '用户' : '助手'}
        </span>
        {message.model && <span>{message.model}</span>}
        <span>{formatDateTime(message.ts)}</span>
      </div>
      <div className="space-y-1">
        {isUser
          ? message.blocks.map((b, i) =>
              b.kind === 'text' ? (
                <div key={i} className="text-[14px] whitespace-pre-wrap">
                  {b.text}
                </div>
              ) : (
                <Block key={i} block={b} />
              )
            )
          : message.blocks.map((b, i) => <Block key={i} block={b} />)}
      </div>
    </div>
  )
})

export default MessageItem
