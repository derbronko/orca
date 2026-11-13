// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentAccountPreferences } from '../../../../../../shared/agent-accounts/agent-account-preference'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { WorkspaceAgentAccountsDialog } from './WorkspaceAgentAccountsDialog'

vi.mock('../../../ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children
  }: {
    value: string
    onValueChange: (value: string) => void
    disabled?: boolean
    children: React.ReactNode
  }) => (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.currentTarget.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    children,
    disabled
  }: {
    value: string
    children: React.ReactNode
    disabled?: boolean
  }) => (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  )
}))

const api = vi.hoisted(() => ({ claudeList: vi.fn(), codexList: vi.fn() }))

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo::/shared/path::workspace:instance-a',
    instanceId: 'instance-a',
    repoId: 'repo',
    projectId: 'project',
    projectHostSetupId: 'setup-local',
    hostId: 'local',
    path: '/shared/path',
    displayName: 'Workspace A',
    branch: 'feature',
    head: 'abc',
    isBare: false,
    isMainWorktree: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  api.claudeList.mockResolvedValue({
    accounts: [{ id: 'claude-a', email: 'a@example.test' }],
    activeAccountId: 'claude-a'
  })
  api.codexList.mockResolvedValue({
    accounts: [{ id: 'codex-a', email: 'b@example.test' }],
    activeAccountId: 'codex-a'
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      claudeAccounts: { list: api.claudeList, select: vi.fn() },
      codexAccounts: { list: api.codexList, select: vi.fn() }
    }
  })
})
afterEach(cleanup)

describe('WorkspaceAgentAccountsDialog', () => {
  it('writes the preference to the exact workspace instance and host', async () => {
    const item = worktree()
    const update = vi.fn(async () => ({ ok: true as const }))
    render(
      <WorkspaceAgentAccountsDialog
        open
        onOpenChange={vi.fn()}
        worktree={item}
        executionHostId="local"
        projectPreferences={{}}
        updateWorktreeMeta={update}
      />
    )

    fireEvent.change((await screen.findAllByRole('combobox'))[0], {
      target: { value: 'claude-a' }
    })

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        item.id,
        { agentAccounts: { claude: { accountId: 'claude-a' } } },
        { executionHostId: 'local' }
      )
    )
  })

  it('shows project inheritance and clears only the workspace override', async () => {
    const item = worktree({ agentAccounts: { claude: { accountId: 'claude-a' } } })
    const projectPreferences: AgentAccountPreferences = { claude: { accountId: 'claude-project' } }
    const update = vi.fn(async () => ({ ok: true as const }))
    render(
      <WorkspaceAgentAccountsDialog
        open
        onOpenChange={vi.fn()}
        worktree={item}
        executionHostId="local"
        projectPreferences={projectPreferences}
        updateWorktreeMeta={update}
      />
    )

    fireEvent.change((await screen.findAllByRole('combobox'))[0], {
      target: { value: '__inherit__' }
    })

    expect(screen.getByText(/project/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        item.id,
        { agentAccounts: { claude: null } },
        { executionHostId: 'local' }
      )
    )
  })

  it('does not change workspace state when a stale account assignment is rejected', async () => {
    const item = worktree()
    const update = vi.fn(async () => ({ ok: false as const, error: 'account unavailable' }))
    render(
      <WorkspaceAgentAccountsDialog
        open
        onOpenChange={vi.fn()}
        worktree={item}
        executionHostId="local"
        projectPreferences={{}}
        updateWorktreeMeta={update}
      />
    )

    fireEvent.change((await screen.findAllByRole('combobox'))[0], {
      target: { value: 'claude-a' }
    })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(item.agentAccounts).toBeUndefined()
  })

  it('disables assignment for a WSL runtime with a clear reason', async () => {
    render(
      <WorkspaceAgentAccountsDialog
        open
        onOpenChange={vi.fn()}
        worktree={worktree()}
        executionHostId="local"
        wslUnsupported
        projectPreferences={{}}
        updateWorktreeMeta={vi.fn(async () => ({ ok: true as const }))}
      />
    )

    expect(await screen.findByText(/WSL yet/i)).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')[0]).toBeDisabled()
    expect(api.claudeList).not.toHaveBeenCalled()
  })
})
