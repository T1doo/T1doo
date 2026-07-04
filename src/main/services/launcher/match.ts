/**
 * 启动器匹配打分（§7.3）：前缀 > 词首 > 子串 > 首字母缩写。
 * 纯函数；拼音首字母是 Could 级，v1 不做。
 */

const WORD_SPLIT_RE = /[\s\-_./\\()（）［\][\]]+/

/** 文本各词的首字母串（"Visual Studio Code" → "vsc"） */
function initials(text: string): string {
  return text
    .split(WORD_SPLIT_RE)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
}

/** 单词项对单文本打分：0 = 不匹配 */
function termScore(term: string, text: string): number {
  if (!term || !text) return 0
  if (text === term) return 1000
  if (text.startsWith(term)) return 800
  const idx = text.indexOf(term)
  if (idx > 0) {
    const prevChar = text[idx - 1]
    // 词首命中（前一位是分隔符）优于任意子串
    return WORD_SPLIT_RE.test(prevChar) ? 600 : 400
  }
  if (initials(text).startsWith(term)) return 300
  return 0
}

/**
 * 查询对候选打分：查询按空白切词，所有词项都须命中（AND），得分取词项和；
 * 同分时短文本略占优（更精确的候选靠前）。返回 0 表示不匹配。
 */
export function matchScore(query: string, texts: (string | null | undefined)[]): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return 0
  const candidates = texts.filter((t): t is string => !!t).map((t) => t.toLowerCase())
  if (candidates.length === 0) return 0

  let total = 0
  for (const term of terms) {
    let best = 0
    for (const text of candidates) {
      const s = termScore(term, text)
      if (s > best) best = s
    }
    if (best === 0) return 0
    total += best
  }
  const primaryLen = candidates[0].length
  return total + Math.max(0, 60 - primaryLen) / 100
}
