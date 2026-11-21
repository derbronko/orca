import { z } from 'zod'
import { AI_VAULT_AGENTS } from './ai-vault-types'
import {
  isManagedAgentAccountRef,
  type ManagedAgentAccountRef
} from '../../agent-accounts/agent-account-preference'

export const AiVaultChatForkSourceSchema = z
  .object({
    agent: z.enum(AI_VAULT_AGENTS),
    sourceAgent: z.enum(AI_VAULT_AGENTS),
    sessionId: z.string().min(1),
    filePath: z.string(),
    cwd: z.string().min(1).nullable(),
    codexHome: z.string().min(1).nullable(),
    executionHostPlatform: z.enum([
      'aix',
      'android',
      'darwin',
      'freebsd',
      'haiku',
      'linux',
      'openbsd',
      'sunos',
      'win32',
      'cygwin',
      'netbsd'
    ]),
    accountBinding: z.custom<ManagedAgentAccountRef>(isManagedAgentAccountRef).optional()
  })
  .refine((source) => !source.accountBinding || source.accountBinding.provider === source.agent, {
    message: 'account binding provider must match agent',
    path: ['accountBinding']
  })
