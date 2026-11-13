import type { Repo } from '../../../../../shared/repo-types'
import { useRepositoryAgentAccountSetup } from './use-repository-agent-account-setup'
import { RepositoryAgentAccountsSection } from './RepositoryAgentAccountsSection'

export function RepositoryPaneAgentAccountsSection({
  repo,
  selectedProjectSetupId,
  isLocalWindowsProject,
  forceVisible
}: {
  repo: Repo
  selectedProjectSetupId?: string
  isLocalWindowsProject: boolean
  forceVisible: boolean
}): React.JSX.Element | null {
  const { setup, updateProjectHostSetup, unsupportedRuntime } = useRepositoryAgentAccountSetup(
    repo,
    selectedProjectSetupId,
    isLocalWindowsProject
  )
  return setup ? (
    <RepositoryAgentAccountsSection
      key={`agent-accounts-${setup.id}`}
      setup={setup}
      updateProjectHostSetup={updateProjectHostSetup}
      unsupportedRuntime={unsupportedRuntime}
      forceVisible={forceVisible}
    />
  ) : null
}
