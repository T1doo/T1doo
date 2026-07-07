import { t } from '../i18n'
import type { ProbeResult } from './probe'

/** probe 失败 → 中文提示（describeApiError 同口径，§7.7.4）；CLI 档案与 API 通道共用 */
export function describeProbeFailure(r: Extract<ProbeResult, { ok: false }>): string {
  switch (r.kind) {
    case 'auth':
      return t('models.test.auth')
    case 'notfound':
      return t('models.test.notFound')
    case 'timeout':
      return t('models.test.timeout')
    case 'network':
      return t('models.test.network')
    default:
      return t('models.test.http', { status: r.status ?? '?' })
  }
}
