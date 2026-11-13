import type { AgentSessionDeathEvidence } from './agent-session-death-evidence'
import type { AgentSessionRewindRecord } from './agent-session-rewind'
/** Identity pins location, provider and account home independently of terminal tabs; the lease separately grants one process writer authority. */
import type { AgentSessionLastTurn } from './agent-session-last-turn'
import type { ManagedAgentAccountRef } from '../../agent-accounts/agent-account-preference'
import type { ExecutionHostId } from '../../execution-host'
import type { AgentSessionConversationCommandRecord } from '../agent-session-conversation-command'
import type { AgentSessionProviderHandleLink } from './agent-session-provider-handle'
import type { AgentSessionProviderContextBoundary } from '../agent-session-provider-context'
import type {
  AgentSessionAccountHome,
  AgentSessionLaunchedAccount
} from './agent-session-account-home'
import type {
  AGENT_SESSION_RECORD_SCHEMA_VERSION,
  AGENT_SESSION_BOUND_RECORD_SCHEMA_VERSION
} from './agent-session-record-schema'

export {
  AGENT_SESSION_RECORD_SCHEMA_VERSION,
  AGENT_SESSION_BOUND_RECORD_SCHEMA_VERSION
} from './agent-session-record-schema'

export type AgentSessionWorkspaceKind = 'git-worktree' | 'folder'

/** WSL shares the local host id but has a distinct filesystem, account root and process namespace; isolate sessions from native twins. */
export type AgentSessionExecutionLocation = {
  executionHostId: ExecutionHostId
  /** Distro name when the provider runs inside WSL; null for native and remote hosts. */
  wslDistro: string | null
  workspaceId: string
  workspaceKind: AgentSessionWorkspaceKind
}

/** Provider launch environment captured by the host when the session is created. */
export type AgentSessionLaunchEnv = Record<string, string>

/** Provider CLI arguments captured by the host when the session is created. */
export type AgentSessionLaunchArgs = string[]

/** Still persisted because older builds read it. The removed terminal handoff's `tui` is mapped
 *  away at decode (agent-session-legacy-handoff-lease). */
export type AgentSessionOwnerRuntimeKind = 'native'

/** The acquisition stage. Stages only older builds wrote are mapped away at decode. */
export type AgentSessionHandoffStage = 'new-owner-proving' | 'recovering'

/** Use spawnToken across platforms; start time requires Windows CIM and is unavailable in some containers. */
export type AgentSessionProcessIdentity = {
  hostId: string
  pid: number
  processStartTimeMs: number | null
  spawnToken: string
  /** The Orca runtime that started this process and holds its transport, stamped when the owner is
   *  recorded; absent on owners older builds recorded. */
  runtime?: string
}

/** released has no owner; conflicted retains a legacy terminal owner that recovery waits for and never stops because it is the user's agent. */
export type AgentSessionClaimStatus = 'reserved' | 'live' | 'conflicted' | 'released'

export type AgentSessionLease = {
  sessionId: string
  runtimeKind: AgentSessionOwnerRuntimeKind
  /** Durable monotonic integer; only acquisition CAS and proven eviction move it. */
  runtimeFence: number
  handoffStage: AgentSessionHandoffStage | null
  /** Link id of the provider handle this owner proved; the full chain lives on the record. */
  provenHandleLinkId: string | null
  /** Null between the durable reservation and the observed spawn. */
  ownerProcess: AgentSessionProcessIdentity | null
  /** Reserved before any process exists, then matched against the child's environment. */
  reservedSpawnToken: string | null
  leaseDeadlineAt: number
  /** While `ownerProcess` is set, the last time its transport holder proved it alive; parking in
   *  `recovering` proves nothing, so it leaves this alone. */
  lastRenewedAt: number
  handoffOperationId: string | null
  /** Key id that minted the HMAC claim this lease was granted under. */
  claimKeyId: string
  claimStatus: AgentSessionClaimStatus
  /** True from load until the host adjudicates it; no writer is granted while set. */
  unreconciled: boolean
  /** Imported backup/set-aside copies may hide a granted fence: floor future grants, preserving the current fence required by proven live handles. */
  minimumNextFence?: number
  /** Null on a released lease when nothing proved its owner gone. */
  deathEvidence: AgentSessionDeathEvidence | null
}

export type AgentSessionForkedFrom = {
  sessionId: string
  /** The source response whose turn the fork copied through. */
  itemId: string
  /** Where the inherited history ends in this chat's own journal. */
  childBoundary: { kind: 'item'; itemId: string } | { kind: 'start' }
}

export type AgentSessionRecord = {
  schemaVersion:
    | typeof AGENT_SESSION_RECORD_SCHEMA_VERSION
    | typeof AGENT_SESSION_BOUND_RECORD_SCHEMA_VERSION
  sessionId: string
  location: AgentSessionExecutionLocation
  /** The agent this session names, whether this build can run it or not. */
  provider: string
  providerHandleChain: AgentSessionProviderHandleLink[]
  providerContextBoundary?: AgentSessionProviderContextBoundary
  accountHome: AgentSessionAccountHome
  /** Fixed managed account selected when the conversation was created; separate from its founding home. */
  accountBinding?: ManagedAgentAccountRef
  /** Where the latest proven runtime actually launched; absent before any or from older hosts. */
  launchedAccount?: AgentSessionLaunchedAccount
  /** Optional host-written construction observation; checked independently of record readability. */
  acquiredAccount?: unknown
  /** Initial launch directory in host path syntax. Floating sessions resume here; worktree/folder IDs resolve their durable location. */
  launchDirectory?: string
  /** Provider options the user chose, replayed whenever a new owner starts the session. */
  options?: Record<string, string>
  /** The permission mode the user chose; Orca's, so a provider's options answer never replaces it. */
  permissionMode?: string
  usageLimitContinueCancel?: { turnItemId: string; resetsAt: number }
  rewind?: AgentSessionRewindRecord
  conversationCommand?: AgentSessionConversationCommandRecord
  /** The conversation's one name: Orca's automatic name or the user's rename. Session History,
   *  tabs, sidebars and phones all read this field. */
  conversationName?: string
  /** `'user'` once the user renamed the conversation; absent means Orca named it. Automatic naming
   *  never replaces a user's name, and a window's pre-upgrade tab rename only fills a name Orca
   *  chose. */
  conversationNameSource?: 'user'
  /** When the user's Sleep stopped this chat; the next admitted send clears it. */
  sleptAt?: number
  /** Latest turn edge for lists that must not open conversation history. */
  lastTurn?: AgentSessionLastTurn
  launchArgs?: AgentSessionLaunchArgs
  /** The chat this one was forked from; the marker after its inherited history derives from it. */
  forkedFrom?: AgentSessionForkedFrom
  lease: AgentSessionLease
  createdAt: number
  updatedAt: number
}

export {
  MAX_AGENT_SESSION_DEATH_DETAIL_CHARS,
  agentSessionExecutionLocationsEqual,
  agentSessionScopeKey,
  isAgentSessionExecutionLocation,
  isAgentSessionId,
  isAgentSessionLaunchEnv,
  isAgentSessionOptions,
  isAgentSessionProcessIdentity,
  isPersistedAgentSessionObservationRecord,
  isPersistedAgentSessionRecord
} from './agent-session-record-validation'
