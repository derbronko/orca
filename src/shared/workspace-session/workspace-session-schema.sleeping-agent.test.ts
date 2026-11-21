import { describe, it, expect } from 'vitest'
import { parseWorkspaceSession } from './workspace-session-schema'
import { sleepingAgentSessionRecordSchema } from './workspace-session-sleeping-agents'

describe('parseWorkspaceSession sleeping agents', () => {
  const codexRecord = {
    paneKey: 'pane-1',
    worktreeId: 'wt',
    agent: 'codex',
    providerSession: { key: 'session_id', id: 'codex-session' },
    prompt: 'continue',
    state: 'working',
    capturedAt: 10,
    updatedAt: 9,
    launchConfig: {
      agentArgs: '',
      agentEnv: {},
      accountBinding: { provider: 'codex', accountId: 'managed-codex-a' }
    }
  } as const

  it('keeps a valid provider-matched account binding in saved launch config', () => {
    expect(
      sleepingAgentSessionRecordSchema.parse(codexRecord).launchConfig?.accountBinding
    ).toEqual({ provider: 'codex', accountId: 'managed-codex-a' })
  })

  it.each([
    { provider: 'claude', accountId: 'managed-claude-a' },
    { provider: 'codex', accountId: '' }
  ])(
    'refuses corrupt bindings instead of dropping them to legacy unbound resumes',
    (accountBinding) => {
      expect(
        sleepingAgentSessionRecordSchema.safeParse({
          ...codexRecord,
          launchConfig: { ...codexRecord.launchConfig, accountBinding }
        }).success
      ).toBe(false)
    }
  )

  it('drops launch config with prototype-polluting env keys without dropping siblings', () => {
    const sessions = JSON.parse(`{
      "__proto__": {
        "paneKey": "__proto__",
        "worktreeId": "wt",
        "agent": "codex",
        "providerSession": { "key": "session_id", "id": "bad-session" },
        "prompt": "bad",
        "state": "working",
        "capturedAt": 10,
        "updatedAt": 9
      },
      "tab1:pane-1": {
        "paneKey": "tab1:pane-1",
        "tabId": "tab1",
        "worktreeId": "wt",
        "agent": "codex",
        "providerSession": { "key": "session_id", "id": "codex-session" },
        "prompt": "continue",
        "state": "working",
        "capturedAt": 10,
        "updatedAt": 9,
        "launchConfig": {
          "agentArgs": "",
          "agentEnv": { "__proto__": "polluted" }
        }
      }
    }`)
    const result = parseWorkspaceSession({
      activeRepoId: null,
      activeWorktreeId: null,
      activeTabId: null,
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      sleepingAgentSessionsByPaneKey: sessions
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.hasOwn(result.value.sleepingAgentSessionsByPaneKey ?? {}, '__proto__')).toBe(
        false
      )
      const record = result.value.sleepingAgentSessionsByPaneKey?.['tab1:pane-1']
      expect(record?.agent).toBe('codex')
      expect(record?.launchConfig).toBeUndefined()
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    }
  })
})
