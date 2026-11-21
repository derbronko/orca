import type { AgentAccountPreferences } from '../../../../../../shared/agent-accounts/agent-account-preference'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { useAppStore } from '../../../../store/index'
import { getProjectHostSetupProjectionFromState } from '../../../../store/projects/project-host-setup-selector'
import { getLocalRepoProjectExecutionRuntimeContext } from '@/runtime/hosts/preflight/local-preflight-context'

export function useWorktreeAgentAccountPreferenceTarget(worktree: Worktree, repo: Repo | null) {
  const executionHostId = worktree.hostId ?? (repo ? getRepoExecutionHostId(repo) : 'local')
  const projectPreferences = useAppStore((state): AgentAccountPreferences | undefined => {
    const setups = getProjectHostSetupProjectionFromState(state).setups
    const setup =
      setups.find(
        (candidate) =>
          candidate.id === worktree.projectHostSetupId && candidate.hostId === executionHostId
      ) ??
      (worktree.projectId
        ? setups.find(
            (candidate) =>
              candidate.projectId === worktree.projectId && candidate.hostId === executionHostId
          )
        : undefined) ??
      (repo && getRepoExecutionHostId(repo) === executionHostId
        ? setups.find(
            (candidate) => candidate.repoId === repo.id && candidate.hostId === executionHostId
          )
        : undefined)
    return setup?.agentAccounts
  })
  const wslUnsupported = useAppStore((state) => {
    const resolution = getLocalRepoProjectExecutionRuntimeContext(state, worktree.repoId)
    return (
      resolution?.status === 'repair-required' ||
      (resolution?.status === 'resolved' && resolution.runtime.kind === 'wsl')
    )
  })
  return { executionHostId, projectPreferences, wslUnsupported }
}
