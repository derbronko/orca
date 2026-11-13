import type { NativeChatStructuredViewProps } from '../../native-chat-view-types'
import type { NativeChatHandOff } from './use-native-chat-hand-off'
import { nativeChatPaneHeader } from './NativeChatPaneHeader'
import { useStructuredAgentSessionAccountBinding } from '../../session/status/structured-agent-session-status-hooks'

export function useNativeChatStructuredAccountHeader(
  view: Omit<NativeChatStructuredViewProps, 'mode'>,
  ownerWorktreeId: string | null,
  colorScheme: React.CSSProperties['colorScheme'],
  handOff: NativeChatHandOff
): React.ReactElement | null {
  const accountBinding = useStructuredAgentSessionAccountBinding(view.sessionId, view.target)
  return nativeChatPaneHeader(view, ownerWorktreeId, colorScheme, handOff, accountBinding)
}
