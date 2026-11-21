import { agentSessionRefusalError } from '../../../../shared/agent-session/failures/agent-session-wire-refusals'
import { isManagedAgentAccountRef } from '../../../../shared/agent-accounts/agent-account-preference'
import { chatAgentsShareConversations } from '../../../../shared/structured-agent-cli-conversation-adoption'
import { isAgentSessionLaunchArgs } from '../../../../shared/agent-session/lifecycle/agent-session-launch-args'
import {
  isAgentSessionLaunchEnv,
  isAgentSessionOptions
} from '../../../../shared/agent-session/lifecycle/agent-session-record'
import { agentSessionProviderHandleRoot } from '../../../../shared/agent-session/lifecycle/agent-session-provider-handle-encoding'
import type { AgentSessionReserveRequest } from './agent-session-reservation-admission'
import {
  listAgentSessionConversations,
  type AgentSessionStoreState
} from '../records/agent-session-store-state'

export function validateAgentSessionReservationInput(request: AgentSessionReserveRequest): void {
  if (
    request.accountBinding !== undefined &&
    (!isManagedAgentAccountRef(request.accountBinding) ||
      request.accountBinding.provider !== request.provider)
  ) {
    throw new Error('agent_session_account_binding_invalid')
  }
  if (request.launchEnv && !isAgentSessionLaunchEnv(request.launchEnv)) {
    throw new Error('agent_session_launch_env_invalid')
  }
  if (request.launchArgs && !isAgentSessionLaunchArgs(request.launchArgs)) {
    throw new Error('agent_session_launch_args_invalid')
  }
  if (request.options && !isAgentSessionOptions(request.options)) {
    throw new Error('agent_session_options_invalid')
  }
}

/** Refuse another record's current conversation, matching the pre-commit check.
 * Run inside the transaction: distinct adoption ids evade per-record CAS and providers may permit corrupting concurrent writers.
 * Self-exemption is not replay; the operation ledger resolves replay before this guard. */
export function assertAdoptedConversationUnowned(
  state: AgentSessionStoreState,
  request: AgentSessionReserveRequest
): void {
  const adopted = request.adoptedHandleLink
  if (!adopted) {
    return
  }
  const root = agentSessionProviderHandleRoot(adopted.handle)
  for (const record of listAgentSessionConversations(state)) {
    if (record.sessionId === request.sessionId) {
      continue
    }
    const head = record.providerHandleChain.at(-1)
    const holdsSameConversation =
      !!head &&
      (agentSessionProviderHandleRoot(head.handle) === root ||
        (head.handle.transport === adopted.handle.transport &&
          head.handle.nativeId === adopted.handle.nativeId &&
          chatAgentsShareConversations(head.handle.agent, adopted.handle.agent)))
    if (holdsSameConversation) {
      throw agentSessionRefusalError('agent_session_conflict', {
        reason: 'conversationHeldElsewhere',
        owner: { sessionId: record.sessionId, workspaceId: record.location.workspaceId }
      })
    }
  }
}
