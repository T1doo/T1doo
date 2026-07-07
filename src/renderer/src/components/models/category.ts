import type { BackendCategory } from '@shared/backend'
import type { I18nKey } from '@shared/i18n'

/** 分类徽标文案 key（i18n key 为字面量联合，不能动态拼接） */
export function categoryLabelKey(category: BackendCategory): I18nKey {
  switch (category) {
    case 'official':
      return 'models.category.official'
    case 'cn_official':
      return 'models.category.cn_official'
    case 'aggregator':
      return 'models.category.aggregator'
    case 'third_party':
      return 'models.category.third_party'
    default:
      return 'models.category.custom'
  }
}
