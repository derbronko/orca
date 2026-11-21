import type { StructuredAgentId } from '../../../shared/agent-session/lifecycle/agent-session-provider-handle'
import { structuredAgentRuntimeMetadata } from '../agent-session/installation/structured-agent-runtime-metadata'
import { getProfileUserDataPath } from '../../orca-profiles/profile-storage-paths'
import { resolveHostStructuredAgentLaunchEnvironment } from '../agent-session/launch/structured-agent-launch-support'
import {
  agentWorkspaceTrustDecisionForWorkspace,
  applyStructuredCodexWorkspaceTrust
} from '../../agent-launch/trust/agent-workspace-trust-spawn'
import type { ManagedAgentAccountRef } from '../../../shared/agent-accounts/agent-account-preference'
import { agentSessionRefusalError } from '../../../shared/agent-session/failures/agent-session-wire-refusals'
import { resolveScopedAgentAccountPreference } from '../agent-session/environment/scoped-agent-account-preference'
import { agentSessionAccountHome } from '../../../shared/agent-session/lifecycle/agent-session-account-home'
import { OrcaRuntimeWithStructuredSessionCliWriterHost } from './structured-session-cli-writer-host'
import type { AgentSessionAccountHome } from '../../../shared/agent-session/lifecycle/agent-session-account-home'
import type {
  AgentSessionRecord,
  AgentSessionExecutionLocation
} from '../../../shared/agent-session/lifecycle/agent-session-record'

export type StructuredCreateAccountHomeResolver = (
  context: { launchEnv: NodeJS.ProcessEnv; location: AgentSessionExecutionLocation },
  permissionMode?: string
) => AgentSessionAccountHome | Promise<AgentSessionAccountHome>

export abstract class OrcaRuntimeWithStructuredSessionAccountHome extends OrcaRuntimeWithStructuredSessionCliWriterHost {
  async resolveStructuredAgentAccountHome(
    agent: StructuredAgentId
  ): Promise<AgentSessionAccountHome> {
    const resolveAccountHome = this.structuredAgentAccountHomeResolver(agent, '', 'read')
    if (!resolveAccountHome) {
      throw agentSessionRefusalError('structured_agent_session_unsupported', {
        reason: 'hostUnsupported'
      })
    }
    await this.accounts.prepareHostAgentLaunch(null)
    const launchEnv = this.structuredAgentLaunchEnv(agent, this.requireStore().getSettings())
    return resolveAccountHome({ launchEnv, location: null })
  }

  protected async prepareStructuredAgentCreateAccount(input: {
    agent: StructuredAgentId
    location: AgentSessionExecutionLocation
    resume?: { accountBinding?: ManagedAgentAccountRef }
    launchEnv: () => NodeJS.ProcessEnv
    resolveAccountHome: StructuredCreateAccountHomeResolver
    permissionMode?: string
  }) {
    const accountBinding = input.resume
      ? input.resume.accountBinding
      : this.scopedManagedAgentAccount(input.agent, input.location)
    if (!accountBinding) {
      await this.accounts.prepareHostAgentLaunch(input.agent)
    }
    const launchEnv = input.launchEnv()
    const selectedAccountHome = accountBinding
      ? await this.assignedStructuredAgentAccountHome(
          accountBinding,
          input.location,
          'launch',
          (await this.resolveRuntimeFileTarget(input.location.workspaceId)).worktree.path,
          launchEnv
        )
      : await input.resolveAccountHome(
          { launchEnv, location: input.location },
          input.permissionMode
        )
    return { accountBinding, selectedAccountHome, launchEnv }
  }

  protected scopedManagedAgentAccount(
    agent: string,
    location: AgentSessionExecutionLocation
  ): ManagedAgentAccountRef | undefined {
    if (agent !== 'claude' && agent !== 'codex') {
      return undefined
    }
    return (
      resolveScopedAgentAccountPreference(this.requireStore(), agent, location).account ?? undefined
    )
  }

  protected async assignedStructuredAgentAccountHome(
    account: ManagedAgentAccountRef,
    location: AgentSessionExecutionLocation,
    purpose: 'launch' | 'read',
    launchDirectory: string,
    launchEnv: NodeJS.ProcessEnv = {}
  ): Promise<AgentSessionAccountHome> {
    const settings = this.requireStore().getSettings()
    const resolved = await this.accounts.managedAgentAccounts.resolveAssignedAgentAccount(
      {
        account,
        target: {
          hostId: location.executionHostId,
          runtime: location.wslDistro ? 'wsl' : 'host',
          ...(location.wslDistro ? { wslDistro: location.wslDistro } : {})
        },
        launchDirectory,
        launchEnv,
        purpose
      },
      settings
    )
    if (purpose === 'launch' && account.provider === 'codex') {
      await applyStructuredCodexWorkspaceTrust({
        workspacePath: launchDirectory,
        launchEnv,
        codexHome: resolved.home,
        settings,
        repoDecision:
          location.workspaceKind === 'folder'
            ? undefined
            : agentWorkspaceTrustDecisionForWorkspace(location.workspaceId, this.requireStore())
      })
    }
    return agentSessionAccountHome(
      { accountHomeVariable: account.provider === 'claude' ? 'CLAUDE_CONFIG_DIR' : 'CODEX_HOME' },
      resolved.home
    )
  }

