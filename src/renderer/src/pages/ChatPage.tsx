import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { AiEngine, ChatSearchHit, ConversationSummary } from '@shared/ai'
import { API_MODELS } from '@shared/ai'
import type { BackendProfileView } from '@shared/backend'
import Markdown from '../components/Markdown'
import { formatTokens, useFormat } from '../lib/format'
import { useI18n } from '../lib/i18n'

interface ChatFocus {
  convId: string
  seq: number
}

interface StreamState {
  turnId: string
  /** 主进程累计全文（delta 事件整包替换，天然幂等） */
  text: string
}

interface ChatPageProps {
  focusRequest: ChatFocus | null
}

/** dao.SNIPPET_OPEN/CLOSE 标记 → <mark>（与会话中心 SearchResults 同一协议） */
function renderSnippet(snippet: string): React.ReactNode {
  const parts = snippet.split(/[⟦⟧]/)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-[var(--accent)]/25 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

function ChatPage({ focusRequest }: ChatPageProps): React.JSX.Element {
  const { t } = useI18n()
  const fmt = useFormat()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [engine, setEngine] = useState<AiEngine>('cli')
  const [apiModel, setApiModel] = useState<string>(API_MODELS[0].id)
  const [backendProfileId, setBackendProfileId] = useState<string>('')
  const [streams, setStreams] = useState<Record<string, StreamState | undefined>>({})
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const bottomRef = useRef<HTMLDivElement | null>(null)
  /** 已终态（done/error）的 turnId：error 事件可能先于 send() 的 IPC 返回到达，防止占位复活 */
  const finishedTurns = useRef(new Set<string>())

  // 主进程要求聚焦某对话（启动器 @ 提问落点）：render 期对比 seq 调整状态
  const [prevFocusSeq, setPrevFocusSeq] = useState<number | null>(null)
  if (focusRequest && focusRequest.seq !== prevFocusSeq) {
    setPrevFocusSeq(focusRequest.seq)
    setSelected(focusRequest.convId)
    setSearchQ('')
  }

  const convsQuery = useQuery({
    queryKey: ['ai-convs'],
    queryFn: () => window.t1doo.ai.convList()
  })
  const messagesQuery = useQuery({
    queryKey: ['ai-messages', selected],
    queryFn: () => window.t1doo.ai.convMessages(selected!),
    enabled: selected !== null
  })
  const searchQuery = useQuery({
    queryKey: ['ai-search', searchQ],
    queryFn: () => window.t1doo.ai.convSearch(searchQ),
    enabled: searchQ.trim().length > 0
  })
  const backendsQuery = useQuery({
    queryKey: ['backend-profiles'],
    queryFn: () => window.t1doo.backend.list()
  })
  const configQuery = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => window.t1doo.ai.configGet()
  })

  // 流式事件订阅：delta 整包替换、done/error 收尾并刷新查询
  useEffect(() => {
    return window.t1doo.ai.onDelta((e) => {
      if (e.kind === 'delta') {
        setStreams((prev) => ({ ...prev, [e.convId]: { turnId: e.turnId, text: e.text } }))
        return
      }
      finishedTurns.current.add(e.turnId)
      setStreams((prev) => ({ ...prev, [e.convId]: undefined }))
      if (e.kind === 'error') {
        setErrors((prev) => ({ ...prev, [e.convId]: e.message }))
      }
      void queryClient.invalidateQueries({ queryKey: ['ai-messages', e.convId] })
      void queryClient.invalidateQueries({ queryKey: ['ai-convs'] })
    })
  }, [queryClient])

  // 新消息/流式增量时贴底
  const streamForSelected = selected ? streams[selected] : undefined
  const pendingFromQuery = messagesQuery.data?.pending ?? null
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messagesQuery.data, streamForSelected?.text])

  const conv: ConversationSummary | null = convsQuery.data?.find((c) => c.id === selected) ?? null
  const streamingText = streamForSelected?.text ?? pendingFromQuery?.text ?? null
  const isStreaming = streamForSelected !== undefined || pendingFromQuery !== null
  const lastError = selected ? errors[selected] : undefined

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    if (selected) setErrors((prev) => ({ ...prev, [selected]: undefined }))
    try {
      const result = await window.t1doo.ai.send({
        convId: selected,
        text,
        engine,
        model: engine === 'api' ? apiModel : undefined,
        backendProfileId: engine === 'cli' && backendProfileId ? backendProfileId : undefined
      })
      // 占位 stream，让 UI 立即进入"回答中"态（首个 delta 到达前）；
      // 若 done/error 事件已先一步到达（无 Key 等同步失败），不再复活占位
      if (!finishedTurns.current.has(result.turnId)) {
        setStreams((prev) => ({
          ...prev,
          [result.convId]: prev[result.convId] ?? { turnId: result.turnId, text: '' }
        }))
      }
      setSelected(result.convId)
      void queryClient.invalidateQueries({ queryKey: ['ai-convs'] })
      void queryClient.invalidateQueries({ queryKey: ['ai-messages', result.convId] })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setErrors((prev) => ({ ...prev, [selected ?? 'new']: message }))
      setInput(text)
    }
  }

  const stop = (): void => {
    if (selected) void window.t1doo.ai.stop(selected)
  }

  const deleteConv = async (id: string): Promise<void> => {
    if (!window.confirm(t('chat.deleteConfirm'))) return
    await window.t1doo.ai.convDelete(id)
    if (selected === id) setSelected(null)
    void queryClient.invalidateQueries({ queryKey: ['ai-convs'] })
  }

  const newConversation = (): void => {
    setSelected(null)
    setSearchQ('')
  }

  const searchHits: ChatSearchHit[] = searchQuery.data ?? []
  const showSearch = searchQ.trim().length > 0

  return (
    <div className="flex h-full">
      {/* 左栏：对话列表 / 历史搜索 */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
        <div className="space-y-2 p-3">
          <button
            type="button"
            data-testid="chat-new"
            onClick={newConversation}
            className="w-full rounded-md border border-[var(--accent)] px-3 py-1.5 text-[var(--accent)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            {t('chat.new')}
          </button>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder={t('chat.searchPlaceholder')}
            data-testid="chat-search"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
          {showSearch ? (
            searchHits.length === 0 ? (
              <div className="px-2 py-4 text-sm text-[var(--fg-muted)]">
                {searchQuery.isFetching ? t('chat.searching') : t('chat.noMatches')}
              </div>
            ) : (
              <ul className="space-y-1">
                {searchHits.map((hit) => (
                  <li key={hit.messageId}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(hit.convId)
                        setSearchQ('')
                      }}
                      className="w-full rounded-md px-2 py-2 text-left hover:bg-[var(--bg-hover)]"
                    >
                      <div className="truncate text-sm font-medium">{hit.convTitle}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-[var(--fg-muted)]">
                        {renderSnippet(hit.snippet)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <ul className="space-y-1" data-testid="chat-conv-list">
              {(convsQuery.data ?? []).map((c) => (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className={`w-full rounded-md px-2 py-2 pr-7 text-left transition-colors ${
                      selected === c.id ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="truncate text-sm">{c.title}</div>
                    <div className="mt-0.5 flex gap-2 text-xs text-[var(--fg-muted)]">
                      <span>{c.engine === 'api' ? 'API' : 'CLI'}</span>
                      <span>{t('chat.messageCountShort', { n: c.messageCount })}</span>
                      <span>{fmt.formatRelative(c.updatedAt)}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    title={t('chat.deleteConvTitle')}
                    onClick={() => void deleteConv(c.id)}
                    className="absolute top-2 right-1 hidden rounded px-1 text-[var(--fg-muted)] group-hover:block hover:text-red-400"
                  >
                    ✕
                  </button>
                </li>
              ))}
              {convsQuery.data?.length === 0 && (
                <li className="px-2 py-4 text-sm text-[var(--fg-muted)]">{t('chat.emptyList')}</li>
              )}
            </ul>
          )}
        </div>
      </aside>

      {/* 右栏：消息流 + 输入区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <h1 className="min-w-0 flex-1 truncate font-medium">
            {conv ? conv.title : t('chat.newConversation')}
          </h1>
          {conv && (
            <span className="shrink-0 rounded bg-[var(--bg-hover)] px-2 py-0.5 text-xs text-[var(--fg-muted)]">
              {conv.engine === 'api' ? `API · ${conv.model ?? ''}` : t('chat.engineCliBadge')}
            </span>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4" data-testid="chat-thread">
          {selected === null ? (
            <div className="mx-auto max-w-xl pt-16 text-center text-[var(--fg-muted)]">
              <p className="text-lg">{t('chat.emptyTitle')}</p>
              <p className="mt-2 text-sm">{t('chat.emptyHint')}</p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {(messagesQuery.data?.messages ?? []).map((m) => (
                <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
                  {m.role === 'user' ? (
                    <div className="max-w-[85%] rounded-lg bg-[var(--accent)]/15 px-4 py-2 whitespace-pre-wrap">
                      {m.content}
                    </div>
                  ) : (
                    <div className="max-w-full">
                      <Markdown text={m.content} />
                      <div className="mt-1 flex gap-3 text-xs text-[var(--fg-muted)]">
                        {m.outputTokens != null && (
                          <span>
                            {formatTokens(m.inputTokens ?? 0)} in / {formatTokens(m.outputTokens)}{' '}
                            out
                          </span>
                        )}
                        {m.error && (
                          <span className="text-red-400">
                            {t('chat.interrupted', { msg: m.error })}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {isStreaming && (
                <div data-testid="chat-streaming">
                  {streamingText ? (
                    <Markdown text={streamingText} />
                  ) : (
                    <div className="text-[var(--fg-muted)]">{t('chat.thinking')}</div>
                  )}
                  <div className="mt-1 text-xs text-[var(--accent)]">{t('chat.answering')}</div>
                </div>
              )}
              {lastError && !isStreaming && (
                <div
                  data-testid="chat-error"
                  className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                >
                  {lastError}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
          {selected === null && errors['new'] && (
            <div
              data-testid="chat-error"
              className="mx-auto mt-6 max-w-xl rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400"
            >
              {errors['new']}
            </div>
          )}
        </div>

        <footer className="border-t border-[var(--border)] px-5 py-3">
          <div className="mx-auto max-w-3xl">
            {selected === null && (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <div className="flex overflow-hidden rounded-md border border-[var(--border)]">
                  {(['cli', 'api'] as const).map((eng) => (
                    <button
                      key={eng}
                      type="button"
                      data-testid={`chat-engine-${eng}`}
                      onClick={() => setEngine(eng)}
                      className={`px-3 py-1 transition-colors ${
                        engine === eng
                          ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                          : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                      }`}
                    >
                      {eng === 'cli' ? t('chat.engineCli') : t('chat.engineApi')}
                    </button>
                  ))}
                </div>
                {engine === 'cli' ? (
                  <select
                    value={backendProfileId}
                    onChange={(e) => setBackendProfileId(e.target.value)}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                  >
                    <option value="">{t('chat.defaultBackend')}</option>
                    {(backendsQuery.data ?? []).map((b: BackendProfileView) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <select
                      value={apiModel}
                      onChange={(e) => setApiModel(e.target.value)}
                      className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                    >
                      {API_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    {configQuery.data && !configQuery.data.hasKey && (
                      <span className="text-xs text-amber-400">{t('chat.noApiKey')}</span>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    void send()
                  }
                }}
                placeholder={isStreaming ? t('chat.answering') : t('chat.inputPlaceholder')}
                rows={Math.min(6, Math.max(1, input.split('\n').length))}
                data-testid="chat-input"
                className="min-w-0 flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-[var(--accent)]"
              />
              {isStreaming ? (
                <button
                  type="button"
                  data-testid="chat-stop"
                  onClick={stop}
                  className="shrink-0 rounded-md border border-red-500/50 px-4 py-2 text-red-400 transition-colors hover:bg-red-500/10"
                >
                  {t('chat.stop')}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="chat-send"
                  onClick={() => void send()}
                  disabled={!input.trim()}
                  className="shrink-0 rounded-md bg-[var(--accent)] px-4 py-2 text-white transition-opacity disabled:opacity-40"
                >
                  {t('chat.send')}
                </button>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default ChatPage
