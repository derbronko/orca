import * as z from 'zod'

export type AssignableAgentProvider = 'claude' | 'codex'

export type ManagedAgentAccountRef = {
  provider: AssignableAgentProvider
  accountId: string
}

export type AgentAccountPreferences = Partial<
  Record<AssignableAgentProvider, { accountId: string }>
>

export type AgentAccountPreferencePatch = Partial<
  Record<AssignableAgentProvider, { accountId: string } | null>
>

const AgentAccountPreferenceValueSchema = z.object({
  accountId: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .refine((value) => !value.includes('\0'))
})

export const AgentAccountPreferencePatchSchema = z.object({
  claude: AgentAccountPreferenceValueSchema.nullable().optional(),
  codex: AgentAccountPreferenceValueSchema.nullable().optional()
})

export const AgentAccountPreferencesSchema = z.object({
  claude: AgentAccountPreferenceValueSchema.optional(),
  codex: AgentAccountPreferenceValueSchema.optional()
})

export function normalizeAgentAccountPreferences(
  value: unknown
): AgentAccountPreferences | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const parsed = AgentAccountPreferencesSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function isManagedAgentAccountRef(value: unknown): value is ManagedAgentAccountRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  if (!('provider' in value) || !('accountId' in value)) {
    return false
  }
  return (
    (value.provider === 'claude' || value.provider === 'codex') &&
    typeof value.accountId === 'string' &&
    value.accountId.length > 0 &&
    value.accountId.length <= 512 &&
    !value.accountId.includes('\0')
  )
}

export type AccountPreferenceResolution =
  | { source: 'workspace' | 'project'; account: ManagedAgentAccountRef }
  | { source: 'global'; account: null }

export function mergeAgentAccountPreferencePatch(
  current: AgentAccountPreferences | undefined,
  patch: AgentAccountPreferencePatch
): AgentAccountPreferences | undefined {
  let next: AgentAccountPreferences | undefined
  for (const provider of ['claude', 'codex'] as const) {
    const value = patch[provider]
    if (value === undefined) {
      continue
    }
    next ??= { ...current }
    if (value === null) {
      delete next[provider]
    } else {
      next[provider] = value
    }
  }
  return next
}

export function resolveAgentAccountPreference(input: {
  provider: AssignableAgentProvider
  workspace?: AgentAccountPreferences
  project?: AgentAccountPreferences
}): AccountPreferenceResolution {
  const workspaceAccount = input.workspace?.[input.provider]
  if (workspaceAccount) {
    return {
      source: 'workspace',
      account: { provider: input.provider, accountId: workspaceAccount.accountId }
    }
  }
  const projectAccount = input.project?.[input.provider]
  if (projectAccount) {
    return {
      source: 'project',
      account: { provider: input.provider, accountId: projectAccount.accountId }
    }
  }
  return { source: 'global', account: null }
}
