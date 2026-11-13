import { expect, it } from 'vitest'
import { AiVaultChatForkSourceSchema } from './ai-vault-chat-fork-contract'

const source = {
  agent: 'codex',
  sourceAgent: 'codex',
  sessionId: 'thread-1',
  filePath: 'C:/sessions/thread.jsonl',
  cwd: 'C:/work',
  codexHome: null,
  executionHostPlatform: 'win32'
} as const

it('keeps a provider-matched chat binding in the CLI fork response', () => {
  const accountBinding = { provider: 'codex', accountId: 'managed-codex-a' }
  expect(AiVaultChatForkSourceSchema.parse({ ...source, accountBinding }).accountBinding).toEqual(
    accountBinding
  )
})

it('refuses a mismatched provider binding in the CLI fork response', () => {
  expect(
    AiVaultChatForkSourceSchema.safeParse({
      ...source,
      accountBinding: { provider: 'claude', accountId: 'managed-claude-a' }
    }).success
  ).toBe(false)
})
