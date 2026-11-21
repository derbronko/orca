import type { AgentProviderSessionMetadata } from '../../../../shared/agent-session/lifecycle/agent-session-resume'
import type { CodexAccountSelectionTarget } from '../../../../shared/codex-selection-lane'
import {
  trustedCodexResumeHomes,
  type CodexSessionResumePreparation
} from './codex-session-resume-home'
import { prepareCodexSessionResume } from './codex-session-resume-preparation'
import {
  prepareCodexAccountRestartResume,
  prepareLegacySharedCodexSessionResume
} from './codex-legacy-session-resume'
import { ManagedCodexHomeTemporarilyUnavailableError } from '../../../codex-accounts/managed-homes/host-codex-managed-home-ownership'
import { codexHookService } from '../../hooks/installation/hook-service'
import { reconcileCodexHooksForLaunch } from '../../hooks/reconciliation/codex-hook-reconcile'
import { ensureCodexDaemonSocketGuard } from '../../configuration/settings/codex-config-mirror'
import { isAgentStatusHooksEnabledForAgent } from '../../../../shared/agent-hook-listener/configuration/agent-status-hooks-setting'
import {
  getOrcaManagedCodexHomePath,
  getSystemCodexHomePath
} from '../../configuration/homes/codex-home-paths'
import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import type { CodexRuntimeHomeService } from '../../../codex-accounts/runtime-home-service'
import type { GlobalSettings } from '../../../../shared/global-settings-types'

export function createCodexSessionResumeLaunchPreparation(deps: {
  getRuntimeHome: () => CodexRuntimeHomeService | null
  getSettings: () => GlobalSettings | undefined
}) {
  // Pinned homes bypass the selected-account preparation done by pane spawn.
  async function prepareCodexPinnedLaunchHome(
    home: string,
    systemHomePath: string = getSystemCodexHomePath()
  ): Promise<void> {
    const isSystemHome =
      normalizeRuntimePathForComparison(home) === normalizeRuntimePathForComparison(systemHomePath)
    const isHooksEnabled = (): boolean =>
      isAgentStatusHooksEnabledForAgent(deps.getSettings(), 'codex')
    try {
      if (isSystemHome) {
        await reconcileCodexHooksForLaunch()
      } else if (isHooksEnabled()) {
        await codexHookService.installForLaunchPrep(home, true, isHooksEnabled)
      } else {
        await codexHookService.refreshRuntimeUserHooksForLaunchPrep(home)
      }
    } catch (error) {
      // Hook repair must not prevent launch in the verified home.
      console.warn('[codex-hook-service] failed to prepare automatic resume home:', error)
    }
    if (!isSystemHome) {
      // Hook repair may skip or fail before its config mirror applies the guard.
      ensureCodexDaemonSocketGuard(home)
    }
  }

  async function prepareCodexSessionResumeForLaunch(args: {
    providerSession: AgentProviderSessionMetadata
    target: CodexAccountSelectionTarget
    launchEnv?: NodeJS.ProcessEnv
    useSelectedAccount?: boolean
    accountId?: string
  }): Promise<CodexSessionResumePreparation | null> {
    if (args.accountId && args.target.runtime === 'wsl') {
      throw new Error('Explicit Codex accounts are not supported on WSL.')
    }
    const runtimeHome = deps.getRuntimeHome()
    if (args.accountId && !runtimeHome) {
      throw new Error('Codex runtime home service is not initialized')
    }
    if (args.accountId && !deps.getSettings()) {
      throw new Error('Codex account settings are unavailable for this session.')
    }
    if (args.target.runtime === 'wsl' || !runtimeHome || !deps.getSettings()) {
      return null
    }
    const systemHomePath = getSystemCodexHomePath()
    const assignedHome = args.accountId
      ? runtimeHome.resolveManagedAccountHome(args.accountId)
      : undefined
    const trustedHomes = assignedHome
      ? [assignedHome]
      : trustedCodexResumeHomes(runtimeHome, systemHomePath)
    // Refuse unreadable selections before provenance matching can choose another account.
    const selectedAccountCodexHome = assignedHome
      ? assignedHome
      : runtimeHome.resolveSelectedHostAccountCodexHomePathForResume()
    const preparation = await prepareCodexSessionResume({
      sessionId: args.providerSession.id,
      transcriptPath: args.providerSession.transcriptPath,
      trustedCodexHomes: trustedHomes,
      getSelectedAccountCodexHome: () => selectedAccountCodexHome,
      systemCodexHomePath: systemHomePath,
      sharedRuntimeCodexHomePath: assignedHome ? null : getOrcaManagedCodexHomePath(),
      resolveVerifiedResumeHome: async (sessionSource) => {
        if (assignedHome) {
          if (
            normalizeRuntimePathForComparison(sessionSource.homePath) !==
            normalizeRuntimePathForComparison(assignedHome)
          ) {
            throw new Error(
              'The saved Codex session does not belong to the assigned Codex account.'
            )
          }
          await prepareCodexPinnedLaunchHome(assignedHome, systemHomePath)
          return assignedHome
        }
        let migrated = { useRealCodexHome: false }
        try {
          migrated = await prepareLegacySharedCodexSessionResume(
            {
              agent: 'codex',
              executionHostId: 'local',
              filePath: sessionSource.transcriptPath,
              codexHome: sessionSource.homePath
            },
            {
              isHostSystemDefaultRealHomeSelected: () =>
                runtimeHome.isHostSystemDefaultRealHomeSelected(),
              systemCodexHomePath: systemHomePath
            }
          )
        } catch (error) {
          // A credential-read refusal must never fall back to the old account.
          if (error instanceof ManagedCodexHomeTemporarilyUnavailableError) {
            throw error
          }
          // Failed migration can still resume from the verified origin home.
          console.warn(
            '[codex-session-resume] Legacy rollout migration failed; using origin home:',
            error
          )
        }
        const resumeHome = args.useSelectedAccount
          ? await prepareCodexAccountRestartResume({
              sourceHome: sessionSource.homePath,
              transcriptPath: sessionSource.transcriptPath,
              targetHome: selectedAccountCodexHome ?? systemHomePath,
              systemCodexHomePath: systemHomePath
            })
          : migrated.useRealCodexHome
            ? systemHomePath
            : sessionSource.homePath
        await prepareCodexPinnedLaunchHome(resumeHome, systemHomePath)
        return resumeHome
      }
    })
    if (assignedHome && preparation.outcome !== 'resume') {
      throw new Error(
        'The saved Codex session does not belong to the assigned Codex account or could not be verified there.'
      )
    }
    return preparation.outcome === 'resume'
      ? {
          ...preparation,
          reconcileSharedRuntimeAuth:
            !assignedHome &&
            normalizeRuntimePathForComparison(preparation.codexHomePath) ===
              normalizeRuntimePathForComparison(getOrcaManagedCodexHomePath())
        }
      : preparation
  }

  return { prepareCodexSessionResumeForLaunch, prepareCodexPinnedLaunchHome }
}
