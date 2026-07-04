import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from './CodeBlock'

type CodeProps = React.ComponentPropsWithoutRef<'code'> & ExtraProps

function MdCode({ children, className, ...rest }: CodeProps): React.JSX.Element {
  const match = /language-(\w+)/.exec(className ?? '')
  const value = String(children ?? '')
  // 块级代码带 language-*；多行内容也按块处理；其余为行内代码
  if (match || value.includes('\n')) {
    return <CodeBlock code={value.replace(/\n$/, '')} lang={match?.[1]} />
  }
  return (
    <code
      className={`rounded bg-[var(--bg-hover)] px-1 py-0.5 text-[13px] ${className ?? ''}`}
      {...rest}
    >
      {children}
    </code>
  )
}

function MdLink(props: React.ComponentPropsWithoutRef<'a'> & ExtraProps): React.JSX.Element {
  // 外链交给主进程 shell.openExternal（windowOpenHandler 拦截）
  return <a {...props} target="_blank" rel="noreferrer" />
}

interface MarkdownProps {
  text: string
}

/** 助手消息 Markdown 渲染（GFM + shiki 代码高亮） */
const Markdown = memo(function Markdown({ text }: MarkdownProps): React.JSX.Element {
  return (
    <div className="md-body min-w-0 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: MdCode, a: MdLink }}>
        {text}
      </ReactMarkdown>
    </div>
  )
})

export default Markdown
