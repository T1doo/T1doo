import { useEffect, useState } from 'react'
import type { HighlighterCore } from 'shiki/core'

/** 细粒度按需加载：只打包用到的语言与主题，避免 shiki 全量 300+ chunk */
let highlighterPromise: Promise<HighlighterCore> | null = null

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript')
    ]).then(([core, engine]) =>
      core.createHighlighterCore({
        themes: [import('@shikijs/themes/github-light'), import('@shikijs/themes/github-dark')],
        langs: [
          import('@shikijs/langs/typescript'),
          import('@shikijs/langs/tsx'),
          import('@shikijs/langs/javascript'),
          import('@shikijs/langs/jsx'),
          import('@shikijs/langs/json'),
          import('@shikijs/langs/bash'),
          import('@shikijs/langs/powershell'),
          import('@shikijs/langs/python'),
          import('@shikijs/langs/html'),
          import('@shikijs/langs/css'),
          import('@shikijs/langs/markdown'),
          import('@shikijs/langs/yaml'),
          import('@shikijs/langs/sql'),
          import('@shikijs/langs/diff')
        ],
        engine: engine.createJavaScriptRegexEngine({ forgiving: true })
      })
    )
  }
  return highlighterPromise
}

const LANG_ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  yml: 'yaml',
  md: 'markdown'
}

const MAX_HIGHLIGHT_CHARS = 50_000

interface CodeBlockProps {
  code: string
  lang?: string
}

function CodeBlock({ code, lang }: CodeBlockProps): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (code.length > MAX_HIGHLIGHT_CHARS) return undefined
    getHighlighter()
      .then((hl) => {
        if (!alive) return
        const requested = lang ? (LANG_ALIASES[lang] ?? lang) : 'text'
        const language = hl.getLoadedLanguages().includes(requested) ? requested : 'text'
        setHtml(
          hl.codeToHtml(code, {
            lang: language,
            themes: { light: 'github-light', dark: 'github-dark' },
            defaultColor: false
          })
        )
      })
      .catch(() => {
        // 高亮失败 → 保持纯文本
      })
    return () => {
      alive = false
    }
  }, [code, lang])

  if (html) {
    return (
      <div
        className="shiki-wrap overflow-x-auto rounded-md text-[13px] leading-relaxed"
        // shiki 输出为可信生成内容（本地渲染，无外源 HTML）
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }
  return (
    <pre className="overflow-x-auto rounded-md bg-[var(--bg-hover)] p-3 text-[13px] leading-relaxed">
      <code>{code}</code>
    </pre>
  )
}

export default CodeBlock
