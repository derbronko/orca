import type {
  AssignableAgentProvider,
  ManagedAgentAccountRef
} from '../../../../shared/agent-accounts/agent-account-preference'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { SleepingAgentLaunchConfig } from '../../../../shared/agent-session/lifecycle/agent-session-resume'
import type { ScopedAccountPreferenceStore } from '../../../runtime/agent-session/environment/scoped-agent-account-preference'
import { resolveScopedAgentAccountPreference } from '../../../runtime/agent-session/environment/scoped-agent-account-preference'
import type { CodexAccountSelectionTarget } from '../../../../shared/codex-selection-lane'
import {
  applyClaudeEnvPatch,
  CLAUDE_AUTH_ENV_VARS
} from '../../../claude-accounts/runtime-auth/environment'
import {
  CLAUDE_INJECTED_CONFIG_DIR_ENV,
  CLAUDE_PROFILE_POINTER_ENV,
  CLAUDE_USER_CONFIG_DIR_ENV
} from '../../../../shared/claude-profile-routing'

export function ptyAccountBindingEnvDeletions(account?: ManagedAgentAccountRef): readonly string[] {
  return account?.provider === 'claude'
    ? [
        ...CLAUDE_AUTH_ENV_VARS,
        'ANTHROPIC_CUSTOM_HEADERS',
        CLAUDE_PROFILE_POINTER_ENV,
        CLAUDE_USER_CONFIG_DIR_ENV
      ]
    : []
}

export function resolvePtyAgentAccountBinding(input: {
  provider?: AssignableAgentProvider
  accountBinding?: ManagedAgentAccountRef
  launchConfig?: SleepingAgentLaunchConfig
  workspaceId?: string
  executionHostId: ExecutionHostId
  target: CodexAccountSelectionTarget
  store?: ScopedAccountPreferenceStore
  allowWorkspacePreference?: boolean
}): ManagedAgentAccountRef | undefined {
  const accountBinding = input.accountBinding ?? input.launchConfig?.accountBinding
  if (accountBinding && input.provider && accountBinding.provider !== input.provider) {
    throw new Error(
      `This pane is bound to a ${accountBinding.provider} account and cannot launch ${input.provider}.`
    )
  }
  const provider = input.provider ?? accountBinding?.provider
  const resolved = accountBinding
    ? accountBinding
    : provider && input.allowWorkspacePreference !== false && input.workspaceId && input.store
      ? (resolveScopedAgentAccountPreference(input.store, provider, {
          workspaceId: input.workspaceId,
          executionHostId: input.executionHostId
        }).account ?? undefined)
      : undefined
  if (resolved && (input.executionHostId !== 'local' || input.target.runtime !== 'host')) {
    throw new Error(
      `Managed ${resolved.provider} account assignments are not supported on ${input.executionHostId} (${input.target.runtime}).`
    )
  }
  return resolved
}

export function stripPtyClaudeAuthForAccountBinding(
  env: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!env) {
    return undefined
  }
  const isolated = { ...env }
  applyClaudeEnvPatch(isolated, {}, { stripAuthEnv: true })
  for (const key of [
    'CLAUDE_CONFIG_DIR',
    CLAUDE_PROFILE_POINTER_ENV,
    CLAUDE_INJECTED_CONFIG_DIR_ENV,
    CLAUDE_USER_CONFIG_DIR_ENV
  ]) {
    const normalized = process.platform === 'win32' ? key.toUpperCase() : key
    for (const existingKey of Object.keys(isolated)) {
      if ((process.platform === 'win32' ? existingKey.toUpperCase() : existingKey) === normalized) {
        delete isolated[existingKey]
      }
    }
  }
  return isolated
}

export function withPtyAccountBinding(
  launchConfig: SleepingAgentLaunchConfig | undefined,
  command: string | undefined,
  accountBinding: ManagedAgentAccountRef
): SleepingAgentLaunchConfig {
  return {
    ...(launchConfig ?? {
      agentArgs: '',
      agentEnv: {},
      ...(command ? { agentCommand: command } : {})
    }),
    accountBinding
  }
}
