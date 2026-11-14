import { BrowserWindow } from 'electron'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import { hostWorktreeTarget } from '../../../../shared/worktree/host-qualified-identity'
import {
  closeTestStores,
  createStore,
  testState
} from '../../../persistence/persistence-test-harness'
import { registerWorktreeMetadataHandlers } from './register-worktree-metadata-handlers'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, args: unknown) => unknown>()
}))

vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = { send: vi.fn() }
  },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, args: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  }
}))

async function invoke(channel: string, args: unknown): Promise<unknown> {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`Handler not registered: ${channel}`)
  }
  return handler(undefined, args)
}

function repo(id: string): Repo {
  return {
    id,
    path: join(testState.dir, id),
    displayName: id,
    badgeColor: '#000',
    addedAt: 0,
    kind: 'git'
  }
}

let store: ReturnType<typeof createStore>

describe('worktree metadata account validation through desktop IPC', () => {
  beforeEach(() => {
    handlers.clear()
    testState.dir = mkdtempSync(join(tmpdir(), 'worktree-account-pin-ipc-'))
    store = createStore()
    store.addRepo(repo('repo'))
  })

  afterEach(async () => {
    await closeTestStores()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('does not persist a managed account pin rejected by the runtime', async () => {
    const worktreeId = 'repo::C:/work'
    store.setWorktreeMeta(hostWorktreeTarget({ id: worktreeId, hostId: 'local' }), {
      comment: 'before'
    })
    registerWorktreeMetadataHandlers({
      mainWindow: new BrowserWindow(),
      store,
      runtime: {
        updateManagedWorktreeMeta: async () => {
          throw new Error('Unknown managed Codex account')
        },
        notifyWorktreesChangedForRemoteClients: () => undefined,
        readStoreInstallationId: async () => undefined
      }
    })

    await expect(
      invoke('worktrees:updateMeta', {
        worktreeId,
        executionHostId: 'local',
        updates: { agentAccounts: { codex: { accountId: 'nonexistent-test-account' } } }
      })
    ).rejects.toThrow('Unknown managed Codex account')
    expect(store.getWorktreeMetaForHost(worktreeId, 'local')).toMatchObject({
      comment: 'before'
    })
    expect(store.getWorktreeMetaForHost(worktreeId, 'local')?.agentAccounts).toBeUndefined()
  })
})
