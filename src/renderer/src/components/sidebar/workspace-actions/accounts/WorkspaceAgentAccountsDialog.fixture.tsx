import type { Worktree } from '../../../../../../shared/worktree/types'
import { defineFixture } from '../../../../component-fixtures/component-fixture'
import { WorkspaceAgentAccountsDialog } from './WorkspaceAgentAccountsDialog'

const worktree: Worktree = {
  id: 'repo-1::/Users/christoph/dev/orca/worktrees/feature::workspace:fixture-a',
  instanceId: 'fixture-a',
  repoId: 'repo-1',
  projectId: 'project-1',
  projectHostSetupId: 'project-local',
  hostId: 'local',
  path: '/Users/christoph/dev/orca/worktrees/feature',
  displayName: 'Feature workspace',
  branch: 'feature/account-picker',
  head: 'f01a234',
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
  agentAccounts: { codex: { accountId: 'codex-a' } }
}

export const workspaceDialog = defineFixture({
  width: 560,
  setup: () => {
    window.api.claudeAccounts.list = async () => ({
      accounts: [
        {
          id: 'claude-a',
          email: 'christoph@example.test',
          authMethod: 'subscription-oauth',
          createdAt: 0,
          updatedAt: 0,
          lastAuthenticatedAt: 0
        }
      ],
      activeAccountId: 'claude-a'
    })
    window.api.codexAccounts.list = async () => ({
      accounts: [
        {
          id: 'codex-a',
          email: 'dev@example.test',
          createdAt: 0,
          updatedAt: 0,
          lastAuthenticatedAt: 0
        }
      ],
      activeAccountId: 'codex-a'
    })
  },
  render: () => (
    <WorkspaceAgentAccountsDialog
      open
      onOpenChange={() => {}}
      worktree={worktree}
      executionHostId="local"
      projectPreferences={{ claude: { accountId: 'claude-a' } }}
      updateWorktreeMeta={async () => ({ ok: true })}
    />
  )
})