  /** Resolve account home through this host's agent registration; null means unregistered and create refuses. */
  protected structuredAgentAccountHomeResolver(
    agent: StructuredAgentId,
    worktree: string,
    purpose: 'launch' | 'read' | 'identity',
    hostLaunchDirectory?: string
  ) {
    const registration = structuredAgentRuntimeMetadata(agent)
    if (!registration) {
      return null
    }
    return async ({ launchEnv, location }, permissionMode?: string) =>
      registration.resolveAccountHome(
        {
          launchEnv,
          location: location ?? null,
          purpose,
          ...(permissionMode ? { permissionMode } : {}),
          workspacePath:
            purpose === 'launch'
              ? async () =>
                  hostLaunchDirectory ??
                  (await this.resolveRuntimeFileTarget(worktree)).worktree.path
              : null
        },
        {
          getClaudeConfigDirectory: (target) => this.accounts.getClaudeConfigDirectory(target),
          prepareCodexLaunchHome: this.prepareCodexStructuredLaunchFn,
          readCodexLaunchHome: this.resolveCodexStructuredLaunchHomeFn,
          workspaceTrustSettings: () => this.requireStore().getSettings(),
          workspaceTrustRepoDecision: (launchLocation) =>
            launchLocation?.workspaceKind === 'folder'
              ? undefined
              : agentWorkspaceTrustDecisionForWorkspace(
                  launchLocation?.workspaceId,
                  this.requireStore()
                ),
          // The chat host's own state root (ensureStructuredAgentSessionHost).
          stateDirectory: getProfileUserDataPath(),
          hostLaunchEnvironment: (agent) =>
            resolveHostStructuredAgentLaunchEnvironment(agent, this.requireStore().getSettings()),
          hostSettings: () => this.requireStore().getSettings()
        }
      )
  }

  /** The account home a start of this chat would launch under now, read without side effects; null
   *  for an agent whose chats keep the account they were created on. `identity` names it before its
   *  folder exists; the default read checks availability. */
  async resolveStructuredAgentLaunchAccountHome(
    record: AgentSessionRecord,
    purpose: 'read' | 'identity' = 'read'
  ): Promise<AgentSessionAccountHome | null> {
    const { provider, location } = record
    if (record.accountBinding) {
      if (record.accountBinding.provider !== provider) {
        throw new Error('Assigned account provider mismatch.')
      }
      return this.assignedStructuredAgentAccountHome(record.accountBinding, location, 'read', '')
    }
    if (!structuredAgentRuntimeMetadata(provider)?.launchFollowsSelection?.()) {
      return null
    }
    const read = this.structuredAgentAccountHomeResolver(provider, '', purpose)
    const launchEnv = this.structuredAgentLaunchEnv(provider, this.requireStore().getSettings())
    return (await read?.({ launchEnv, location })) ?? null
  }

  /** The same account, prepared for a start in `launchDirectory` as a create prepares it. */
  async prepareStructuredAgentLaunchAccountHome(
    record: AgentSessionRecord,
    launchDirectory: string
  ): Promise<AgentSessionAccountHome | null> {
    const { provider, location } = record
    if (record.accountBinding) {
      if (record.accountBinding.provider !== provider) {
        throw new Error('Assigned account provider mismatch.')
      }
      return this.assignedStructuredAgentAccountHome(
        record.accountBinding,
        location,
        'launch',
        launchDirectory,
        this.structuredAgentLaunchEnv(provider, this.requireStore().getSettings())
      )
    }
    if (!structuredAgentRuntimeMetadata(provider)?.launchFollowsSelection?.()) {
      return null
    }
    const prepare = this.structuredAgentAccountHomeResolver(provider, '', 'launch', launchDirectory)
    await this.accounts.prepareHostAgentLaunch(provider)
    const launchEnv = this.structuredAgentLaunchEnv(provider, this.requireStore().getSettings())
    return (await prepare?.({ launchEnv, location })) ?? null
  }
}
