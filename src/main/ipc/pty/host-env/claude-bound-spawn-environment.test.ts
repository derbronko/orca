import { afterEach, expect, it, vi } from 'vitest'
import {
  assemblePtySpawnEnvDeletions,
  assemblePtySpawnLaunchOptions
} from '../spawn-options-assembly'
import {
  buildInheritedLocalPtyEnvironment,
  enforceLocalPtySpawnEnvironmentOverrides
} from '../../../providers/local-pty/local-pty-spawn-environment'
import {
  createDaemonPtyEnvironment,
  rescrubDaemonPtyEnvironment
} from '../../../daemon/pty-subprocess/spawn-environment'

afterEach(() => vi.unstubAllEnvs())

it.each([true, false])(
  'requires daemon binding retention only for assigned sessions (%s)',
  async (assigned) => {
    const { spawnOptions } = await assemblePtySpawnLaunchOptions({
      args: {
        cols: 80,
        rows: 24,
        ...(assigned
          ? {
              launchConfig: {
                agentArgs: '',
                agentEnv: {},
                accountBinding: { provider: 'claude', accountId: 'assigned' }
              }
            }
          : {})
      },
      env: {},
      envToDelete: [],
      launchCommand: undefined,
      cwd: undefined,
      isDaemonHostSpawn: true,
      preAdoptedStablePane: true,
      isNewSession: false,
      codexRuntime: 'host',
      expectedWslDistro: null,
      requestedAgentTeamsPath: undefined,
      selectedCodexHomePath: null,
      shellOverride: undefined,
      paneKey: undefined,
      sessionId: 'bound-pane',
      spawnIntent: undefined,
      store: undefined,
      claudeAuth: null
    })
    if (assigned) {
      expect(spawnOptions.requiresAccountBindingRetention).toBe(true)
    } else {
      expect(spawnOptions.requiresAccountBindingRetention).toBeUndefined()
    }
  }
)

it.each(['local', 'daemon'])(
  'keeps inherited authentication out of a bound Claude %s launch',
  (route) => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'ambient-other-account')
    vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', 'ambient-other-token')
    vi.stubEnv('ORCA_CLAUDE_PROFILE_POINTER', '/global/profile-pointer')
    const prepared = assemblePtySpawnEnvDeletions({
      env: { CLAUDE_CONFIG_DIR: '/accounts/assigned', HTTP_PROXY: 'http://proxy.example.test' },
      accountBinding: { provider: 'claude', accountId: 'assigned' },
      callerEnvToDelete: undefined,
      agentTeamsEnvToDelete: [],
      isDaemonHostSpawn: route === 'daemon',
      connectionId: null,
      skipCodexHomeEnv: false,
      stripInheritedOrcaCodexHome: false,
      codexResumeHomeSelected: false,
      settings: undefined
    })
    const options = {
      sessionId: 'bound-pane',
      cols: 80,
      rows: 24,
      env: prepared.env,
      envToDelete: prepared.envToDelete
    }
    const env =
      route === 'local'
        ? buildInheritedLocalPtyEnvironment(prepared.env, prepared.envToDelete)
        : createDaemonPtyEnvironment(options)
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
    expect(env.ORCA_CLAUDE_PROFILE_POINTER).toBeUndefined()
    expect(env.CLAUDE_CONFIG_DIR).toBe('/accounts/assigned')
    expect(env.HTTP_PROXY).toBe('http://proxy.example.test')

    env.ANTHROPIC_API_KEY = 'reintroduced-by-environment-builder'
    env.anthropic_api_key = 'windows-alias'
    if (route === 'local') {
      enforceLocalPtySpawnEnvironmentOverrides(options, env)
    } else {
      rescrubDaemonPtyEnvironment(env, options)
    }
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    if (process.platform === 'win32') {
      expect(env.anthropic_api_key).toBeUndefined()
    }
  }
)
