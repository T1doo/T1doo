import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'

/** xterm 主题跟随应用 CSS 变量（暗/亮由 prefers-color-scheme 驱动） */
function xtermTheme(dark: boolean): Record<string, string> {
  return dark
    ? {
        background: '#1d1d21',
        foreground: '#e8e8ea',
        cursor: '#f59e0b',
        selectionBackground: '#3b3b45'
      }
    : {
        background: '#ffffff',
        foreground: '#1c1c1f',
        cursor: '#d97706',
        selectionBackground: '#d4d4dc'
      }
}

export interface XtermViewHandle {
  focus(): void
  fit(): void
  findNext(q: string): void
  findPrevious(q: string): void
  clearSearch(): void
}

interface Props {
  terminalId: string
  /** 所在面板是否可见：隐藏时跳过 fit（尺寸为 0 会算出 NaN） */
  visible: boolean
}

/**
 * 单终端视图（§7.2.1 数据通路渲染侧）：
 * attach 回放缓冲 → onData 增量写入 → 键入/resize 走一发通道回主进程。
 * 实例挂在组件生命周期上；标签切换用 display 控制可见而不卸载，保住滚动位置。
 */
const XtermView = forwardRef<XtermViewHandle, Props>(function XtermView(
  { terminalId, visible },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  useImperativeHandle(ref, () => ({
    focus: () => termRef.current?.focus(),
    fit: () => safeFit(),
    findNext: (q) => searchRef.current?.findNext(q, { incremental: false }),
    findPrevious: (q) => searchRef.current?.findPrevious(q),
    clearSearch: () => searchRef.current?.clearDecorations()
  }))

  function safeFit(): void {
    const el = containerRef.current
    if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return
    try {
      fitRef.current?.fit()
    } catch {
      // 容器瞬时不可见时忽略
    }
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const dark = window.matchMedia('(prefers-color-scheme: dark)')
    const term = new Terminal({
      scrollback: 10_000, // 与主进程环形缓冲同限（§7.2.1）
      fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
      theme: xtermTheme(dark.matches)
    })
    // 放行页面级快捷键：Ctrl+T/W/F 交给 TerminalsPage 处理（§7.2.5）
    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && !e.altKey && !e.metaKey && ['t', 'w', 'f'].includes(e.key.toLowerCase())) {
        return false
      }
      return true
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.open(el)
    termRef.current = term
    fitRef.current = fit
    searchRef.current = search

    const onTheme = (e: MediaQueryListEvent): void => {
      term.options.theme = xtermTheme(e.matches)
    }
    dark.addEventListener('change', onTheme)

    // 键入 → 主进程 pty（一发通道）
    const dataSub = term.onData((data) => window.t1doo.term.write(terminalId, data))
    const resizeSub = term.onResize(({ cols, rows }) =>
      window.t1doo.term.resize(terminalId, cols, rows)
    )

    // attach：回放缓冲，随后接增量
    let disposed = false
    const unsubData = window.t1doo.term.onData(({ id, data }) => {
      if (id === terminalId && !disposed) term.write(data)
    })
    void window.t1doo.term.attach(terminalId).then(({ buffer }) => {
      if (!disposed && buffer) term.write(buffer)
      safeFit()
    })

    const observer = new ResizeObserver(() => {
      if (visibleRef.current) safeFit()
    })
    observer.observe(el)

    return () => {
      disposed = true
      dark.removeEventListener('change', onTheme)
      observer.disconnect()
      unsubData()
      dataSub.dispose()
      resizeSub.dispose()
      term.dispose()
      termRef.current = null
    }
    // terminalId 不变（每个终端一个组件实例，key=id）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId])

  // 变为可见时补一次 fit + 聚焦
  useEffect(() => {
    if (visible) {
      safeFit()
      termRef.current?.focus()
    }
  }, [visible])

  return <div ref={containerRef} className="h-full w-full" />
})

export default XtermView
