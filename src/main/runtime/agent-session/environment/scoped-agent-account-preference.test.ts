import { describe, expect, it } from 'vitest'
import { resolveScopedAgentAccountPreference } from './scoped-agent-account-preference'

describe('workspace account assignment scope', () => {
  const first = 'repo::C:/shared::workspace:first'
  const second = 'repo::C:/shared::workspace:second'

  function store() {
    const metadata = new Map([
      [`local\0${first}`, { agentAccounts: { codex: { accountId: 'first-account' } } }],
      [`local\0${second}`, { agentAccounts: { codex: { accountId: 'second-account' } } }],
      [`runtime:other\0${first}`, { agentAccounts: { codex: { accountId: 'other-host' } } }]
    ])
    return {
      getWorktreeMetaForHost: (id: string, hostId: string) => metadata.get(`${hostId}\0${id}`),
      getProjectHostSetups: () => [
        {
          id: 'setup-local',
          repoId: 'repo',
          hostId: 'local' as const,
          agentAccounts: { claude: { accountId: 'project-local' } }
        },
        {
          id: 'setup-other',
          repoId: 'repo',
          hostId: 'runtime:other' as const,
          agentAccounts: { claude: { accountId: 'project-other' } }
        }
      ],
      getFolderWorkspace: (id: string) =>
        id === 'folder-one'
          ? {
              id,
              executionHostId: 'local' as const,
              agentAccounts: { codex: { accountId: 'folder-account' } }
            }
          : undefined
    }
  }

  it('keeps different workspace instances at one path on their own accounts', () => {
    const source = store()
    expect(
      resolveScopedAgentAccountPreference(source, 'codex', {
        workspaceId: first,
        executionHostId: 'local'
      })
    ).toEqual({ source: 'workspace', account: { provider: 'codex', accountId: 'first-account' } })
    expect(
      resolveScopedAgentAccountPreference(source, 'codex', {
        workspaceId: second,
        executionHostId: 'local'
      })
    ).toEqual({ source: 'workspace', account: { provider: 'codex', accountId: 'second-account' } })
  })

  it('reads metadata and project fallback on the exact execution host', () => {
    const source = store()
    expect(
      resolveScopedAgentAccountPreference(source, 'codex', {
        workspaceId: first,
        executionHostId: 'runtime:other'
      })
    ).toEqual({ source: 'workspace', account: { provider: 'codex', accountId: 'other-host' } })
    expect(
      resolveScopedAgentAccountPreference(source, 'claude', {
        workspaceId: first,
        executionHostId: 'local'
      })
    ).toEqual({ source: 'project', account: { provider: 'claude', accountId: 'project-local' } })
    expect(
      resolveScopedAgentAccountPreference(source, 'claude', {
        workspaceId: first,
        executionHostId: 'runtime:other'
      })
    ).toEqual({ source: 'project', account: { provider: 'claude', accountId: 'project-other' } })
  })

  it('matches a project setup by its effective execution host', () => {
    const source = {
      getWorktreeMetaForHost: () => ({ projectHostSetupId: 'setup-runtime-owned' }),
      getProjectHostSetups: () => [
        {
          id: 'setup-runtime-owned',
          repoId: 'repo',
          hostId: 'ssh:owner' as const,
          executionHostId: 'local' as const,
          agentAccounts: { codex: { accountId: 'project-local-runtime' } }
        }
      ]
    }

    expect(
      resolveScopedAgentAccountPreference(source, 'codex', {
        workspaceId: first,
        executionHostId: 'local'
      })
    ).toEqual({
      source: 'project',
      account: { provider: 'codex', accountId: 'project-local-runtime' }
    })
  })

  it('uses a folder override only on its owner and otherwise inherits global behavior', () => {
    const source = store()
    expect(
      resolveScopedAgentAccountPreference(source, 'codex', {
        workspaceId: 'folder:folder-one',
        executionHostId: 'local'
      })
    ).toEqual({ source: 'workspace', account: { provider: 'codex', accountId: 'folder-account' } })
    expect(
      resolveScopedAgentAccountPreference(source, 'codex', {
        workspaceId: 'folder:folder-one',
        executionHostId: 'runtime:other'
      })
    ).toEqual({ source: 'global', account: null })
    expect(
      resolveScopedAgentAccountPreference(source, 'claude', {
        workspaceId: 'folder:folder-one',
        executionHostId: 'local'
      })
    ).toEqual({ source: 'global', account: null })
  })
})
