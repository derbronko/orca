import { withClaudeProfileTerminalEnv } from '../../../claude-accounts/profiles/routing/claude-profile-installed-router'
import { mintPtySessionId } from '../../../daemon/sessions/pty-session-id'
import { LocalPtyProvider } from '../../../providers/local-pty/local-pty-provider'
import {
  isClaudeLaunchCommand,
  recoverFreshSpawnProviderRouting,
  routesFreshSpawnsToLocalProvider
} from '../host-env/fresh-spawn-routing'
import { getProvider } from '../provider/registry'
import { resolvePtySpawnStartupTarget } from '../spawn-startup-target'
import type { PtyIpcSpawnState } from './spawn-state'
import { localPtySpawnCwd } from '../host-env/spawn-cwd'
import { getConnectionExecutionHostId } from '../../../../shared/execution-host'
import { isRestoreSpawnIntent } from '../../../../shared/terminal/pty/admission/spawn-admission-contract'
import {
  resolvePtyAgentAccountBinding,
  stripPtyClaudeAuthForAccountBinding,
  withPtyAccountBinding
} from '../host-env/pty-agent-account-binding'

export async function preparePtyIpcSpawnPreflight(ctx: PtyIpcSpawnState): Promise<void> {
  const args = ctx.args
  // Establish local daemon identity before yielding so early output can be hidden; SSH execution is rejected here.
  ctx.provider = getProvider(getConnectionExecutionHostId(args.connectionId))
  ctx.isDaemonHostSpawn =
    !(ctx.provider instanceof LocalPtyProvider) && !routesFreshSpawnsToLocalProvider(ctx.provider)
  ctx.ownsNewIncarnation = args.sessionId === undefined && ctx.isDaemonHostSpawn
  ctx.effectiveSessionId =
    args.sessionId ?? (ctx.isDaemonHostSpawn ? mintPtySessionId(args.worktreeId) : undefined)
  ctx.effectiveSessionAppId = ctx.effectiveSessionId
  ctx.initiallyHidden = args.initiallyHidden === true
  ctx.preSpawnHiddenMarkId =
    ctx.initiallyHidden && ctx.isDaemonHostSpawn && ctx.effectiveSessionAppId !== undefined
      ? ctx.effectiveSessionAppId
      : null
  if (ctx.preSpawnHiddenMarkId !== null) {
    ctx.deps.transitionSpawnHiddenRendererPtyDeliveryState(ctx.preSpawnHiddenMarkId, true)
  }
  if (!ctx.earlyStablePaneOwner) {
    const admission = ctx.deps.assertWorkspaceAcceptsNewPty(
      args.worktreeId,
      args.sessionId,
      localPtySpawnCwd(args),
      args.wslPassiveRestore === true,
      args.connectionId
    )
    if (admission) {
      await admission
    }
  }
  ctx.spawnTiming.mark('stable_adoption_setup')
  ctx.preAdoptedStablePane = null
  ctx.spawnTiming.mark('stable_adoption')
  if (ctx.earlyStablePaneOwner && !ctx.preAdoptedStablePane) {
    const admission = ctx.deps.assertWorkspaceAcceptsNewPty(
      args.worktreeId,
      args.sessionId,
      localPtySpawnCwd(args),
      args.wslPassiveRestore === true,
      args.connectionId
    )
    if (admission) {
      await admission
    }
  }
  const freshSpawnRecovery = ctx.preAdoptedStablePane
    ? undefined
    : recoverFreshSpawnProviderRouting(ctx.provider, args.sessionId)
  if (freshSpawnRecovery) {
    await freshSpawnRecovery
    const previousHiddenMarkId = ctx.preSpawnHiddenMarkId
    ctx.isDaemonHostSpawn =
      !(ctx.provider instanceof LocalPtyProvider) && !routesFreshSpawnsToLocalProvider(ctx.provider)
    ctx.ownsNewIncarnation = args.sessionId === undefined && ctx.isDaemonHostSpawn
    ctx.effectiveSessionId =
      args.sessionId ?? (ctx.isDaemonHostSpawn ? mintPtySessionId(args.worktreeId) : undefined)
    ctx.effectiveSessionAppId = ctx.effectiveSessionId
    ctx.preSpawnHiddenMarkId =
      ctx.initiallyHidden && ctx.isDaemonHostSpawn && ctx.effectiveSessionAppId !== undefined
        ? ctx.effectiveSessionAppId
        : null
    if (previousHiddenMarkId !== ctx.preSpawnHiddenMarkId) {
      if (previousHiddenMarkId !== null) {
        ctx.deps.transitionSpawnHiddenRendererPtyDeliveryState(previousHiddenMarkId, false)
      }
      if (ctx.preSpawnHiddenMarkId !== null) {
        ctx.deps.transitionSpawnHiddenRendererPtyDeliveryState(ctx.preSpawnHiddenMarkId, true)
      }
    }
  }
  ctx.isClaudeLaunch =
    !ctx.preAdoptedStablePane &&
    (args.launchAgent === 'claude' ||
      isClaudeLaunchCommand(args.command ?? args.launchConfig?.agentCommand))
  // Stable caller IDs preserve reconnect state; failure cleanup must remove only IDs minted by this request.
  const target = await resolvePtySpawnStartupTarget({
    worktreeId: args.worktreeId,
    cwd: args.cwd,
    sessionId: ctx.effectiveSessionId,
    shellOverride: args.shellOverride,
    plannedPty: ctx.paneAgentLaunch?.launchRuntime?.pty,
    projectRuntimeSource: { kind: 'sent', projectRuntime: args.projectRuntime },
    preAdopted: ctx.preAdoptedStablePane !== null,
    getSettings: ctx.deps.getSettings,
    resolveStartupCwd: (id, cwd, fallback) =>
      ctx.deps.resolvePtySpawnStartupCwd(id, cwd, fallback, args.connectionId),
    ...(args.wslPassiveRestore === true
      ? {
          wslStartHold: {
            wslPassiveRestore: true,
            sessionId: ctx.effectiveSessionId,
            isNewSession: ctx.ownsNewIncarnation,
            attachOnly: args.attachOnlyView === true
          }
        }
      : {})
  })
  ctx.cwd = target.cwd
  ctx.prevalidatedCwd = target.prevalidatedCwd
  ctx.requestedCwd = target.requestedCwd
  ctx.correctStartupCwd = target.correctStartupCwd
  ctx.startupCwdFallback = target.startupCwdFallback
  ctx.terminalRuntimeOptions = target.terminalRuntimeOptions
  ctx.expectedWslDistro = target.expectedWslDistro
  ctx.wslHoldReadAnchor = target.wslHoldReadAnchor
  ctx.codexSelectionTarget = target.codexSelectionTarget
  ctx.spawnTiming.mark('preflight')
  const requestedProvider =
    args.launchAgent === 'claude' || ctx.isClaudeLaunch
      ? 'claude'
      : args.launchAgent === 'codex'
        ? 'codex'
        : undefined
  const accountBinding = resolvePtyAgentAccountBinding({
    provider: requestedProvider,
    launchConfig: args.launchConfig,
    workspaceId: args.worktreeId,
    executionHostId: getConnectionExecutionHostId(args.connectionId),
    target: ctx.codexSelectionTarget,
    store: ctx.deps.store,
    allowWorkspacePreference:
      !ctx.preAdoptedStablePane &&
      !args.attachOnlyView &&
      args.resumeOrigin !== 'saved' &&
      !args.resumeProviderSession &&
      !isRestoreSpawnIntent(args.spawnIntent) &&
      args.sessionId === undefined
  })
  if (accountBinding && args.launchAgent && accountBinding.provider !== args.launchAgent) {
    throw new Error(`This pane is bound to a ${accountBinding.provider} account.`)
  }
  if (accountBinding) {
    args.launchConfig = withPtyAccountBinding(args.launchConfig, args.command, accountBinding)
  }
  args.env =
    accountBinding?.provider === 'claude'
      ? stripPtyClaudeAuthForAccountBinding(args.env)
      : withClaudeProfileTerminalEnv(args.env, ctx.codexSelectionTarget)
  ctx.claudeAuth =
    accountBinding?.provider === 'claude' && ctx.deps.prepareClaudeAuth
      ? await ctx.deps.prepareClaudeAuth(ctx.codexSelectionTarget, {
          accountId: accountBinding.accountId
        })
      : ctx.isClaudeLaunch && ctx.deps.prepareClaudeAuth
        ? await ctx.deps.prepareClaudeAuth(ctx.codexSelectionTarget)
        : null
  if (
    accountBinding?.provider === 'claude' &&
    (!ctx.claudeAuth ||
      ctx.claudeAuth.provenance !== `profile:${accountBinding.accountId}` ||
      ctx.claudeAuth.envPatch.CLAUDE_CONFIG_DIR !== ctx.claudeAuth.configDir)
  ) {
    throw new Error('The assigned Claude account could not be prepared for this launch.')
  }
  ctx.spawnTiming.mark('auth')
}
