import type { AgentAccountPreferencePatch } from '../../../../shared/agent-accounts/agent-account-preference'
import type { FolderWorkspace } from '../../../../shared/folder-workspaces/folder-workspace-types'
import type { ProjectHostSetup } from '../../../../shared/project-types'
import type { Repo } from '../../../../shared/repo-types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { ProjectExecutionRuntimeResolution } from '../../../../shared/execution-host/project-execution-runtime'
import type { RuntimeAccountController } from './runtime-account-controller'
import type { RuntimeStore } from '../../construction/runtime-store-contract'
import {
  resolveLocalLaunchScopeRuntime,
  resolveLocalProjectRuntimeForProject,
  resolveLocalProjectRuntimeForRepo
} from '../../../workspaces/execution-host/local-project-runtime-resolution'

export function createRuntimeAgentAccountPreferenceValidationPorts(args: {
  accounts: RuntimeAccountController
  getStore: () => RuntimeStore
  resolveFolderConnectionId: (workspace: FolderWorkspace) => string | null
}) {
  return {
    projectHostSetup: {
      validateAgentAccountPreferencePatch: (
        patch: AgentAccountPreferencePatch,
        setup: ProjectHostSetup,
        repo?: Repo
      ) =>
        validateProjectHostSetupAgentAccounts({
          ...args,
          store: args.getStore(),
          patch,
          setup,
          repo
        })
    },
    folderWorkspace: {
      validateAgentAccountPreferencePatch: (
        patch: AgentAccountPreferencePatch,
        workspace: FolderWorkspace,
        hostId: string
      ) =>
        validateFolderWorkspaceAgentAccounts({
          ...args,
          store: args.getStore(),
          patch,
          workspace,
          hostId,
          connectionId: args.resolveFolderConnectionId(workspace)
        })
    }
  }
}

export async function validateAgentAccountPreferencePatch(args: {
  accounts: RuntimeAccountController
  patch: AgentAccountPreferencePatch
  hostId: string
  runtimeResolution?: ProjectExecutionRuntimeResolution
  launchDirectory: string
  store: RuntimeStore
}): Promise<void> {
  assertRuntimeSupportsAssignedAccounts(args.runtimeResolution)
  const runtime =
    args.runtimeResolution?.status === 'resolved' ? args.runtimeResolution.runtime : undefined
  await args.accounts.managedAgentAccounts.validateAgentAccountPreferencePatch(
    args.patch,
    {
      hostId: args.hostId,
      runtime: runtime?.kind === 'wsl' ? 'wsl' : 'host',
      ...(runtime?.kind === 'wsl' ? { wslDistro: runtime.distro } : {})
    },
    args.launchDirectory,
    args.store.getSettings()
  )
}

export async function validateProjectHostSetupAgentAccounts(args: {
  accounts: RuntimeAccountController
  store: RuntimeStore
  patch: AgentAccountPreferencePatch
  setup: ProjectHostSetup
  repo?: Repo
}): Promise<void> {
  const hostId = args.setup.executionHostId ?? args.setup.hostId
  const project = args.store.getProjects?.().find((entry) => entry.id === args.setup.projectId)
  const runtimeResolution =
    hostId !== LOCAL_EXECUTION_HOST_ID
      ? undefined
      : args.repo
        ? resolveLocalProjectRuntimeForRepo(args.store, args.repo)
        : project
          ? resolveLocalProjectRuntimeForProject(args.store, project)
          : undefined
  await validateAgentAccountPreferencePatch({
    accounts: args.accounts,
    patch: args.patch,
    hostId,
    runtimeResolution,
    launchDirectory: args.setup.path,
    store: args.store
  })
}

export async function validateFolderWorkspaceAgentAccounts(args: {
  accounts: RuntimeAccountController
  store: RuntimeStore
  patch: AgentAccountPreferencePatch
  workspace: FolderWorkspace
  hostId: string
  connectionId: string | null
}): Promise<void> {
  const runtimeResolution =
    args.hostId === LOCAL_EXECUTION_HOST_ID
      ? resolveLocalLaunchScopeRuntime(args.store, {
          id: `folder:${args.workspace.id}`,
          path: args.workspace.folderPath,
          connectionId: args.connectionId,
          repo: null,
          folderWorkspace: args.workspace
        })
      : undefined
  await validateAgentAccountPreferencePatch({
    accounts: args.accounts,
    patch: args.patch,
    hostId: args.hostId,
    runtimeResolution,
    launchDirectory: args.workspace.folderPath,
    store: args.store
  })
}

function assertRuntimeSupportsAssignedAccounts(
  resolution: ProjectExecutionRuntimeResolution | undefined
): void {
  if (resolution?.status === 'repair-required') {
    throw new Error(
      'Assigned agent accounts are not supported until the project runtime is repaired.'
    )
  }
}
