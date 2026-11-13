import {
  resolveAgentAccountPreference,
  type AccountPreferenceResolution,
  type AssignableAgentProvider
} from '../../../../shared/agent-accounts/agent-account-preference'
import {
  getConnectionExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import type { FolderWorkspace } from '../../../../shared/folder-workspaces/folder-workspace-types'
import type { ProjectHostSetup } from '../../../../shared/project-types'
import type { WorktreeMeta } from '../../../../shared/worktree/meta-types'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'

export type ScopedAccountPreferenceStore = {
  getWorktreeMetaForHost?: (
    workspaceId: string,
    hostId: ExecutionHostId
  ) => Pick<WorktreeMeta, 'agentAccounts' | 'projectHostSetupId'> | undefined
  getProjectHostSetups?: () => readonly Pick<
    ProjectHostSetup,
    'id' | 'repoId' | 'hostId' | 'agentAccounts'
  >[]
  getFolderWorkspace?: (
    id: string
  ) =>
    | Pick<FolderWorkspace, 'id' | 'executionHostId' | 'connectionId' | 'agentAccounts'>
    | undefined
}

export function resolveScopedAgentAccountPreference(
  store: ScopedAccountPreferenceStore,
  provider: AssignableAgentProvider,
  location: { workspaceId: string; executionHostId: ExecutionHostId }
): AccountPreferenceResolution {
  const scope = parseWorkspaceKey(location.workspaceId)
  if (scope?.type === 'folder') {
    const folder = store.getFolderWorkspace?.(scope.folderWorkspaceId)
    const folderHost = folder?.executionHostId ?? getConnectionExecutionHostId(folder?.connectionId)
    return resolveAgentAccountPreference({
      provider,
      workspace: folderHost === location.executionHostId ? folder?.agentAccounts : undefined
    })
  }
  const workspaceId = scope?.type === 'worktree' ? scope.worktreeId : location.workspaceId
  const meta = store.getWorktreeMetaForHost?.(workspaceId, location.executionHostId)
  const repoId = getRepoIdFromWorktreeId(workspaceId)
  const setups = (store.getProjectHostSetups?.() ?? []).filter(
    (setup) => setup.hostId === location.executionHostId && setup.repoId === repoId
  )
  const setup = meta?.projectHostSetupId
    ? setups.find((entry) => entry.id === meta.projectHostSetupId)
    : setups.length === 1
      ? setups[0]
      : undefined
  if (setups.length > 1 && !setup) {
    throw new Error('Choose an exact project host setup before starting an assigned agent.')
  }
  return resolveAgentAccountPreference({
    provider,
    workspace: meta?.agentAccounts,
    project: setup?.agentAccounts
  })
}
