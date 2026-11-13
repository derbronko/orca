import { useState } from 'react'
import type { AgentAccountPreferencePatch } from '../../../../../shared/agent-accounts/agent-account-preference'
import type {
  ProjectHostSetup,
  ProjectHostSetupUpdateArgs,
  ProjectHostSetupUpdateResult
} from '../../../../../shared/project-types'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import { useTranslate } from '@/i18n/use-translate'
import { AgentAccountPreferenceFields } from '../../agent-accounts/agent-account-preference-fields'
import { useManagedAgentAccountOptions } from '../../agent-accounts/use-managed-agent-account-options'

export function RepositoryAgentAccountsSection({
  setup,
  updateProjectHostSetup,
  unsupportedRuntime = false,
  forceVisible = false
}: {
  setup: ProjectHostSetup
  updateProjectHostSetup: (
    args: ProjectHostSetupUpdateArgs
  ) => Promise<Pick<ProjectHostSetupUpdateResult, 'setup'> | null>
  unsupportedRuntime?: boolean
  forceVisible?: boolean
}): React.JSX.Element {
  const t = useTranslate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const targetHostId = setup.executionHostId ?? setup.hostId
  const supported =
    targetHostId === 'local' && !setup.runtimeOwnerEnvironmentId && !unsupportedRuntime
  const { options, loading, error: loadError } = useManagedAgentAccountOptions(supported)

  const updatePreference = async (
    provider: keyof typeof options,
    accountId: string | null
  ): Promise<void> => {
    if (saving || !supported) {
      return
    }
    if (accountId && !options[provider].some((account) => account.id === accountId)) {
      setError(t('agentAccounts.staleAccount', 'That managed account is no longer available.'))
      return
    }
    setSaving(true)
    setError(null)
    const patch: AgentAccountPreferencePatch = {
      [provider]: accountId ? { accountId } : null
    }
    try {
      const result = await updateProjectHostSetup({
        setupId: setup.id,
        hostId: setup.hostId,
        updates: { agentAccounts: patch }
      })
      if (!result?.setup) {
        setError(t('agentAccounts.saveFailed', 'Could not save the managed account preference.'))
        return
      }
      const savedId = result.setup.agentAccounts?.[provider]?.accountId ?? null
      if (savedId !== accountId) {
        setError(
          t('agentAccounts.saveNotApplied', 'The host did not apply this account preference.')
        )
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SearchableSetting
      title={t('agentAccounts.projectTitle', 'Agent accounts')}
      description={t(
        'agentAccounts.projectDescription',
        'Choose managed accounts for new sessions created in this project on the selected host.'
      )}
      keywords={['agent accounts', 'Claude', 'Codex', 'login', 'managed account']}
      className="space-y-3 py-3"
      forceVisible={forceVisible}
    >
      <div className="space-y-1">
        <div className="text-sm font-semibold">
          {t('agentAccounts.projectTitle', 'Agent accounts')}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'agentAccounts.projectDescription',
            'Choose managed accounts for new sessions created in this project on the selected host.'
          )}
        </p>
      </div>
      <AgentAccountPreferenceFields
        preferences={setup.agentAccounts}
        options={options}
        disabled={!supported}
        disabledReason={
          supported
            ? undefined
            : unsupportedRuntime
              ? t(
                  'agentAccounts.wslUnsupported',
                  'Managed account assignment is not available for WSL yet.'
                )
              : t(
                  'agentAccounts.localOnly',
                  'Managed account assignment is available only on the local host.'
                )
        }
        loading={loading}
        saving={saving}
        error={error ?? loadError}
        onChange={(provider, accountId) => void updatePreference(provider, accountId)}
      />
    </SearchableSetting>
  )
}
