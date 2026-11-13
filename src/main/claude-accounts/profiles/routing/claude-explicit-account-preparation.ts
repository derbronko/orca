import type { ClaudeRuntimeAuthPreparation } from '../../runtime-auth/runtime-auth-types'
import { CLAUDE_INJECTED_CONFIG_DIR_ENV } from '../../../../shared/claude-profile-routing'
import { isDirectory } from '../claude-profile-homes'
import type { ClaudeProfileRouter } from './claude-profile-router'

export function resolveExplicitClaudeAccountHome(
  router: ClaudeProfileRouter,
  accountId: string
): string {
  const account = router.savedAccount(accountId)
  if (!account || account.managedAuthRuntime === 'wsl') {
    throw new Error('The requested Claude account is unavailable on this host.')
  }
  const home = router.accountHome(accountId)
  if (
    !isDirectory(home) ||
    !router.accountLogin(accountId) ||
    router.coveredBySystemDefault(accountId)
  ) {
    throw new Error('The requested Claude account must be signed in independently.')
  }
  return home
}

export async function prepareExplicitClaudeAccountForLaunch(
  router: ClaudeProfileRouter,
  accountId: string
): Promise<ClaudeRuntimeAuthPreparation> {
  const home = resolveExplicitClaudeAccountHome(router, accountId)
  await router.prepareAccount(accountId)
  if (resolveExplicitClaudeAccountHome(router, accountId) !== home) {
    throw new Error('The requested Claude account changed during launch preparation.')
  }
  return {
    configDir: home,
    runtime: 'host',
    wslDistro: null,
    wslLinuxConfigDir: null,
    envPatch: {
      CLAUDE_CONFIG_DIR: home,
      [CLAUDE_INJECTED_CONFIG_DIR_ENV]: home
    },
    provenance: `profile:${accountId}`
  }
}
