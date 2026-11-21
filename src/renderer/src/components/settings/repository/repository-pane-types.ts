import type { GhAccountBinding } from '../../../../../shared/github/accounts/account-binding'
import type { OrcaHooks } from '../../../../../shared/orca-yaml-hook-types'
import type { ExecutionHostId } from '../../../../../shared/execution-host'
import type {
  Project,
  ProjectHostSetup,
  ProjectUpdateArgs
} from '../../../../../shared/project-types'
import type { Repo } from '../../../../../shared/repo-types'
import type { SourceControlAiSettingsPatch } from '../../../../../shared/source-control/ai/settings/source-control-ai-settings-types'
import type { SettingsProjectRemovalScope } from '../navigation/settings-project-list'

export type RepositoryPaneRepoUpdate = Omit<
  Partial<Repo>,
  'sourceControlAi' | 'externalWorktreeVisibility' | 'ghAccount'
> & {
  sourceControlAi?: Repo['sourceControlAi'] | null
  externalWorktreeVisibility?: Repo['externalWorktreeVisibility'] | null
  ghAccount?: GhAccountBinding | null
}

export type RepositoryPaneProps = {
  repo: Repo
  yamlHooks: OrcaHooks | null
  hasHooksFile: boolean
  hooksInspectionReady: boolean
  mayNeedUpdate: boolean
  updateRepo: (
    repoId: string,
    updates: RepositoryPaneRepoUpdate,
    options?: { hostId?: ExecutionHostId }
  ) => void | Promise<boolean>
  removeProject: () => void
  project?: Project | null
  selectedProjectSetupId?: string
  settingsSelectionKey?: string
  settingsEntryRepoIds?: ReadonlySet<string>
  removalScope?: SettingsProjectRemovalScope
  /** Every checkout the remove action takes out of Orca. */
  removalSetups?: readonly ProjectHostSetup[]
  isLocalWindowsProject?: boolean
  wslAvailable?: boolean
  wslDistros?: string[]
  wslCapabilitiesLoading?: boolean
  updateProject?: (
    projectId: string,
    updates: ProjectUpdateArgs['updates']
  ) => void | Promise<unknown>
  /** Lets the repository's text pickers save model lists its host reports. */
  writeSourceControlAiSettings?: (patch: SourceControlAiSettingsPatch) => Promise<void>
}
