import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCodexSessionResumeLaunchPreparation } from './codex-session-resume-launch-preparation'

vi.mock('../../hooks/installation/hook-service', () => ({
  codexHookService: {
    installForLaunchPrep: vi.fn(),
    refreshRuntimeUserHooksForLaunchPrep: vi.fn()
  }
}))
vi.mock('../../hooks/reconciliation/codex-hook-reconcile', () => ({
  reconcileCodexHooksForLaunch: vi.fn()
}))
vi.mock('../../configuration/settings/codex-config-mirror', () => ({
  ensureCodexDaemonSocketGuard: vi.fn()
}))
vi.mock('../../configuration/homes/codex-home-paths', () => ({
  getOrcaManagedCodexHomePath: () => '/shared/runtime',
  getSystemCodexHomePath: () => '/system/codex'
}))

const roots: string[] = []
const sessionId = '11111111-2222-3333-4444-555555555555'

function makeHomeWithSession(root: string, name: string): { home: string; transcript: string } {
  const home = join(root, name)
  const day = join(home, 'sessions', '2026', '07', '20')
  mkdirSync(day, { recursive: true })
  const transcript = join(day, `rollout-${sessionId}.jsonl`)
  writeFileSync(transcript, '{}\n', 'utf8')
  return { home, transcript }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
  vi.clearAllMocks()
})

describe('Codex resume with an explicit managed account binding', () => {
  it('resolves and resumes only inside the named managed account home', async () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-codex-binding-'))
    roots.push(root)
    const assigned = makeHomeWithSession(root, 'assigned')
    const other = makeHomeWithSession(root, 'other')
    const resolveSelected = vi.fn(() => other.home)
    const runtimeHome = {
      resolveManagedAccountHome: vi.fn(() => assigned.home),
      resolveSelectedHostAccountCodexHomePathForResume: resolveSelected,
      getHostCodexHomePathsForSessionDiscovery: vi.fn(() => [assigned.home, other.home]),
      isHostSystemDefaultRealHomeSelected: vi.fn(() => false)
    }
    const preparation = createCodexSessionResumeLaunchPreparation({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: bound resume uses only the explicit home resolvers supplied by this fixture.
      getRuntimeHome: () => runtimeHome as never,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: status hooks are disabled, so this branch reads no other settings.
      getSettings: () => ({ agentStatusHooksEnabled: false }) as never
    })

    await expect(
      preparation.prepareCodexSessionResumeForLaunch({
        providerSession: { key: 'session_id', id: sessionId, transcriptPath: assigned.transcript },
        target: { runtime: 'host' },
        accountId: 'assigned-account'
      })
    ).resolves.toMatchObject({ outcome: 'resume', codexHomePath: assigned.home })
    expect(runtimeHome.resolveManagedAccountHome).toHaveBeenCalledWith('assigned-account')
    expect(resolveSelected).not.toHaveBeenCalled()
  })

  it('refuses a bound session whose transcript belongs to another managed account', async () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-codex-binding-'))
    roots.push(root)
    const assigned = makeHomeWithSession(root, 'assigned')
    const other = makeHomeWithSession(root, 'other')
    const runtimeHome = {
      resolveManagedAccountHome: vi.fn(() => assigned.home),
      resolveSelectedHostAccountCodexHomePathForResume: vi.fn(() => other.home),
      getHostCodexHomePathsForSessionDiscovery: vi.fn(() => [assigned.home, other.home]),
      isHostSystemDefaultRealHomeSelected: vi.fn(() => false)
    }
    const preparation = createCodexSessionResumeLaunchPreparation({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: bound resume uses only the explicit home resolvers supplied by this fixture.
      getRuntimeHome: () => runtimeHome as never,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this rejection happens before any settings-dependent launch preparation.
      getSettings: () => ({ agentStatusHooksEnabled: false }) as never
    })

    await expect(
      preparation.prepareCodexSessionResumeForLaunch({
        providerSession: { key: 'session_id', id: sessionId, transcriptPath: other.transcript },
        target: { runtime: 'host' },
        accountId: 'assigned-account'
      })
    ).rejects.toThrow('does not belong to the assigned Codex account')
  })
})
