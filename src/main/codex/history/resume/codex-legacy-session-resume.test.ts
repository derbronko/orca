import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type * as NodeFsPromises from 'node:fs/promises'
import '../../../ai-vault/scanners/codex/codex-session-root-dedup'
import { prepareLegacySharedCodexSessionResume } from './codex-legacy-session-resume'
import '../../../codex-accounts/managed-homes/host-codex-managed-home-ownership'

const lstatFaults = vi.hoisted(() => ({
  path: null as string | null,
  reset(): void {
    lstatFaults.path = null
  }
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFsPromises>()
  return {
    ...actual,
    lstat: async (...args: Parameters<typeof actual.lstat>) => {
      if (args[0] === lstatFaults.path) {
        const error: NodeJS.ErrnoException = new Error(`EBUSY: locked '${args[0]}'`)
        error.code = 'EBUSY'
        throw error
      }
      return actual.lstat(...args)
    }
  }
})

// Isolate userData so session backfill cannot resolve the live managed home.
let userDataRoot: string
beforeEach(() => {
  userDataRoot = mkdtempSync(join(tmpdir(), 'orca-codex-resume-user-data-'))
  vi.stubEnv('ORCA_USER_DATA_PATH', userDataRoot)
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(userDataRoot, { recursive: true, force: true })
})

describe('prepareLegacySharedCodexSessionResume', () => {
  let root: string
  let legacyHome: string
  let systemHome: string
  let rolloutPath: string

  beforeEach(() => {
    lstatFaults.reset()
    root = mkdtempSync(join(tmpdir(), 'orca-legacy-codex-resume-'))
    legacyHome = join(root, 'codex-runtime-home', 'home')
    systemHome = join(root, 'real-codex-home')
    rolloutPath = join(
      legacyHome,
      'sessions',
      '2026',
      '07',
      '20',
      'rollout-2026-07-20T12-00-00-session.jsonl'
    )
    mkdirSync(join(rolloutPath, '..'), { recursive: true })
    writeFileSync(rolloutPath, '{"type":"session_meta"}\n', 'utf-8')
  })

  afterEach(() => {
    lstatFaults.reset()
    rmSync(root, { recursive: true, force: true })
  })

  it('materializes an immediate legacy resume into the real home', async () => {
    const result = await prepare()
    const targetPath = targetRolloutPath()

    expect(result).toEqual({ useRealCodexHome: true })
    expect(readFileSync(targetPath, 'utf-8')).toBe('{"type":"session_meta"}\n')
    expect(statSync(targetPath).ino).toBe(statSync(rolloutPath).ino)
  })

  it('fails closed when a different rollout already owns the target path', async () => {
    mkdirSync(join(targetRolloutPath(), '..'), { recursive: true })
    writeFileSync(targetRolloutPath(), '{"different":true}\n', 'utf-8')

    await expect(prepare()).rejects.toThrow(/Retry resume/)
    expect(readFileSync(targetRolloutPath(), 'utf-8')).toBe('{"different":true}\n')
  })

  it('materializes a bound chat fork into its assigned home instead of the global account', async () => {
    const sourceHome = join(root, 'codex-accounts', 'source', 'home')
    const assignedHome = join(root, 'codex-accounts', 'assigned', 'home')
    const selectedGlobalHome = join(root, 'codex-accounts', 'global', 'home')
    const relative = join(
      'sessions',
      '2026',
      '07',
      '20',
      'rollout-2026-07-20T12-00-00-session.jsonl'
    )
    const sourcePath = join(sourceHome, relative)
    const wrongTargetPath = join(selectedGlobalHome, relative)
    mkdirSync(join(sourcePath, '..'), { recursive: true })
    mkdirSync(join(wrongTargetPath, '..'), { recursive: true })
    writeFileSync(sourcePath, '{"source":"chat-home"}\n', 'utf-8')
    writeFileSync(wrongTargetPath, '{"source":"global-account"}\n', 'utf-8')

    const result = await prepareLegacySharedCodexSessionResume(
      {
        agent: 'codex',
        sessionId: 'session-a',
        filePath: sourcePath,
        codexHome: sourceHome,
        executionHostId: 'local',
        fork: true,
        accountBinding: { provider: 'codex', accountId: 'assigned-account' }
      },
      {
        isHostSystemDefaultRealHomeSelected: () => false,
        getSelectedHostAccountCodexHomePath: () => selectedGlobalHome,
        resolveManagedAccountHome: (accountId) => {
          expect(accountId).toBe('assigned-account')
          return assignedHome
        },
        systemCodexHomePath: systemHome
      }
    )

    expect(result).toEqual({ useRealCodexHome: false, substituteCodexHome: assignedHome })
    expect(readFileSync(join(assignedHome, relative), 'utf-8')).toBe('{"source":"chat-home"}\n')
    expect(readFileSync(wrongTargetPath, 'utf-8')).toBe('{"source":"global-account"}\n')
  })

  function prepare() {
    return prepareLegacySharedCodexSessionResume(legacyArgs(), options())
  }

  function legacyArgs() {
    return {
      agent: 'codex' as const,
      filePath: rolloutPath,
      codexHome: legacyHome,
      executionHostId: 'local' as const
    }
  }

  function options() {
    return {
      isHostSystemDefaultRealHomeSelected: () => true,
      legacyCodexHomePath: legacyHome,
      systemCodexHomePath: systemHome
    }
  }

  function targetRolloutPath(): string {
    return join(systemHome, 'sessions', '2026', '07', '20', basename(rolloutPath))
  }
})
