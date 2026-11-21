import { useState } from 'react'
import type {
  AgentAccountPreferencePatch,
  AgentAccountPreferences
} from '../../../../../../shared/agent-accounts/agent-account-preference'
import type { ExecutionHostId } from '../../../../../../shared/execution-host'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { Button } from '../../../ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../../ui/dialog'
import { useTranslate } from '@/i18n/use-translate'
import { AgentAccountPreferenceFields } from '../../../agent-accounts/agent-account-preference-fields'
import { useManagedAgentAccountOptions } from '../../../agent-accounts/use-managed-agent-account-options'

export function WorkspaceAgentAccountsDialog({
  open,
  onOpenChange,
  worktree,
  executionHostId,
  wslUnsupported = false,
  projectPreferences,
  updateWorktreeMeta
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  worktree: Worktree
  executionHostId: ExecutionHostId
  wslUnsupported?: boolean
  projectPreferences?: AgentAccountPreferences
  updateWorktreeMeta: (
    worktreeId: string,
    updates: { agentAccounts: AgentAccountPreferencePatch },
    options?: { executionHostId?: ExecutionHostId }
  ) => Promise<{ ok: true } | { ok: false; error: string }>
}): React.JSX.Element {
  const t = useTranslate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const targetHostId = executionHostId
  const supported =
    targetHostId === 'local' && !worktree.runtimeOwnerEnvironmentId && !wslUnsupported
  const { options, loading, error: loadError } = useManagedAgentAccountOptions(open && supported)

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
      const result = await updateWorktreeMeta(
        worktree.id,
        { agentAccounts: patch },
        {
          executionHostId: targetHostId
        }
      )
      if (!result.ok) {
        setError(result.error)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const disabledReason = wslUnsupported
    ? t('agentAccounts.wslUnsupported', 'Managed account assignment is not available for WSL yet.')
    : t(
        'agentAccounts.localOnly',
        'Managed account assignment is available only on the local host.'
      )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('agentAccounts.workspaceTitle', 'Agent accounts')}</DialogTitle>
          <DialogDescription>
            {t(
              'agentAccounts.workspaceDescription',
              'Choose managed accounts for new sessions in {{value0}}. Existing sessions keep their saved account.',
              { value0: worktree.displayName }
            )}
          </DialogDescription>
        </DialogHeader>
        <AgentAccountPreferenceFields
          preferences={worktree.agentAccounts}
          projectPreferences={projectPreferences}
          options={options}
          disabled={!supported}
          disabledReason={supported ? undefined : disabledReason}
          loading={loading}
          saving={saving}
          error={error ?? loadError}
          onChange={(provider, accountId) => void updatePreference(provider, accountId)}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {t('common.close', 'Close')}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
