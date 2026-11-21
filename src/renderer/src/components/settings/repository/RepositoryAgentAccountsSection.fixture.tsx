import type { ProjectHostSetup } from '../../../../../shared/project-types'
import { defineFixture } from '../../../component-fixtures/component-fixture'
import { RepositoryAgentAccountsSection } from './RepositoryAgentAccountsSection'

const setup: ProjectHostSetup = {
  id: 'project-local',
  projectId: 'project-1',
  hostId: 'local',
  repoId: 'repo-1',
  path: '/Users/christoph/dev/orca',
  displayName: 'Orca',
  setupState: 'ready',
  setupMethod: 'legacy-repo',
  agentAccounts: { claude: { accountId: 'claude-a' } },
  createdAt: 0,
  updatedAt: 0
}

export const projectSettings = defineFixture({
  width: 720,
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
    <RepositoryAgentAccountsSection
      setup={setup}
      updateProjectHostSetup={async () => ({ setup })}
      forceVisible
    />
  )
})
