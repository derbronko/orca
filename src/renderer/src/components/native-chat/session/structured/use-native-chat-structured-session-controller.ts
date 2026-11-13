import type { NativeChatStructuredViewProps } from '../../native-chat-view-types'
import { structuredAgentSessionDraftScopeKey } from '../../drafts/native-chat-draft-scope'
import { useStructuredAgentSession } from './use-structured-agent-session'
import { nativeChatStructuredStopControls } from './writes/native-chat-structured-stop-controls'
import { useRecheckNativeChatFileLinksWhenTurnEnds } from '../../links/actions/use-native-chat-file-link-existence'
import type { useNativeChatRewindHost } from '../../messages/actions/use-native-chat-rewind-host'
import type { useNativeChatProvisionalLaunch } from '../../host-access/use-native-chat-provisional-launch'
import type { useNativeChatStructuredPaneContext } from '../status/use-native-chat-structured-pane-context'

export function useNativeChatStructuredSessionController(args: {
  props: Omit<NativeChatStructuredViewProps, 'mode'>
  queueFollowUps: ReturnType<typeof useNativeChatStructuredPaneContext>['queueFollowUps']
  hostExecution: ReturnType<typeof useNativeChatStructuredPaneContext>['hostExecution']
  provisionalLaunch: ReturnType<typeof useNativeChatProvisionalLaunch>
  rewind: ReturnType<typeof useNativeChatRewindHost>['rewindHost']
}) {
  const controller = useStructuredAgentSession({
    ...args.props,
    composerScopeKey: structuredAgentSessionDraftScopeKey(args.props.sessionId),
    queueFollowUps: args.queueFollowUps,
    hostStopping: args.hostExecution.stopping,
    hostOptionStamp: args.hostExecution.optionStamp,
    providerStarting: args.hostExecution.phase === 'starting',
    providerRunning: args.hostExecution.phase === 'ready',
    rewind: args.rewind,
    transportEnabled: args.provisionalLaunch.transportEnabled,
    ...(args.provisionalLaunch.launch ? { launch: args.provisionalLaunch.launch } : {})
  })
  useRecheckNativeChatFileLinksWhenTurnEnds(controller.isWorking)
  return {
    controller,
    stopControls: nativeChatStructuredStopControls(controller, args.hostExecution.stopping)
  }
}
