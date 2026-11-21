import { afterEach, describe, expect, it, vi } from 'vitest'
import { openStructuredCodexRpcHarness } from '../rpc/methods/structured-sessions/structured-codex-session-rpc-test-harness'
import {
  HOST_TEST_SESSION,
  HOST_TEST_NOW,
  hostTestMessage,
  hostTestOperationId
} from '../../native-chat/agent-session-wire/host/testing/structured-agent-session-host-test-data'
import { seedTestAgentSessionRecordStore } from './records/agent-session-record-store-test-harness'
import { closeTestJournalHostDatabase } from '../../native-chat/agent-session-journal/store-lifecycle/journal-host-database-test-support'
import { foundAgentSessionRecord } from './records/agent-session-record-founding'
import { OrcaRuntimeWithStructuredSessionAccountHome } from '../session-tabs/structured-session-account-home'
import type { ManagedAgentAccountRef } from '../../../shared/agent-accounts/agent-account-preference'
import type { AgentSessionRecord } from '../../../shared/agent-session/lifecycle/agent-session-record'
import { computeAgentSessionPayloadFingerprint } from '../../../shared/agent-session/lifecycle/agent-session-mutation-envelope'
import {
  ensureStructuredAgentSessionHost,
  stopStructuredAgentSessionRuntime
} from './structured-agent-session-runtime'

const accountBinding: ManagedAgentAccountRef = { provider: 'codex', accountId: 'codex-assigned-a' }
const assignedHome = { variable: 'CODEX_HOME' as const, path: 'C:/accounts/assigned-a' }

describe('a bound Codex chat after the structured runtime restarts', () => {
  let harness: Awaited<ReturnType<typeof openStructuredCodexRpcHarness>> | undefined
  let database: { close: () => Promise<void> } | undefined
  let globalHome = 'C:/accounts/global-a'

  afterEach(async () => {
    await stopStructuredAgentSessionRuntime()
    await database?.close()
    if (harness) {
      await closeTestJournalHostDatabase(harness.root)
    }
    await harness?.dispose()
    harness = undefined
    database = undefined
    globalHome = 'C:/accounts/global-a'
  })

  it('restarts with its saved account and provider conversation after global selection changes', async () => {
    harness = await openStructuredCodexRpcHarness()
    const accountContext = {
      requireStore: () => ({ getSettings: () => ({}) }),
      structuredAgentLaunchEnv: () => ({}),
      structuredAgentAccountHomeResolver: () => async () => ({
        variable: 'CODEX_HOME' as const,
        path: globalHome
      }),
      assignedStructuredAgentAccountHome: async (account: ManagedAgentAccountRef) => {
        if (account.provider !== 'codex' || account.accountId !== accountBinding.accountId) {
          throw new Error('unexpected assigned account')
        }
        return assignedHome
      },
      accounts: { prepareHostAgentLaunch: async () => {} }
    }
    const accountContextAsRuntime =
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this fixture supplies exactly the ports used by the account-home methods invoked below.
      accountContext as unknown as OrcaRuntimeWithStructuredSessionAccountHome
    const hostConfig = () => ({
      ...harness!.hostConfig(),
      launchAccountHome: (record: AgentSessionRecord) =>
        OrcaRuntimeWithStructuredSessionAccountHome.prototype.resolveStructuredAgentLaunchAccountHome.call(
          accountContextAsRuntime,
          record
        ),
      prepareLaunchAccountHome: (record: AgentSessionRecord, launchDirectory: string) =>
        OrcaRuntimeWithStructuredSessionAccountHome.prototype.prepareStructuredAgentLaunchAccountHome.call(
          accountContextAsRuntime,
          record,
          launchDirectory
        )
    })

    const record = foundAgentSessionRecord(
      {
        sessionId: HOST_TEST_SESSION,
        location: {
          executionHostId: 'local',
          workspaceId: 'workspace-1',
          workspaceKind: 'git-worktree',
          wslDistro: null
        },
        provider: 'codex',
        accountHome: assignedHome,
        accountBinding
      },
      { claimKeyId: 'key-1', now: HOST_TEST_NOW }
    )
    await seedTestAgentSessionRecordStore(harness.root, { records: [record] })
    let host = await ensureStructuredAgentSessionHost(hostConfig())
    database = host.deps.journalDatabase
    expect(host.deps.store.getRecord(HOST_TEST_SESSION)).toMatchObject({
      schemaVersion: 3,
      accountBinding
    })
    const firstSend = send('first turn', record.lease.runtimeFence)
    await host.send({ callerKey: 'account-binding-restart' }, firstSend)
    await vi.waitFor(() =>
      expect(harness!.codex.live().launch.env).toMatchObject({ CODEX_HOME: assignedHome.path })
    )
    await vi.waitFor(() =>
      expect(
        host.deps.store.getRecord(HOST_TEST_SESSION)?.providerHandleChain.at(-1)?.handle
      ).toEqual({
        transport: 'codex-app-server',
        agent: 'codex',
        nativeId: 'thread-integration'
      })
    )
    expect(host.deps.store.getRecord(HOST_TEST_SESSION)).toMatchObject({
      schemaVersion: 3,
      accountBinding
    })

    await stopStructuredAgentSessionRuntime()
    globalHome = 'C:/accounts/global-b'
    host = await ensureStructuredAgentSessionHost(hostConfig())
    database = host.deps.journalDatabase
    expect(host.deps.store.getRecord(HOST_TEST_SESSION)).toMatchObject({
      schemaVersion: 3,
      accountBinding,
      providerHandleChain: [
        expect.objectContaining({
          handle: {
            transport: 'codex-app-server',
            agent: 'codex',
            nativeId: 'thread-integration'
          }
        })
      ]
    })
    const reopened = host.deps.store.getRecord(HOST_TEST_SESSION)!
    await host.send(
      { callerKey: 'account-binding-restart' },
      send('second turn', reopened.lease.runtimeFence)
    )
    await vi.waitFor(() =>
      expect(harness!.codex.live().launch.env).toMatchObject({ CODEX_HOME: assignedHome.path })
    )
  })
})

function send(text: string, fence: number) {
  const body = hostTestMessage(text)
  const clientOperationId = hostTestOperationId()
  return {
    envelope: {
      sessionId: HOST_TEST_SESSION,
      clientOperationId,
      expectedRuntimeFence: fence,
      payloadFingerprint: computeAgentSessionPayloadFingerprint({
        method: 'agentSession.send',
        sessionId: HOST_TEST_SESSION,
        fields: { body }
      })
    },
    body
  }
}
