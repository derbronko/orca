import { describe, expect, it, vi } from 'vitest'
import { RuntimeAccountController, type RuntimeAccountServices } from './runtime-account-controller'

function controller() {
  const claude = {
    resolveManagedAccountHome: vi.fn(async (accountId: string) => `/accounts/${accountId}`),
    prepareManagedAccountForLaunch: vi.fn()
  }
  const codex = { runtimeHomeService: { resolveManagedAccountHome: vi.fn() } }
  const runtime = new RuntimeAccountController()
  runtime.setServices({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: validation reads only the mocked Claude home resolver; the concrete service has unrelated methods.
    claudeAccounts: claude as unknown as RuntimeAccountServices['claudeAccounts'],
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: validation constructs Codex launch preparation but uses only Claude's read resolver in these cases.
    codexAccounts: codex as unknown as RuntimeAccountServices['codexAccounts'],
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: validation does not access rate-limit service methods.
    rateLimits: {} as RuntimeAccountServices['rateLimits']
  })
  return { runtime, claude, codex }
}

describe('RuntimeAccountController managed account validation', () => {
  it('returns no Claude config directory before account services initialize', () => {
    expect(new RuntimeAccountController().getClaudeConfigDirectory({ runtime: 'host' })).toBeNull()
  })

  it('checks assigned account homes using read-only resolution', async () => {
    const { runtime, claude } = controller()

    await runtime.managedAgentAccounts.validateAgentAccountPreferencePatch(
      { claude: { accountId: 'claude-a' } },
      { hostId: 'local', runtime: 'host' },
      '/work/project',
      {}
    )

    expect(claude.resolveManagedAccountHome).toHaveBeenCalledWith('claude-a')
    expect(claude.prepareManagedAccountForLaunch).not.toHaveBeenCalled()
  })

  it('allows clears without account lookup and refuses unsupported WSL pins', async () => {
    const { runtime, claude } = controller()

    await expect(
      runtime.managedAgentAccounts.validateAgentAccountPreferencePatch(
        { claude: null },
        { hostId: 'local', runtime: 'host' },
        '/work/project',
        {}
      )
    ).resolves.toBeUndefined()
    expect(claude.resolveManagedAccountHome).not.toHaveBeenCalled()

    await expect(
      runtime.managedAgentAccounts.validateAgentAccountPreferencePatch(
        { claude: { accountId: 'claude-a' } },
        { hostId: 'local', runtime: 'wsl', wslDistro: 'Ubuntu' },
        '/work/project',
        {}
      )
    ).rejects.toThrow('Assigned agent accounts are not supported')
  })
})
