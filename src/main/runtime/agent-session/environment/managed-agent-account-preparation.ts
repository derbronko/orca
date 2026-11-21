import {
  isManagedAgentAccountRef,
  type ManagedAgentAccountRef,
  type AgentAccountPreferencePatch
} from '../../../../shared/agent-accounts/agent-account-preference'
import type { ClaudeRuntimeAuthPreparation } from '../../../claude-accounts/runtime-auth/runtime-auth-types'
import { createCodexRuntimeHomeLaunchPreparation } from '../../../codex/configuration/homes/codex-runtime-home-launch-preparation'
import type { AgentStatusHooksSettings } from '../../../../shared/agent-hook-listener/configuration/agent-status-hooks-setting'
import type { ClaudeAccountService } from '../../../claude-accounts/service'
import type { CodexAccountService } from '../../../codex-accounts/service'

export type ManagedAccountPreparationServices = {
  claude: {
    resolveManagedAccountHome: (accountId: string) => string | Promise<string>
    prepareManagedAccountForLaunch: (accountId: string) => Promise<ClaudeRuntimeAuthPreparation>
  }
  codex: { resolveManagedAccountHome: (accountId: string) => string }
  prepareCodexLaunch: (accountId: string, env: NodeJS.ProcessEnv) => Promise<string | null>
}

export type ManagedAgentAccountPreparationInput = {
  account: ManagedAgentAccountRef
  target: { hostId: string; runtime: 'host' | 'wsl'; wslDistro?: string }
  launchDirectory: string
  purpose?: 'launch' | 'read'
  launchEnv?: NodeJS.ProcessEnv
}

export type RuntimeManagedAccountServices = {
  claudeAccounts: ClaudeAccountService
  codexAccounts: CodexAccountService
}

export async function prepareManagedAgentAccount(
  input: ManagedAgentAccountPreparationInput,
  services: ManagedAccountPreparationServices
): Promise<{ account: ManagedAgentAccountRef; home: string; env: Record<string, string> }> {
  if (!isManagedAgentAccountRef(input.account)) {
    throw new Error('Invalid managed agent account assignment.')
  }
  if (input.target.hostId !== 'local' || input.target.runtime !== 'host') {
    throw new Error('Assigned agent accounts are not supported on this execution target.')
  }
  const { account } = input
  if (account.provider === 'claude') {
    const home =
      input.purpose === 'read'
        ? await services.claude.resolveManagedAccountHome(account.accountId)
        : (await services.claude.prepareManagedAccountForLaunch(account.accountId)).configDir
    if (!home) {
      throw new Error('Assigned Claude account could not be prepared.')
    }
    return { account, home, env: { CLAUDE_CONFIG_DIR: home } }
  }
  const home =
    input.purpose === 'read'
      ? services.codex.resolveManagedAccountHome(account.accountId)
      : await services.prepareCodexLaunch(account.accountId, input.launchEnv ?? {})
  if (!home) {
    throw new Error('Assigned Codex account could not be prepared.')
  }
  return { account, home, env: { CODEX_HOME: home } }
}

export function resolveRuntimeManagedAgentAccount(
  input: ManagedAgentAccountPreparationInput,
  services: RuntimeManagedAccountServices,
  settings: AgentStatusHooksSettings
) {
  const codex = services.codexAccounts.runtimeHomeService
  const prepareCodex = createCodexRuntimeHomeLaunchPreparation({
    getRuntimeHome: () => codex,
    getSettings: () => settings
  })
  return prepareManagedAgentAccount(input, {
    claude: services.claudeAccounts,
    codex,
    prepareCodexLaunch: (accountId, env) =>
      prepareCodex({ runtime: 'host' }, env, { accountId, launchesCodex: true })
  })
}

export async function validateRuntimeManagedAgentAccountPreferencePatch(
  patch: AgentAccountPreferencePatch,
  target: ManagedAgentAccountPreparationInput['target'],
  launchDirectory: string,
  services: RuntimeManagedAccountServices,
  settings: AgentStatusHooksSettings
): Promise<void> {
  for (const provider of ['claude', 'codex'] as const) {
    const account = patch[provider]
    if (!account) {
      continue
    }
    await resolveRuntimeManagedAgentAccount(
      {
        account: { provider, accountId: account.accountId },
        target,
        launchDirectory,
        purpose: 'read'
      },
      services,
      settings
    )
  }
}

export function createRuntimeManagedAgentAccountAccess(
  getServices: () => RuntimeManagedAccountServices
) {
  return {
    resolveAssignedAgentAccount: (
      input: ManagedAgentAccountPreparationInput,
      settings: AgentStatusHooksSettings
    ) => resolveRuntimeManagedAgentAccount(input, getServices(), settings),
    validateAgentAccountPreferencePatch: (
      patch: AgentAccountPreferencePatch,
      target: ManagedAgentAccountPreparationInput['target'],
      launchDirectory: string,
      settings: AgentStatusHooksSettings
    ) =>
      validateRuntimeManagedAgentAccountPreferencePatch(
        patch,
        target,
        launchDirectory,
        getServices(),
        settings
      )
  }
}
