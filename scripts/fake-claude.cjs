/* E2E 假 claude：按 stream-json 协议回放，零额度消耗（经 T1DOO_CLAUDE_CMD 注入）
 * - 对话模式（--input-format stream-json）：读 stdin 用户消息 → partial deltas + assistant + result
 * - 任务模式（-p <prompt>）：assistant + result 后退出；prompt 含 FAIL 时回 is_error
 */
const args = process.argv.slice(2)

function out(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

function flagValue(flag) {
  const i = args.indexOf(flag)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null
}

const sessionId = flagValue('--session-id') || 'fake-session-0000'
out({ type: 'system', subtype: 'init', session_id: sessionId })

if (flagValue('--input-format') === 'stream-json') {
  // 对话模式：单进程长连
  const readline = require('readline')
  const rl = readline.createInterface({ input: process.stdin })
  rl.on('line', (line) => {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    const text = msg?.message?.content?.[0]?.text ?? ''
    const reply = `收到：${text}。这是**假引擎**的流式回答，用于 E2E 验证。`
    const mid = Math.floor(reply.length / 2)
    for (const piece of [reply.slice(0, mid), reply.slice(mid)]) {
      out({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: piece } }
      })
    }
    out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: reply }] } })
    out({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: reply,
      session_id: sessionId,
      total_cost_usd: 0.001,
      usage: { input_tokens: 12, output_tokens: 34 },
      num_turns: 1,
      duration_ms: 42
    })
  })
  rl.on('close', () => process.exit(0))
} else {
  // 任务模式
  const pIdx = args.indexOf('-p')
  const prompt = pIdx >= 0 && pIdx + 1 < args.length ? args[pIdx + 1] : ''
  const fail = prompt.includes('FAIL')
  const answer = fail ? '任务执行出错（模拟）' : `任务已完成：${prompt}`
  setTimeout(() => {
    out({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: answer }] }
    })
    out({
      type: 'result',
      subtype: fail ? 'error_during_execution' : 'success',
      is_error: fail,
      result: answer,
      session_id: sessionId,
      total_cost_usd: 0.002,
      usage: { input_tokens: 20, output_tokens: 30 },
      num_turns: 1,
      duration_ms: 120
    })
    process.exit(0)
  }, 400)
}
