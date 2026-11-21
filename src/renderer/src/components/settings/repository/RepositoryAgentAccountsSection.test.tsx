// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectHostSetup } from '../../../../../shared/project-types'
import { RepositoryAgentAccountsSection } from './RepositoryAgentAccountsSection'

vi.mock('../../ui/select', () => ({
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

function setup(overrides: Partial<ProjectHostSetup> = {}): ProjectHostSetup {
  return {
    id: 'setup-local',
    projectId: 'project',
    repoId: 'repo',
    hostId: 'local',
    path: '/repo',
    displayName: 'Project',
    setupState: 'ready',
    setupMethod: 'legacy-repo',
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  }
}

beforeEach(() => {
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

describe('RepositoryAgentAccountsSection', () => {
  it('assigns the selected managed account to the selected host setup without switching global selection', async () => {
    const update = vi.fn(async () => ({
      setup: setup({ agentAccounts: { claude: { accountId: 'claude-a' } } })
    }))
    render(<RepositoryAgentAccountsSection setup={setup()} updateProjectHostSetup={update} />)
    const select = (await screen.findAllByRole('combobox'))[0]

    fireEvent.change(select, { target: { value: 'claude-a' } })

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        setupId: 'setup-local',
        hostId: 'local',
        updates: { agentAccounts: { claude: { accountId: 'claude-a' } } }
      })
    )
    expect(window.api.claudeAccounts.select).not.toHaveBeenCalled()
  })

  it('clears one provider preference without overwriting its sibling provider', async () => {
    const existing = setup({
      agentAccounts: { claude: { accountId: 'claude-a' }, codex: { accountId: 'codex-a' } }
    })
    const update = vi.fn(async () => ({
      setup: setup({ agentAccounts: { codex: { accountId: 'codex-a' } } })
    }))
    render(<RepositoryAgentAccountsSection setup={existing} updateProjectHostSetup={update} />)

    fireEvent.change((await screen.findAllByRole('combobox'))[0], {
      target: { value: '__inherit__' }
    })

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        setupId: 'setup-local',
        hostId: 'local',
        updates: { agentAccounts: { claude: null } }
      })
    )
  })

  it('does not offer Claude aliases of System default or accounts that need sign-in', async () => {
    api.claudeList.mockResolvedValue({
      accounts: [
        { id: 'claude-a', email: 'a@example.test' },
        { id: 'claude-alias', email: 'alias@example.test', runsOnSystemDefault: true },
        { id: 'claude-signed-out', email: 'signed-out@example.test', needsSignIn: true }
      ],
      activeAccountId: 'claude-a'
    })
    render(<RepositoryAgentAccountsSection setup={setup()} updateProjectHostSetup={vi.fn()} />)

    const claude = (await screen.findAllByRole('combobox'))[0]

    expect(claude.querySelector('option[value="claude-a"]')).toBeInTheDocument()
    expect(claude.querySelector('option[value="claude-alias"]')).toBeNull()
    expect(claude.querySelector('option[value="claude-signed-out"]')).toBeNull()
  })

  it('leaves persisted state alone when the host rejects an account that went stale', async () => {
    const existing = setup()
    const update = vi.fn(async () => null)
    render(<RepositoryAgentAccountsSection setup={existing} updateProjectHostSetup={update} />)

    fireEvent.change((await screen.findAllByRole('combobox'))[0], {
      target: { value: 'claude-a' }
    })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(existing.agentAccounts).toBeUndefined()
  })

  it('does not write to a previously selected host after the setup changes', async () => {
    const update = vi.fn(async () => null)
    const { rerender } = render(
      <RepositoryAgentAccountsSection setup={setup()} updateProjectHostSetup={update} />
    )
    await screen.findAllByRole('combobox')
    const remote = setup({ id: 'setup-remote', hostId: 'runtime:remote' })
    rerender(<RepositoryAgentAccountsSection setup={remote} updateProjectHostSetup={update} />)

    expect(await screen.findByText(/local host/i)).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')[0]).toBeDisabled()
    expect(update).not.toHaveBeenCalled()
  })
})
