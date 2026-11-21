import { useId } from 'react'
import type {
  AgentAccountPreferences,
  AssignableAgentProvider
} from '../../../../shared/agent-accounts/agent-account-preference'
import { resolveAgentAccountPreference } from '../../../../shared/agent-accounts/agent-account-preference'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { useTranslate } from '@/i18n/use-translate'

export type ManagedAgentAccountOption = { id: string; label: string }
export type ManagedAgentAccountOptions = Record<
  AssignableAgentProvider,
  ManagedAgentAccountOption[]
>

export function AgentAccountPreferenceFields({
  preferences,
  projectPreferences,
  options,
  disabled = false,
  disabledReason,
  loading = false,
  saving = false,
  error,
  onChange
}: {
  preferences?: AgentAccountPreferences
  projectPreferences?: AgentAccountPreferences
  options: ManagedAgentAccountOptions
  disabled?: boolean
  disabledReason?: string
  loading?: boolean
  saving?: boolean
  error?: string | null
  onChange: (provider: AssignableAgentProvider, accountId: string | null) => void
}): React.JSX.Element {
  const t = useTranslate()
  const baseId = useId()
  const providers: AssignableAgentProvider[] = ['claude', 'codex']

  return (
    <div className="space-y-3">
      {providers.map((provider) => {
        const currentId = preferences?.[provider]?.accountId
        const value = currentId ?? '__inherit__'
        const inherited = resolveAgentAccountPreference({
          provider,
          project: projectPreferences
        })
        const inheritedLabel =
          inherited.source === 'project'
            ? t('agentAccounts.inheritProject', 'Inherit project account: {{value0}}', {
                value0:
                  options[provider].find((account) => account.id === inherited.account.accountId)
                    ?.label ?? inherited.account.accountId
              })
            : t('agentAccounts.inheritGlobal', 'Inherit global selection')
        const providerLabel = provider === 'claude' ? 'Claude' : 'Codex'
        const labelId = `${baseId}-${provider}`
        const staleCurrent =
          currentId && !options[provider].some((account) => account.id === currentId)

        return (
          <div
            key={provider}
            className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)] items-center gap-3"
          >
            <Label htmlFor={labelId}>{providerLabel}</Label>
            <Select
              value={value}
              onValueChange={(next) => onChange(provider, next === '__inherit__' ? null : next)}
              disabled={disabled || loading || saving}
            >
              <SelectTrigger id={labelId} size="sm" density="compact" className="w-full min-w-0">
                <span className="min-w-0 flex-1 truncate text-left">
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit__">{inheritedLabel}</SelectItem>
                {staleCurrent ? (
                  <SelectItem value={currentId} disabled>
                    {t('agentAccounts.unavailableAccount', 'Unavailable account ({{value0}})', {
                      value0: currentId
                    })}
                  </SelectItem>
                ) : null}
                {options[provider].map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      })}
      {loading ? (
        <p className="text-xs text-muted-foreground">
          {t('agentAccounts.loading', 'Loading managed accounts…')}
        </p>
      ) : null}
      {disabledReason ? <p className="text-xs text-muted-foreground">{disabledReason}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
