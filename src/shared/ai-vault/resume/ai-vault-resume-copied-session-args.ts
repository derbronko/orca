import type { AiVaultAgent } from '../contracts/ai-vault-types'
import type { AiVaultResumeStartupArgs } from './ai-vault-resume-startup'
import {
  quoteStartupArg,
  resolveStartupShell,
  tokenizeStartupCommand
} from '../../agent-launch/startup/tui-agent-startup-shell'
import {
  getTuiAgentLaunchCommand,
  isTuiAgent,
  TUI_AGENT_CONFIG
} from '../../agent-launch/catalog/tui-agent-config'
import { findOptionOccurrence } from '../../command-option-occurrence'
import { resolveTuiAgentLaunchRawArgs } from '../../agent-launch/choices/tui-agent-launch-defaults'

/** The agent arguments a copied conversation opens with: the source chat's launch mode, then the configured arguments. */
export function resolveAiVaultCopiedSessionAgentArgs(
  args: AiVaultResumeStartupArgs & { sourceAgent: AiVaultAgent }
): string {
  const { session, settings, sourceAgent } = args
  const { platform, liveShell } = args.host
  const shell = resolveStartupShell(platform, liveShell)
  const configuredArgs = isTuiAgent(session.agent)
    ? resolveTuiAgentLaunchRawArgs(session.agent, settings, undefined, shell)
    : ''
  const configured = tokenizeStartupCommand(configuredArgs, shell)
  if (!configured.ok) {
    throw new Error('This session cannot be opened in the CLI.')
  }
  const commandOverride =
    args.commandOverride?.trim() || settings?.agentCmdOverrides?.[session.agent]?.trim()
  const mode =
    sourceAgent !== session.agent &&
    isTuiAgent(sourceAgent) &&
    !commandOverride &&
    !findOptionOccurrence(configured.tokens, ['--standalone'], true)
      ? tokenizeStartupCommand(
          getTuiAgentLaunchCommand(TUI_AGENT_CONFIG[sourceAgent], platform),
          shell
        )
      : null
  if (mode && !mode.ok) {
    throw new Error('This session cannot be opened in the CLI.')
  }
  return [
    mode?.ok
      ? mode.tokens
          .slice(1)
          .map((token) => quoteStartupArg(token, shell))
          .join(' ')
      : '',
    configuredArgs
  ]
    .filter(Boolean)
    .join(' ')
}
