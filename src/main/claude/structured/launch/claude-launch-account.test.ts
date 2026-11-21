import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeManagedAccount } from '../../../../shared/managed-account-types'
import { ClaudeProfileRouter } from '../../../claude-accounts/profiles/routing/claude-profile-router'
import {
  describeClaudeProfile,
  prepareClaudeProfileDirectory
} from '../../../claude-accounts/profiles/claude-profile-paths'
import { prepareClaudeLaunchAccount } from './claude-launch-account'
import { installClaudeProfileRouter } from '../../../claude-accounts/profiles/routing/claude-profile-installed-router'
import { claudeNamingInvocation } from '../../conversation-naming/claude-naming-invocation'
import { agentSessionRecordFixture } from '../../../../shared/agent-session/lifecycle/agent-session-record.test-fixture'
import { chatNamingAgentTarget } from '../../../runtime/agent-session/naming/structured-chat-naming-agent-launch'

const roots: string[] = []
afterEach(() => {
  installClaudeProfileRouter(undefined)
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'claude-bound-launch-'))
  roots.push(root)
  const dataRoot = join(root, 'data')
  const userHome = join(root, 'personal')
  mkdirSync(userHome, { recursive: true })
  const account = (id: string): ClaudeManagedAccount => ({
    id,
    email: `${id}@example.test`,
    authMethod: 'subscription-oauth',
    managedAuthPath: '/unused-legacy',
    createdAt: 0,
    updatedAt: 0,
    lastAuthenticatedAt: 0
  })
  const settings = {
    claudeManagedAccounts: [account('a'), account('b')],
    activeClaudeManagedAccountId: 'b',
    activeClaudeManagedAccountIdsByRuntime: undefined,
    agentStatusHooksEnabled: false,
    disabledTuiAgents: []
  }
  const home = (id: string) => join(dataRoot, 'claude-profiles', id, 'home')
  for (const id of ['a', 'b']) {
    const profile = describeClaudeProfile(dataRoot, id, {
      executionHostId: 'local',
      runtime: 'host'
    })
    prepareClaudeProfileDirectory(dataRoot, profile, userHome)()
    writeFileSync(
      join(home(id), '.claude.json'),
      JSON.stringify({ oauthAccount: { emailAddress: `${id}@example.test` } })
    )
  }
  const router = new ClaudeProfileRouter({
    getSettings: () => settings,
    dataRoot,
    userHome,
    env: {},
    runSetup: async () => ({ outcome: 'prepared', warnings: [], surfaces: {} })
  })
  return { router, settings, home }
}

describe('prepareClaudeLaunchAccount', () => {
  it('keeps fallback naming on the bound Claude account and clears competing auth', async () => {
    const f = fixture()
    installClaudeProfileRouter(f.router)
    const target = await chatNamingAgentTarget(
      {
        ...agentSessionRecordFixture(),
        schemaVersion: 3,
        accountBinding: { provider: 'claude', accountId: 'a' },
        accountHome: { variable: 'CLAUDE_CONFIG_DIR', path: f.home('a') }
      },
      roots[0]!,
      async () => ({ ANTHROPIC_API_KEY: 'ambient-key', HTTP_PROXY: 'http://proxy.example.test' }),
      {}
    )
    expect(target.kind).toBe('local')
    if (target.kind !== 'local') {
      throw new Error('Expected local naming')
    }
    expect(target.env?.CLAUDE_CONFIG_DIR).toBe(f.home('a'))
    expect(target.env?.ANTHROPIC_API_KEY).toBeUndefined()
    expect(f.settings.activeClaudeManagedAccountId).toBe('b')
  })

  it('keeps background conversation naming on the bound account after global selection changes', async () => {
    const f = fixture()
    installClaudeProfileRouter(f.router)
    const inputs = await claudeNamingInvocation(
      {
        store: {
          selectWritableRecord: vi.fn(),
          requireWritableRecord: vi.fn(),
          pinLaunchDirectory: vi.fn()
        },
        resolveWorkspacePath: async () => roots[0]!,
        resolveBaseEnvironment: async () => ({
          ANTHROPIC_API_KEY: 'ambient-key',
          ORCA_CLAUDE_PROFILE_POINTER: '/global-pointer',
          HTTP_PROXY: 'http://proxy.example.test'
        }),
        resolveAgentEnvironment: async () => ({})
      },
      () => [],
      () => ({ command: process.execPath, prefixArgs: [] })
    )({
      ...agentSessionRecordFixture(),
      schemaVersion: 3,
      accountBinding: { provider: 'claude', accountId: 'a' },
      accountHome: { variable: 'CLAUDE_CONFIG_DIR', path: f.home('a') }
    })

    expect(inputs.home).toBe(f.home('a'))
    expect(inputs.env.CLAUDE_CONFIG_DIR).toBe(f.home('a'))
    expect(inputs.env.HTTP_PROXY).toBe('http://proxy.example.test')
    expect(inputs.env).not.toHaveProperty('ANTHROPIC_API_KEY')
    expect(inputs.env).not.toHaveProperty('ORCA_CLAUDE_PROFILE_POINTER')
    expect(f.settings.activeClaudeManagedAccountId).toBe('b')
  })

  it('uses the session binding after global selection changes and clears inherited account selectors', async () => {
    const f = fixture()
    const env: Record<string, string> = {
      ORCA_CLAUDE_PROFILE_POINTER: '/stale/selected-account',
      ORCA_CLAUDE_USER_CONFIG_DIR: '/stale/user-home',
      CLAUDE_CONFIG_DIR: '/stale/config',
      ANTHROPIC_API_KEY: 'ambient-key',
      HTTP_PROXY: 'http://proxy.example.test'
    }

    const recipe = await prepareClaudeLaunchAccount(f.router, env, '/founding/home', {
      provider: 'claude',
      accountId: 'a'
    })

    expect(recipe).toEqual({ route: 'managed', accountId: 'a', home: f.home('a') })
    expect(f.settings.activeClaudeManagedAccountId).toBe('b')
    expect(env).toMatchObject({
      CLAUDE_CONFIG_DIR: f.home('a'),
      HTTP_PROXY: 'http://proxy.example.test'
    })
    expect(env).not.toHaveProperty('ORCA_CLAUDE_PROFILE_POINTER')
    expect(env).not.toHaveProperty('ORCA_CLAUDE_USER_CONFIG_DIR')
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY')
    expect(existsSync(f.router.pointerPath)).toBe(false)
  })

  it('refuses a bound account if the provider router is unavailable', async () => {
    await expect(
      prepareClaudeLaunchAccount(undefined, {}, '/founding/home', {
        provider: 'claude',
        accountId: 'a'
      })
    ).rejects.toThrow()
  })

  it('refuses a binding for a different provider', async () => {
    const f = fixture()
    const prepare = vi.spyOn(f.router, 'prepareExplicitAccountForLaunch')
    await expect(
      prepareClaudeLaunchAccount(f.router, {}, '/founding/home', {
        provider: 'codex',
        accountId: 'a'
      })
    ).rejects.toThrow()
    expect(prepare).not.toHaveBeenCalled()
  })

  it('refuses a bound account that no longer exists', async () => {
    const f = fixture()
    await expect(
      prepareClaudeLaunchAccount(f.router, {}, '/founding/home', {
        provider: 'claude',
        accountId: 'removed'
      })
    ).rejects.toThrow()
    expect(existsSync(f.router.pointerPath)).toBe(false)
  })
})
