import { describe, expect, it } from 'vitest'
import type { AgentStatusIpcPayload } from '../../../shared/agent-status/contracts/agent-status-ipc-payload'
import type { ManagedAgentAccountRef } from '../../../shared/agent-accounts/agent-account-preference'
import { structuredAgentCliSourceFromEvidence } from './structured-agent-cli-source'

const source = { workspaceId: 'workspace-1', paneKey: 'pane-1' }
const resumeFrom = { providerSessionId: 'thread-1', cliSource: source }

function evidence(accountBinding: ManagedAgentAccountRef) {
  const row = {
    state: 'done',
    prompt: '',
    stateStartedAt: 1,
    agentType: 'codex',
    worktreeId: source.workspaceId,
    paneKey: source.paneKey,
    connectionId: null,
    receivedAt: 1,
    providerSession: { key: 'conversation_id', id: resumeFrom.providerSessionId },
    launchConfig: { agentArgs: '', agentEnv: {}, accountBinding }
  } satisfies AgentStatusIpcPayload
  return { rows: [row] }
}

describe('structured CLI source account binding', () => {
  it('carries the binding from the exact matched host status row', () => {
    const accountBinding: ManagedAgentAccountRef = {
      provider: 'codex',
      accountId: 'codex-account-a'
    }
    expect(
      structuredAgentCliSourceFromEvidence({
        agent: 'codex',
        resumeFrom,
        workspaceId: source.workspaceId,
        evidence: evidence(accountBinding)
      })
    ).toMatchObject({ kind: 'matched', accountBinding })
  })

  it('rejects a corrupt or mismatched explicit source binding', () => {
    const wrongProvider: ManagedAgentAccountRef = {
      provider: 'claude',
      accountId: 'claude-account-a'
    }
    expect(() =>
      structuredAgentCliSourceFromEvidence({
        agent: 'codex',
        resumeFrom,
        workspaceId: source.workspaceId,
        evidence: evidence(wrongProvider)
      })
    ).toThrow()
  })
})
