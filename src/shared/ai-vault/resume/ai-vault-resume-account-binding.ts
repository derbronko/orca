import type { AiVaultSession } from '../contracts/ai-vault-types'
import type { ManagedAgentAccountRef } from '../../agent-accounts/agent-account-preference'
import type { SleepingAgentLaunchConfig } from '../../agent-session/lifecycle/agent-session-resume'

export type AiVaultResumeCommandSession = Pick<
  AiVaultSession,
  'agent' | 'sessionId' | 'cwd' | 'codexHome'
> &
  Partial<
    Pick<AiVaultSession, 'executionHostId' | 'executionHostPlatform' | 'resumeCommand' | 'filePath'>
  > & {
    accountBinding?: ManagedAgentAccountRef
  }

export function retainResumeAccountBinding(
  launchConfig: SleepingAgentLaunchConfig,
  accountBinding: ManagedAgentAccountRef | undefined
): SleepingAgentLaunchConfig {
  return accountBinding ? { ...launchConfig, accountBinding } : launchConfig
}
