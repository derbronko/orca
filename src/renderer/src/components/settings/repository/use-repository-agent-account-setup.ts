import type { Repo } from '../../../../../shared/repo-types'
import { getRepoExecutionHostId } from '../../../../../shared/execution-host'
import { useAppStore } from '@/store/index'
import { getProjectHostSetupProjectionFromState } from '../../../store/projects/project-host-setup-selector'
import { getLocalRepoProjectExecutionRuntimeContext } from '../../../runtime/hosts/preflight/local-preflight-context'

export function useRepositoryAgentAccountSetup(
  repo: Repo,
  selectedProjectSetupId: string | undefined,
  isLocalWindowsProject: boolean
) {
  const selectedHostId = getRepoExecutionHostId(repo)
  const setup = useAppStore((state) => {
    const setups = getProjectHostSetupProjectionFromState(state).setups
    return (
      setups.find(
        (candidate) =>
          candidate.id === selectedProjectSetupId &&
          candidate.repoId === repo.id &&
          (candidate.executionHostId ?? candidate.hostId) === selectedHostId
      ) ??
      setups.find(
        (candidate) =>
          candidate.repoId === repo.id &&
          (candidate.executionHostId ?? candidate.hostId) === selectedHostId
      ) ??
      null
    )
  })
  const updateProjectHostSetup = useAppStore((state) => state.updateProjectHostSetup)
  const unsupportedRuntime = useAppStore((state) => {
    if (!isLocalWindowsProject) {
      return false
    }
    const resolution = getLocalRepoProjectExecutionRuntimeContext(state, repo.id)
    return (
      resolution?.status === 'repair-required' ||
      (resolution?.status === 'resolved' && resolution.runtime.kind === 'wsl')
    )
  })
  return { setup, updateProjectHostSetup, unsupportedRuntime }
}
