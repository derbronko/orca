import { expect, it } from 'vitest'
import { agentSessionRecordFixture } from '../../../../shared/agent-session/lifecycle/agent-session-record.test-fixture'
import type { AgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-record'
import { UsageLimitAccountHolds } from './structured-agent-session-usage-limit-account-hold'
import {
  HOUR,
  weekly
} from '../host/testing/structured-agent-session-usage-limit-fleet.test-fixture'

it('holds each bound account on its own usage during the same sweep', async () => {
  const now = 1_800_000_000_000
  const reset = now - 60_000
  const records = new Map<string, AgentSessionRecord>(
    ['a', 'b'].map((id) => [
      id,
      {
        ...agentSessionRecordFixture(),
        sessionId: id,
        schemaVersion: 3,
        provider: 'codex',
        accountBinding: { provider: 'codex', accountId: id },
        accountHome: { variable: 'CODEX_HOME', path: `/homes/${id}` }
      }
    ])
  )
  const host: Parameters<UsageLimitAccountHolds['attribute']>[1] = {
    store: { getRecord: (id) => records.get(id) ?? null },
    launchAccountHome: async (record) => record.accountHome,
    usageLimitAutoContinue: {
      isEnabled: () => true,
      isWorkspaceAsleep: () => false,
      subscribe: () => () => {},
      accountUsage: async (_provider, home) => {
        const spent = 'path' in home && home.path === '/homes/a'
        return {
          scope: spent ? 'account-a' : 'account-b',
          account: {
            key: spent ? 'a' : 'b',
            read: () => weekly(spent ? 100 : 0, spent ? now + HOUR : null, now),
            refresh: () => false
          }
        }
      }
    }
  }
  const holds = new UsageLimitAccountHolds()
  holds.beginPass()
  await holds.attribute('a', host)
  await holds.attribute('b', host)

  const cut = { turnItemId: 'limited-turn', resetsAt: reset }
  expect(holds.verdict('a', cut, now).resetsAt).toBe(now + HOUR)
  expect(holds.verdict('b', cut, now).resetsAt).toBe(reset)
  expect(holds.ready('a', cut, now)).toBe(false)
  expect(holds.ready('b', cut, now)).toBe(true)
})
