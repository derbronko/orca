import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeWithStructuredSessionAccountHome } from '../session-tabs/structured-session-account-home'
import { agentSessionRecordFixture } from '../../../shared/agent-session/lifecycle/agent-session-record.test-fixture'
import type { AgentSessionRecord } from '../../../shared/agent-session/lifecycle/agent-session-record'
import type { ManagedAgentAccountRef } from '../../../shared/agent-accounts/agent-account-preference'

vi.mock('../session-tabs/structured-session-cli-writer-host', () => ({
  OrcaRuntimeWithStructuredSessionCliWriterHost: class {}
}))

describe('native session account policy', () => {
  const boundHome = { variable: 'CODEX_HOME', path: 'C:/accounts/assigned' }
  const globalHome = { variable: 'CODEX_HOME', path: 'C:/accounts/global' }
  const record: AgentSessionRecord = {
    ...agentSessionRecordFixture(),
    provider: 'codex',
    providerHandleChain: [],
    schemaVersion: 3,
    accountBinding: { provider: 'codex', accountId: 'assigned' },
    accountHome: boundHome
  }

  function context() {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the account-home methods run against these explicit runtime ports.
    return {
      requireStore: () => ({ getSettings: () => ({}) }),
      structuredAgentLaunchEnv: () => ({}),
      structuredAgentAccountHomeResolver: () => async () => globalHome,
      assignedStructuredAgentAccountHome: async (account: ManagedAgentAccountRef) => {
        if (account.provider !== 'codex' || account.accountId !== 'assigned') {
          throw new Error('Wrong account requested')
        }
        return boundHome
      },
      accounts: { prepareHostAgentLaunch: async () => {} }
    } as unknown as OrcaRuntimeWithStructuredSessionAccountHome
  }

  it('uses the saved assignment for reads and restarts despite another global account', async () => {
    const runtime = context()
    expect(
      await OrcaRuntimeWithStructuredSessionAccountHome.prototype.resolveStructuredAgentLaunchAccountHome.call(
        runtime,
        record
      )
    ).toEqual({ variable: 'CODEX_HOME', path: 'C:/accounts/assigned' })
    expect(
      await OrcaRuntimeWithStructuredSessionAccountHome.prototype.prepareStructuredAgentLaunchAccountHome.call(
        runtime,
        record,
        'C:/project'
      )
    ).toEqual({ variable: 'CODEX_HOME', path: 'C:/accounts/assigned' })
  })

  it('retains selection-following behavior for old unassigned sessions', async () => {
    const runtime = context()
    const legacy = { ...agentSessionRecordFixture(), provider: 'codex', providerHandleChain: [] }
    expect(
      await OrcaRuntimeWithStructuredSessionAccountHome.prototype.resolveStructuredAgentLaunchAccountHome.call(
        runtime,
        legacy
      )
    ).toEqual({ variable: 'CODEX_HOME', path: 'C:/accounts/global' })
  })

  it('refuses a binding for another provider instead of inheriting a global account', async () => {
    const runtime = context()
    await expect(
      OrcaRuntimeWithStructuredSessionAccountHome.prototype.prepareStructuredAgentLaunchAccountHome.call(
        runtime,
        { ...record, accountBinding: { provider: 'claude', accountId: 'assigned' } },
        'C:/project'
      )
    ).rejects.toThrow('provider mismatch')
  })
})
