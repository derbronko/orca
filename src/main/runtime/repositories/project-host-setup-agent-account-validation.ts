import type { AgentAccountPreferencePatch } from '../../../shared/agent-accounts/agent-account-preference'
import type { ProjectHostSetup, ProjectHostSetupUpdateArgs } from '../../../shared/project-types'
import { findProjectHostSetup } from '../../../shared/project-host-setup-target'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import type { RuntimeStore } from '../construction/runtime-store-contract'

export async function validateProjectHostSetupAgentAccountPatch(args: {
  store: RuntimeStore
  update: ProjectHostSetupUpdateArgs
  validate?: (
    patch: AgentAccountPreferencePatch,
    setup: ProjectHostSetup,
    repo?: Repo
  ) => Promise<void>
}): Promise<void> {
  const patch = args.update.updates.agentAccounts
  if (!patch || !Object.values(patch).some((value) => value !== null && value !== undefined)) {
    return
  }
  const setup = findProjectHostSetup(args.store.getProjectHostSetups?.() ?? [], args.update)
  if (!setup) {
    return
  }
  const hostId = setup.executionHostId ?? setup.hostId
  const repo = args.store
    .getRepos()
    .find((entry) => entry.id === setup.repoId && getRepoExecutionHostId(entry) === hostId)
  if (!args.validate) {
    throw new Error('Assigned agent account validation is unavailable.')
  }
  await args.validate(patch, setup, repo)
}
