import { BACKEND_PRESETS, type BackendPreset } from '@shared/backend-presets'
import { useI18n } from '../../lib/i18n'
import { categoryLabelKey } from './category'

interface Props {
  onPick: (preset: BackendPreset) => void
  onClose: () => void
}

/** §7.7.3 预设选择器：≥8 家常用供应商，仅预填表单 */
function PresetPicker({ onPick, onClose }: Props): React.JSX.Element {
  const { t } = useI18n()

  const note = (preset: BackendPreset): string | null => {
    if (!preset.hasNote) return null
    if (preset.id === 'subscription') return t('models.preset.note.subscription')
    if (preset.id === 'custom') return t('models.preset.note.custom')
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        data-testid="preset-picker"
        className="max-h-[85vh] w-[640px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold">{t('models.presetPicker.title')}</h2>
        <p className="mb-4 text-sm text-[var(--fg-muted)]">{t('models.presetPicker.desc')}</p>

        <div className="grid grid-cols-2 gap-2">
          {BACKEND_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`preset-${preset.id}`}
              onClick={() => onPick(preset)}
              className="rounded-md border border-[var(--border)] p-3 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{preset.name}</span>
                <span className="rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-xs text-[var(--fg-muted)]">
                  {t(categoryLabelKey(preset.category))}
                </span>
              </div>
              <div className="mt-1 truncate text-xs text-[var(--fg-muted)]">
                {note(preset) ?? preset.baseUrl ?? preset.websiteUrl ?? ''}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PresetPicker
