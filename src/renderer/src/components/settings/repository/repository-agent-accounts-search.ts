import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'
import type { SettingsSearchEntry } from '../search/settings-search'

export function getRepositoryAgentAccountsSearchEntry(
  t: Translate = translate
): SettingsSearchEntry {
  return {
    title: t('agentAccounts.projectTitle', 'Agent accounts'),
    description: t(
      'agentAccounts.projectDescription',
      'Choose managed accounts for new sessions created in this project on the selected host.'
    ),
    keywords: ['agent accounts', 'Claude', 'Codex', 'login', 'managed account']
  }
}
