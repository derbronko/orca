import { structuredAgentSessionPaneKey } from '../../../../../../shared/agent-session/view/structured-agent-session-projection'
import { nativeChatQueueFollowUps } from '../../../../../../shared/native-chat/input/native-chat-follow-up-behavior'
import type { NativeChatStructuredViewProps } from '../../native-chat-view-types'
import { useNativeChatTabOwnerWorktreeId } from '../../pane/ownership/use-native-chat-tab-owner'
import { useNativeChatProvisionalLaunch } from '../../host-access/use-native-chat-provisional-launch'
import { useNativeChatFileLinkContext } from '../../links/actions/use-native-chat-file-link-context'
import { useStructuredAgentSessionHostExecution } from './structured-agent-session-status-hooks'
import { useAppStore } from '@/store/index'

export function useNativeChatStructuredPaneContext(
  props: Omit<NativeChatStructuredViewProps, 'mode'>
) {
  const ownerWorktreeId = useNativeChatTabOwnerWorktreeId(props.tabId)
  const fileLinkContext = useNativeChatFileLinkContext(props.tabId)
  const provisionalLaunch = useNativeChatProvisionalLaunch(ownerWorktreeId, props.sessionId)
  const hostExecution = useStructuredAgentSessionHostExecution(props.sessionId, props.target)
  const paneKey = structuredAgentSessionPaneKey(props.tabId, props.sessionId)
  const queueFollowUps = useAppStore((store) => nativeChatQueueFollowUps(store.settings))
  return {
    ownerWorktreeId,
    fileLinkContext,
    provisionalLaunch,
    hostExecution,
    paneKey,
    queueFollowUps
  }
}
