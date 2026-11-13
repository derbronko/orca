import type { ClaudeAccountRecipe } from '../../../../shared/agent-session/lifecycle/agent-session-acquired-account'
import type { ManagedAgentAccountRef } from '../../../../shared/agent-accounts/agent-account-preference'
import {
  CLAUDE_PROFILE_POINTER_ENV,
  CLAUDE_USER_CONFIG_DIR_ENV
} from '../../../../shared/claude-profile-routing'
import type { ClaudeProfileRouter } from '../../../claude-accounts/profiles/routing/claude-profile-router'
import { applyClaudeEnvPatch } from '../../../claude-accounts/runtime-auth/environment'
import { resolveStructuredClaudeAccountHomePath } from '../../../runtime/agent-session/environment/structured-agent-account-home'

/** The account a launch runs under is the current selection; the receipt records what it used. */
export async function prepareClaudeLaunchAccount(
  router: ClaudeProfileRouter | undefined,
  env: Record<string, string>,
  recordHome: string,
  accountBinding?: ManagedAgentAccountRef
): Promise<ClaudeAccountRecipe> {
  if (accountBinding) {
    if (accountBinding.provider !== 'claude' || !accountBinding.accountId.trim()) {
      throw new Error('The saved agent account binding is invalid for Claude.')
    }
    if (!router) {
      throw new Error('Claude account preparation is unavailable for this bound session.')
    }
    const preparation = await router.prepareExplicitAccountForLaunch(accountBinding.accountId)
    delete env[CLAUDE_PROFILE_POINTER_ENV]
    delete env[CLAUDE_USER_CONFIG_DIR_ENV]
    applyClaudeEnvPatch(env, preparation.envPatch, { stripAuthEnv: true })
    return {
      route: 'managed',
      accountId: accountBinding.accountId,
      home: preparation.configDir
    }
  }
  if (!router) {
    return { route: 'system', home: recordHome, configDir: env.CLAUDE_CONFIG_DIR ?? null }
  }
  const preparation = await router.prepareLaunch()
  const home =
    preparation.provenance === 'system'
      ? await resolveStructuredClaudeAccountHomePath({
          launchEnv: env,
          wslDistro: null,
          getClaudeConfigDirectory: () => router.systemDefaultHome()
        })
      : preparation.configDir
  applyClaudeEnvPatch(env, preparation.envPatch)
  return preparation.provenance.startsWith('profile:')
    ? { route: 'managed', accountId: preparation.provenance.slice('profile:'.length), home }
    : { route: 'system', home, configDir: env.CLAUDE_CONFIG_DIR ?? null }
}
