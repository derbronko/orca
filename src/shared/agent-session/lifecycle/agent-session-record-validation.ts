import { isOptionalUsageLimitContinueCancel } from './agent-session-usage-limit-continue'
import type { AgentSessionDeathEvidence } from './agent-session-death-evidence'
import { isAgentSessionRewindRecord } from './agent-session-rewind'
import { isAgentSessionLaunchArgs } from './agent-session-launch-args'
import { isAgentSessionConversationName } from '../agent-session-conversation-name'
import { isAgentSessionConversationCommandRecord } from '../agent-session-conversation-command'
import {
  isPersistedAgentSessionHandoffStage,
  isPersistedAgentSessionRuntimeKind,
  type PersistedAgentSessionObservationLease,
  type PersistedAgentSessionObservationRecord,
  type PersistedAgentSessionRecord
} from './agent-session-legacy-handoff-lease'
import { isManagedAgentAccountRef } from '../../agent-accounts/agent-account-preference'
import type {
  AgentSessionExecutionLocation,
  AgentSessionProcessIdentity,
  AgentSessionLaunchEnv
} from './agent-session-record'
import {
  AGENT_SESSION_RECORD_SCHEMA_VERSION,
  AGENT_SESSION_BOUND_RECORD_SCHEMA_VERSION
} from './agent-session-record-schema'
import { decodePersistedAgentSessionProviderHandleChain } from './agent-session-provider-handle'
import { isAgentSessionProviderContextBoundary } from '../agent-session-provider-context'
import { isStructuredAgentId } from './agent-session-provider-handle-encoding'
import { isNonNegativeSafeInteger } from '../../ssh-retained-payload-limits'
import {
  isAgentSessionAccountHome,
  isOptionalAgentSessionLaunchedAccount,
  MAX_PATH_LENGTH
} from './agent-session-account-home'
const MAX_ID_LENGTH = 512
/** A death evidence's `detail` past this fails a load, so whoever writes one cuts it here. */
export const MAX_AGENT_SESSION_DEATH_DETAIL_CHARS = MAX_ID_LENGTH
const MAX_LAUNCH_ENV_ENTRIES = 256
const MAX_LAUNCH_ENV_VALUE_LENGTH = 65_536
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/

const isBoundedString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

export const isAgentSessionId = (value: unknown): value is string =>
  typeof value === 'string' && SESSION_ID_PATTERN.test(value)

/** NUL cannot occur in a host id, distro name, or workspace id, so no component can forge a join. */

/** Separate native/WSL/SSH workspace copies so one host cannot adjudicate another's lease. */
export function agentSessionScopeKey(location: AgentSessionExecutionLocation): string {
  return [location.executionHostId, location.wslDistro ?? '', location.workspaceId].join('\u0000')
}

export function agentSessionExecutionLocationsEqual(
  left: AgentSessionExecutionLocation,
  right: AgentSessionExecutionLocation
): boolean {
  return (
    agentSessionScopeKey(left) === agentSessionScopeKey(right) &&
    left.workspaceKind === right.workspaceKind
  )
}

export function isAgentSessionExecutionLocation(
  value: unknown
): value is AgentSessionExecutionLocation {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const location = value as Partial<AgentSessionExecutionLocation>
  return (
    isBoundedString(location.executionHostId, MAX_ID_LENGTH) &&
    (location.wslDistro === null || isBoundedString(location.wslDistro, MAX_ID_LENGTH)) &&
    isBoundedString(location.workspaceId, MAX_ID_LENGTH) &&
    (location.workspaceKind === 'git-worktree' || location.workspaceKind === 'folder')
  )
}

export function isAgentSessionProcessIdentity(
  value: unknown
): value is AgentSessionProcessIdentity {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const identity = value as Partial<AgentSessionProcessIdentity>
  return (
    isBoundedString(identity.hostId, MAX_ID_LENGTH) &&
    Number.isSafeInteger(identity.pid) &&
    (identity.pid as number) > 0 &&
    (identity.processStartTimeMs === null ||
      (Number.isSafeInteger(identity.processStartTimeMs) &&
        (identity.processStartTimeMs as number) >= 0)) &&
    isBoundedString(identity.spawnToken, MAX_ID_LENGTH) &&
    (identity.runtime === undefined || isBoundedString(identity.runtime, MAX_ID_LENGTH))
  )
}

export function isAgentSessionOptions(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const entries = Object.entries(value)
  return (
    entries.length <= 32 &&
    entries.every(
      ([key, option]) =>
        isBoundedString(key, MAX_ID_LENGTH) && isBoundedString(option, MAX_ID_LENGTH)
    )
  )
}

export function isAgentSessionLaunchEnv(value: unknown): value is AgentSessionLaunchEnv {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const entries = Object.entries(value)
  return (
    entries.length <= MAX_LAUNCH_ENV_ENTRIES &&
    entries.every(
      ([key, entry]) =>
        isBoundedString(key, MAX_ID_LENGTH) &&
        typeof entry === 'string' &&
        entry.length <= MAX_LAUNCH_ENV_VALUE_LENGTH
    )
  )
}

function isAgentSessionDeathEvidence(value: unknown): value is AgentSessionDeathEvidence {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const evidence = value as Partial<AgentSessionDeathEvidence>
  const { observedAt, lastProvenAliveAt, ownerFence, runtimeEnd } = evidence
  return (
    (evidence.kind === 'exit-observed' ||
      evidence.kind === 'kill-delivered' ||
      evidence.kind === 'pid-absent' ||
      evidence.kind === 'identity-mismatch') &&
    isBoundedString(evidence.detail, MAX_AGENT_SESSION_DEATH_DETAIL_CHARS) &&
    isNonNegativeSafeInteger(observedAt) &&
    (ownerFence === undefined || isNonNegativeSafeInteger(ownerFence)) &&
    (lastProvenAliveAt === undefined ||
      (isNonNegativeSafeInteger(lastProvenAliveAt) && lastProvenAliveAt <= observedAt)) &&
    (runtimeEnd === undefined || isBoundedString(runtimeEnd, MAX_ID_LENGTH))
  )
}

function isStoredRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPersistedAgentSessionObservationLease(
  lease: unknown
): lease is PersistedAgentSessionObservationLease {
  if (!isStoredRecordObject(lease)) {
    return false
  }
  return (
    isAgentSessionId(lease.sessionId) &&
    isPersistedAgentSessionRuntimeKind(lease.runtimeKind) &&
    typeof lease.runtimeFence === 'number' &&
    Number.isSafeInteger(lease.runtimeFence) &&
    lease.runtimeFence >= 0 &&
    (lease.handoffStage === null || isPersistedAgentSessionHandoffStage(lease.handoffStage)) &&
    (lease.provenHandleLinkId === null || isBoundedString(lease.provenHandleLinkId, 128)) &&
    (lease.ownerProcess === null || isAgentSessionProcessIdentity(lease.ownerProcess)) &&
    (lease.reservedSpawnToken === null ||
      isBoundedString(lease.reservedSpawnToken, MAX_ID_LENGTH)) &&
    Number.isSafeInteger(lease.leaseDeadlineAt) &&
    Number.isSafeInteger(lease.lastRenewedAt) &&
    (lease.handoffOperationId === null ||
      isBoundedString(lease.handoffOperationId, MAX_ID_LENGTH)) &&
    isBoundedString(lease.claimKeyId, MAX_ID_LENGTH) &&
    (lease.claimStatus === 'reserved' ||
      lease.claimStatus === 'live' ||
      lease.claimStatus === 'conflicted' ||
      lease.claimStatus === 'released') &&
    typeof lease.unreconciled === 'boolean' &&
    (lease.deathEvidence === null || isAgentSessionDeathEvidence(lease.deathEvidence))
  )
}

/** Stored identity is independent of registrations; availability is checked only at start. */
export function isPersistedAgentSessionObservationRecord(
  value: unknown
): value is PersistedAgentSessionObservationRecord {
  if (!isStoredRecordObject(value)) {
    return false
  }
  const record = value
  if (
    !(
      ((record.schemaVersion === AGENT_SESSION_RECORD_SCHEMA_VERSION &&
        record.accountBinding === undefined) ||
        (record.schemaVersion === AGENT_SESSION_BOUND_RECORD_SCHEMA_VERSION &&
          isManagedAgentAccountRef(record.accountBinding) &&
          record.accountBinding.provider === record.provider)) &&
      isAgentSessionId(record.sessionId) &&
      isAgentSessionExecutionLocation(record.location) &&
      isStructuredAgentId(record.provider) &&
      isAgentSessionAccountHome(record.accountHome) &&
      isOptionalAgentSessionLaunchedAccount(record.launchedAccount) &&
      (record.launchDirectory === undefined ||
        isBoundedString(record.launchDirectory, MAX_PATH_LENGTH)) &&
      (record.options === undefined || isAgentSessionOptions(record.options)) &&
      (record.permissionMode === undefined ||
        isBoundedString(record.permissionMode, MAX_ID_LENGTH)) &&
      isOptionalUsageLimitContinueCancel(record.usageLimitContinueCancel) &&
      (record.rewind === undefined || isAgentSessionRewindRecord(record.rewind)) &&
      (record.providerContextBoundary === undefined ||
        isAgentSessionProviderContextBoundary(record.providerContextBoundary)) &&
      (record.conversationCommand === undefined ||
        isAgentSessionConversationCommandRecord(record.conversationCommand)) &&
      (record.conversationName === undefined ||
        isAgentSessionConversationName(record.conversationName)) &&
      (record.conversationNameSource === undefined || record.conversationNameSource === 'user') &&
      (record.launchArgs === undefined || isAgentSessionLaunchArgs(record.launchArgs)) &&
      !Object.hasOwn(record, 'launchEnv') &&
      isPersistedAgentSessionObservationLease(record.lease) &&
      record.lease.sessionId === record.sessionId &&
      Number.isSafeInteger(record.createdAt) &&
      Number.isSafeInteger(record.updatedAt)
    )
  ) {
    return false
  }
  // The row holds stored handles; validate the chain they decode to.
  const chain = decodePersistedAgentSessionProviderHandleChain(record.providerHandleChain)
  const head = chain?.at(-1)
  return (
    chain !== null &&
    // Chain validation already enforces one namespace.
    (!head || head.handle.agent === record.provider) &&
    (record.providerContextBoundary === undefined ||
      record.providerContextBoundary.afterFence <= record.lease.runtimeFence) &&
    (record.lease.claimStatus !== 'live' ||
      (record.lease.ownerProcess !== null &&
        // Null: the owner's process is live and its provider has not answered with a handle yet.
        (record.lease.provenHandleLinkId === null ||
          (head?.linkId === record.lease.provenHandleLinkId &&
            head.mintedAtFence === record.lease.runtimeFence))))
  )
}

/** Writable records require the complete observation and a safe next-grant floor. */
export function isPersistedAgentSessionRecord(
  value: unknown
): value is PersistedAgentSessionRecord {
  if (!isPersistedAgentSessionObservationRecord(value)) {
    return false
  }
  const floor = value.lease.minimumNextFence
  return (
    floor === undefined || (typeof floor === 'number' && Number.isSafeInteger(floor) && floor >= 0)
  )
}
