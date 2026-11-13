import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPtyIpcSpawnState } from './ipc/spawn-state'
import type { PtySpawnIpcDeps } from './ipc/spawn-types'
import { preparePtyIpcSpawnPreflight } from './ipc/spawn-preflight'
import { createRuntimePtySpawnState } from './runtime/spawn-state'
import type { PtyRuntimeControllerDeps } from './runtime/controller-deps'
import type { RuntimePtySpawnArgs } from './runtime/spawn-state'
import { prepareRuntimePtySpawn } from './runtime/spawn-preflight'
import { noCodexResumeLaunch } from './host-env/codex-resume'

const target = {
  cwd: '/work',
  prevalidatedCwd: '/work',
  requestedCwd: '/work',
  correctStartupCwd: '/work',
  startupCwdFallback: undefined,
  terminalRuntimeOptions: {},
  expectedWslDistro: null,
  wslHoldReadAnchor: undefined,
  codexSelectionTarget: { runtime: 'host' as const }
}

const mocks = vi.hoisted(() => ({
  resolveTarget: vi.fn(),
  resolveHostEnv: vi.fn()
}))

vi.mock('./spawn-startup-target', () => ({ resolvePtySpawnStartupTarget: mocks.resolveTarget }))
vi.mock('./spawn-host-env', () => ({ resolvePtySpawnHostEnv: mocks.resolveHostEnv }))

const preferences = new Map<string, { claude?: string; codex?: string }>()
const store = {
  getWorktreeMetaForHost: (workspaceId: string) => ({
    agentAccounts: Object.fromEntries(
      Object.entries(preferences.get(workspaceId) ?? {}).map(([provider, accountId]) => [
        provider,
        { accountId }
      ])
    )
  }),
  getProjectHostSetups: () => []
}

beforeEach(() => {
  mocks.resolveTarget.mockReset().mockResolvedValue(target)
  mocks.resolveHostEnv
    .mockReset()
    .mockImplementation(async ({ command }: { command?: string }) => ({
      codexResumeLaunch: noCodexResumeLaunch(command),
      launchCommand: command,
      baseEnv: {},
      env: {},
      selectedCodexHomePath: 'C:\\managed\\account',
      codexResumeHomeSelected: false,
      skipCodexHomeEnv: false,
      stripInheritedOrcaCodexHome: false
    }))
  preferences.clear()
})

describe('PTY account binding preflight', () => {
  it('keeps parallel same-path runtime launches pinned to their workspace instance', async () => {
    const firstWorkspace = 'repo::/work::workspace:one'
    const secondWorkspace = 'repo::/work::workspace:two'
    preferences.set(firstWorkspace, { codex: 'account-one' })
    preferences.set(secondWorkspace, { codex: 'account-two' })
    const argsFor = (worktreeId: string): RuntimePtySpawnArgs => ({
      cols: 80,
      rows: 24,
      worktreeId,
      launchAgent: 'codex',
      command: 'codex',
      connectionId: null
    })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the mocked runtime preflight uses only these explicit controller ports.
    const deps = {
      store,
      assertWorkspaceAcceptsNewPty: vi.fn(),
      resolvePtySpawnStartupCwd: () => '/work'
    } as unknown as PtyRuntimeControllerDeps
    const first = createRuntimePtySpawnState(deps, argsFor(firstWorkspace))
    const second = createRuntimePtySpawnState(deps, argsFor(secondWorkspace))

    await Promise.all([prepareRuntimePtySpawn(first), prepareRuntimePtySpawn(second)])

    expect(first.args.launchConfig?.accountBinding).toEqual({
      provider: 'codex',
      accountId: 'account-one'
    })
    expect(second.args.launchConfig?.accountBinding).toEqual({
      provider: 'codex',
      accountId: 'account-two'
    })
    expect(
      mocks.resolveHostEnv.mock.calls.map(([input]) => input.accountBinding?.accountId).sort()
    ).toEqual(['account-one', 'account-two'])
  })

  it('does not apply new workspace defaults to an existing unbound session restore', async () => {
    const workspaceId = 'repo::/work::workspace:restored'
    preferences.set(workspaceId, { codex: 'new-workspace-default' })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the restore branch reads only the supplied controller ports; host environment preparation is mocked.
    const deps = {
      store,
      assertWorkspaceAcceptsNewPty: vi.fn(),
      resolvePtySpawnStartupCwd: () => '/work'
    } as unknown as PtyRuntimeControllerDeps
    const ctx = createRuntimePtySpawnState(deps, {
      cols: 80,
      rows: 24,
      worktreeId: workspaceId,
      launchAgent: 'codex',
      command: 'codex resume session-id',
      connectionId: null,
      sessionId: 'existing-session',
      resumeProviderSession: { key: 'session_id', id: 'session-id' },
      resumeOrigin: 'saved'
    })

    await prepareRuntimePtySpawn(ctx)

    expect(ctx.args.launchConfig?.accountBinding).toBeUndefined()
    expect(mocks.resolveHostEnv.mock.calls.at(-1)?.[0].accountBinding).toBeUndefined()
  })

  it('pins renderer IPC starts and passes Claude account IDs to auth preparation', async () => {
    const workspaceId = 'repo::/work::workspace:claude'
    preferences.set(workspaceId, { claude: 'claude-account' })
    const prepareClaudeAuth = vi.fn(async () => ({
      configDir: 'C:\\managed\\claude',
      envPatch: { CLAUDE_CONFIG_DIR: 'C:\\managed\\claude' },
      provenance: 'profile:claude-account'
    }))
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this IPC preflight fixture supplies every port reached before the mocked host environment boundary.
    const deps = {
      store,
      assertWorkspaceAcceptsNewPty: vi.fn(),
      resolvePtySpawnStartupCwd: () => '/work',
      getSettings: () => ({}),
      prepareClaudeAuth
    } as unknown as PtySpawnIpcDeps
    const ctx = createPtyIpcSpawnState(deps, {
      cols: 80,
      rows: 24,
      worktreeId: workspaceId,
      command: 'claude',
      launchAgent: 'claude',
      connectionId: null
    })
    await preparePtyIpcSpawnPreflight(ctx)

    expect(ctx.args.launchConfig?.accountBinding).toEqual({
      provider: 'claude',
      accountId: 'claude-account'
    })
    expect(prepareClaudeAuth).toHaveBeenCalledWith(
      { runtime: 'host' },
      { accountId: 'claude-account' }
    )
    expect(ctx.args.env).toBeUndefined()
  })

  it('refuses a Claude pin when named auth preparation is unavailable', async () => {
    const workspaceId = 'repo::/work::workspace:missing-auth'
    preferences.set(workspaceId, { claude: 'claude-account' })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the preflight must refuse the deliberately missing auth port before reaching any other IPC services.
    const deps = {
      store,
      assertWorkspaceAcceptsNewPty: vi.fn(),
      resolvePtySpawnStartupCwd: () => '/work',
      getSettings: () => ({})
    } as unknown as PtySpawnIpcDeps
    const ctx = createPtyIpcSpawnState(deps, {
      cols: 80,
      rows: 24,
      worktreeId: workspaceId,
      command: 'claude',
      launchAgent: 'claude',
      connectionId: null
    })

    await expect(preparePtyIpcSpawnPreflight(ctx)).rejects.toThrow(
      'assigned Claude account could not be prepared'
    )
  })
})
