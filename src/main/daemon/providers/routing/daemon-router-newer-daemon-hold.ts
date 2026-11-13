import { NEWER_DAEMON_HOLD_ERROR } from '../../../../shared/newer-daemon-hold'
import type { PtySpawnOptions } from '../../../providers/pty/provider-contract'
import { isHoldingForNewerProtocolDaemon } from './daemon-newer-protocol-hold'
import type { DaemonPtyAdapter } from '../adapter/daemon-pty-adapter'
import type { DaemonSessionOwnerResolver } from './daemon-session-owner-resolution'
import { ACCOUNT_BINDING_RETENTION_DAEMON_PROTOCOL_VERSION } from '../../protocol/daemon-protocol-version'

/** Gate every spawn source against duplicating sessions a newer, unadoptable daemon may still own. */
export async function routeSpawnOrHold(
  opts: Pick<PtySpawnOptions, 'sessionId' | 'requiresAccountBindingRetention'>,
  routed: DaemonPtyAdapter | undefined,
  current: DaemonPtyAdapter,
  ownerResolver: DaemonSessionOwnerResolver<DaemonPtyAdapter>
): Promise<DaemonPtyAdapter> {
  const { sessionId } = opts
  let target = routed ?? current
  if (
    routed ||
    !sessionId ||
    !isHoldingForNewerProtocolDaemon() ||
    !current.hasRestorableHistory(sessionId)
  ) {
    target = routed ?? current
  } else {
    // Unknown inventory cannot authorize a duplicate shell or agent.
    const resolution = await ownerResolver.resolve(sessionId)
    if (resolution.kind !== 'owner') {
      throw new Error(NEWER_DAEMON_HOLD_ERROR)
    }
    target = resolution.provider
  }
  if (
    opts.requiresAccountBindingRetention === true &&
    target.protocolVersion < ACCOUNT_BINDING_RETENTION_DAEMON_PROTOCOL_VERSION
  ) {
    throw new Error(
      'This terminal belongs to a daemon that cannot retain its managed account binding. Reopen it on the current terminal daemon before launching the agent.'
    )
  }
  return target
}
