import type { SleepingAgentLaunchConfig } from './agent-session-resume'
import type { ManagedAgentAccountRef } from '../../agent-accounts/agent-account-preference'

export function buildSleepingAgentLaunchConfig(args: {
  agentCommand?: string | null
  agentArgs?: string | null
  agentEnv?: Record<string, string> | null
  ompResumeFilePath?: string | null
  accountBinding?: ManagedAgentAccountRef
}): SleepingAgentLaunchConfig {
  return {
    ...(args.agentCommand?.trim() ? { agentCommand: args.agentCommand } : {}),
    agentArgs: args.agentArgs ?? '',
    // Startup env may contain prompt/pane transport; persist only Orca-managed launch inputs.
    agentEnv: args.agentEnv ? { ...args.agentEnv } : {},
    ...(args.ompResumeFilePath?.trim() ? { ompResumeFilePath: args.ompResumeFilePath.trim() } : {}),
    ...(args.accountBinding ? { accountBinding: args.accountBinding } : {})
  }
}
