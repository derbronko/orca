import { ipcMain, type BrowserWindow } from 'electron'
import type { Store } from '../../../persistence/loading-store/store'
import type { OrcaRuntimeService } from '../../../runtime/orca-runtime'
import type { WorktreeMetaUpdate } from '../../../../shared/worktree/meta-types'
import { displayNameUpdatePinsLabel } from '../../../../shared/worktree/metadata/display-name-provenance'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { stripOrcaProvenanceMetaUpdates } from '../../../workspaces/removal/worktree-removal-safety'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import { notifyWorktreesChanged } from '../../worktree-remote'
import { parseWorktreeId } from '../../worktree-logic'
import {
  writeWorktreeSortOrder,
  type WorktreeSortOrderRequest
} from '../../../persistence/worktree-sort-order-write'
import { readBranchRenameFailureOutputForDisplay } from '../../../agent-hooks/first-work/branch-rename-failure-output'
import { normalizeLinkedWorkItemFields } from '../ipc-context-schemas'
import { isRemovedFolderWorkspaceInstance } from '../../../workspaces/catalog/folder-workspace-meta-presence'
import { resolveWorktreeMetaOwner } from '../../../persistence/host-qualified-worktree-meta'
import { hostWorktreeTarget } from '../../../../shared/worktree/host-qualified-identity'
import { worktreeWorkspaceKey } from '../../../../shared/workspace-scope'
import {
  isWslMoveSourceHost,
  isWslMoveWorkspaceBlocked,
  shouldDropWslMoveProjectUpdate,
  wslMoveProjectRefForWorkspace
} from '../../../persistence/moving-wsl-projects/quiescence/wsl-move-scope-guard'

type WorktreeMetadataStore = Pick<
  Store,
  | 'getRepo'
  | 'getRepos'
  | 'setWorktreeMeta'
  | 'getWorktreeMeta'
  | 'getWorktreeMetaForHost'
  | 'getAllWorktreeLineage'
  | 'getAllWorkspaceLineage'
  | 'getAllCrossStoreWorkspaceLineage'
  | 'getWorktreeLineage'
  | 'getWorkspaceLineage'
>

type WorktreeMetadataRuntime = Pick<
  OrcaRuntimeService,
  'notifyWorktreesChangedForRemoteClients' | 'readStoreInstallationId' | 'updateManagedWorktreeMeta'
>

export function registerWorktreeMetadataHandlers(context: {
  mainWindow: BrowserWindow
  store: WorktreeMetadataStore
  runtime: WorktreeMetadataRuntime
}): void {
  const { mainWindow, store, runtime } = context
  ipcMain.handle(
    'worktrees:updateMeta',
    async (
      _event,
      args: {
        worktreeId: string
        executionHostId?: string
        updates: WorktreeMetaUpdate
      }
    ) => {
      const executionHostId =
        args.executionHostId === undefined
          ? undefined
          : parseExecutionHostId(args.executionHostId)?.id
      if (args.executionHostId !== undefined && !executionHostId) {
        throw new Error('Invalid execution host identity.')
      }
      if (
        isWslMoveSourceHost(executionHostId) &&
        shouldDropWslMoveProjectUpdate(
          store,
          wslMoveProjectRefForWorkspace(args.worktreeId),
          args.updates
        )
      ) {
        return null
      }
      const validatedUpdates = normalizeLinkedWorkItemFields(args.updates)
      const updates =
        validatedUpdates.displayName !== undefined
          ? {
              ...validatedUpdates,
              // Persist label provenance on the host rather than trusting renderer metadata.
              displayNameIsPinned: displayNameUpdatePinsLabel(validatedUpdates.displayName),
              pendingFirstAgentMessageRename: false,
              firstAgentMessageRenameError: null
            }
          : validatedUpdates
      const sanitizedUpdates = stripOrcaProvenanceMetaUpdates(updates)
      // Late terminal activity must not resurrect a removed folder instance (#22712).
      if (isRemovedFolderWorkspaceInstance(store, args.worktreeId, executionHostId)) {
        return null
      }
      const target = executionHostId
        ? hostWorktreeTarget({ id: args.worktreeId, hostId: executionHostId })
        : resolveWorktreeMetaOwner(store, args.worktreeId)
      if (!target) {
        return null
      }
      const accountPatch = sanitizedUpdates.agentAccounts
      if (
        accountPatch &&
        Object.values(accountPatch).some((value) => value !== null && value !== undefined)
      ) {
        const worktree = await runtime.updateManagedWorktreeMeta(
          `id:${args.worktreeId}`,
          sanitizedUpdates,
          target.hostId
        )
        if (args.updates.displayName !== undefined) {
          runtime.notifyWorktreesChangedForRemoteClients(getRepoIdFromWorktreeId(args.worktreeId))
        }
        return worktree
      }
      const meta = store.setWorktreeMeta(target, sanitizedUpdates)
      // Local optimistic state is current; notifying it would re-sort the sidebar (#209).
      if (args.updates.displayName !== undefined) {
        // Remote clients need rename pushes; per-click unread changes must remain event-free.
        runtime.notifyWorktreesChangedForRemoteClients(getRepoIdFromWorktreeId(args.worktreeId))
      }
      return meta
    }
  )

  ipcMain.handle('worktrees:listLineage', async () => {
    return {
      lineage: store.getAllWorktreeLineage(),
      workspaceLineage: store.getAllWorkspaceLineage(),
      crossStoreLineage: store.getAllCrossStoreWorkspaceLineage(),
      installationId: await runtime.readStoreInstallationId()
    }
  })

  ipcMain.handle(
    'worktrees:updateLineage',
    async (_event, args: { worktreeId: string; parentWorktreeId?: string; noParent?: boolean }) => {
      await runtime.updateManagedWorktreeMeta(args.worktreeId, {
        lineage:
          args.noParent === true
            ? { noParent: true }
            : args.parentWorktreeId
              ? { parentWorktree: `id:${args.parentWorktreeId}` }
              : undefined
      })
      notifyWorktreesChanged(mainWindow, parseWorktreeId(args.worktreeId).repoId)
      return {
        lineage: store.getWorktreeLineage(args.worktreeId) ?? null,
        workspaceLineage: store.getWorkspaceLineage(worktreeWorkspaceKey(args.worktreeId)) ?? null
      }
    }
  )

  ipcMain.handle('worktrees:persistSortOrder', (_event, args: WorktreeSortOrderRequest) => {
    if (!Array.isArray(args?.orderedIds) || args.orderedIds.length === 0) {
      return
    }
    writeWorktreeSortOrder(
      store,
      args,
      (worktreeId) => isWslMoveWorkspaceBlocked(store, worktreeId),
      Date.now()
    )
  })

  ipcMain.handle(
    'worktrees:getBranchRenameFailureOutput',
    (_event, args: { worktreeId: string }) => {
      if (typeof args?.worktreeId !== 'string' || args.worktreeId.length === 0) {
        return null
      }
      return readBranchRenameFailureOutputForDisplay(args.worktreeId)
    }
  )
}
