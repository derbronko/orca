import { describe, expect, it } from 'vitest'
import { noCodexResumeLaunch } from './codex-resume'
import { resolvePtySpawnHostEnv } from '../spawn-host-env'
import { localProvider } from '../provider/registry'
import {
  resolvePtyAgentAccountBinding,
  stripPtyClaudeAuthForAccountBinding
} from './pty-agent-account-binding'

describe('resolvePtyAgentAccountBinding', () => {
  it('keeps same-path workspace instances on their own account assignments', () => {
    const assignments = new Map([
      ['repo::/work::workspace:one', { claude: { accountId: 'account-one' } }],
      ['repo::/work::workspace:two', { claude: { accountId: 'account-two' } }]
    ])
    const store = {
      getWorktreeMetaForHost: (id: string) => ({ agentAccounts: assignments.get(id) }),
      getProjectHostSetups: () => []
    }
    const resolve = (workspaceId: string) =>
      resolvePtyAgentAccountBinding({
        provider: 'claude',
        workspaceId,
        executionHostId: 'local',
        target: { runtime: 'host' },
        store
      })

    expect(resolve('repo::/work::workspace:one')).toEqual({
      provider: 'claude',
      accountId: 'account-one'
    })
    expect(resolve('repo::/work::workspace:two')).toEqual({
      provider: 'claude',
      accountId: 'account-two'
    })
  })

  it('retains an existing binding even when it matches the globally selected account', () => {
    expect(
      resolvePtyAgentAccountBinding({
        provider: 'codex',
        accountBinding: { provider: 'codex', accountId: 'globally-selected' },
        executionHostId: 'local',
        target: { runtime: 'host' }
      })
    ).toEqual({ provider: 'codex', accountId: 'globally-selected' })
  })

  it('rejects a bound account on unsupported hosts and runtimes', () => {
    expect(() =>
      resolvePtyAgentAccountBinding({
        accountBinding: { provider: 'claude', accountId: 'account-one' },
        executionHostId: 'ssh:remote',
        target: { runtime: 'host' }
      })
    ).toThrow('not supported on ssh:remote')
    expect(() =>
      resolvePtyAgentAccountBinding({
        accountBinding: { provider: 'codex', accountId: 'account-one' },
        executionHostId: 'local',
        target: { runtime: 'wsl' }
      })
    ).toThrow('not supported on local (wsl)')
  })

  it('refuses a saved binding used with the other provider', () => {
    expect(() =>
      resolvePtyAgentAccountBinding({
        provider: 'claude',
        accountBinding: { provider: 'codex', accountId: 'account-one' },
        executionHostId: 'local',
        target: { runtime: 'host' }
      })
    ).toThrow('bound to a codex account')
  })

  it('strips inherited Claude profiles and auth when a managed account is bound', () => {
    expect(
      stripPtyClaudeAuthForAccountBinding({
        CLAUDE_CONFIG_DIR: '/global-profile',
        ORCA_CLAUDE_PROFILE_POINTER: '/profile-pointer',
        ORCA_CLAUDE_INJECTED_CONFIG_DIR: '/old-injected-home',
        ANTHROPIC_API_KEY: 'global-key',
        ANTHROPIC_CUSTOM_HEADERS: 'Authorization: Bearer global-token',
        SAFE_ENV: 'retained'
      })
    ).toEqual({ SAFE_ENV: 'retained' })
  })

  it('passes the explicit Codex account through host preparation even when it is globally active', async () => {
    const globallySelectedAccount = 'globally-selected'
    const preparedAccountIds: string[] = []
    const result = await resolvePtySpawnHostEnv({
      launchAgent: undefined,
      command: 'codex',
      resumeProviderSession: undefined,
      env: {},
      cwd: '/work',
      shellOverride: undefined,
      expectedWslDistro: null,
      codexSelectionTarget: { runtime: 'host' },
      accountBinding: { provider: 'codex', accountId: globallySelectedAccount },
      preAdopted: false,
      isDaemonHostSpawn: false,
      sessionId: 'pane',
      callerNamedSession: true,
      mintedSessionId: false,
      resumeOnSelectedAccount: false,
      emptySessionIdSkipsHostEnv: false,
      requestedAgentTeamsPath: undefined,
      provider: localProvider,
      deps: {
        prepareCodexResumeHome: () => null,
        resolveCodexResumeLaunch: async (command) => noCodexResumeLaunch(command),
        noCodexResumeLaunch,
        reconcileSharedRuntimeResumeHome: async () => 'C:\\managed\\globally-selected',
        stripSequencedStartupResumeArgv: (env) => env,
        getSelectedCodexHomePath: async (_target, _env, context) => {
          if (context?.accountId) {
            preparedAccountIds.push(context.accountId)
          }
          return context?.accountId
            ? `C:\\managed\\${context.accountId}`
            : `C:\\managed\\${globallySelectedAccount}`
        }
      } satisfies Parameters<typeof resolvePtySpawnHostEnv>[0]['deps']
    })

    expect(preparedAccountIds).toEqual([globallySelectedAccount])
    expect(result.selectedCodexHomePath).toBe(`C:\\managed\\${globallySelectedAccount}`)
  })

  it.each([false, true])(
    'requires a resolved Codex home only for a new launch (reattached: %s)',
    async (preAdopted) => {
      const preparation = resolvePtySpawnHostEnv({
        launchAgent: 'codex',
        command: 'codex',
        resumeProviderSession: undefined,
        env: {},
        cwd: '/work',
        shellOverride: undefined,
        expectedWslDistro: null,
        codexSelectionTarget: { runtime: 'host' },
        accountBinding: { provider: 'codex', accountId: 'assigned-account' },
        preAdopted,
        isDaemonHostSpawn: false,
        sessionId: 'pane',
        callerNamedSession: false,
        mintedSessionId: true,
        resumeOnSelectedAccount: false,
        emptySessionIdSkipsHostEnv: false,
        requestedAgentTeamsPath: undefined,
        provider: localProvider,
        deps: {
          prepareCodexResumeHome: () => null,
          resolveCodexResumeLaunch: async (command) => noCodexResumeLaunch(command),
          noCodexResumeLaunch,
          reconcileSharedRuntimeResumeHome: async () => {
            throw new Error('This new launch has no resume home to reconcile.')
          },
          stripSequencedStartupResumeArgv: (env) => env,
          getSelectedCodexHomePath: async () => null
        } satisfies Parameters<typeof resolvePtySpawnHostEnv>[0]['deps']
      })
      if (preAdopted) {
        expect(await preparation).toMatchObject({ selectedCodexHomePath: null })
      } else {
        await expect(preparation).rejects.toThrow(
          'assigned Codex account home could not be resolved'
        )
      }
    }
  )
})
