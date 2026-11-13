import * as z from 'zod'
import { OptionalString, requiredString } from '../rpc-param-primitives'
import { isTuiAgent } from '../../agent-launch/catalog/tui-agent-config'
import { SpawnIntentParam } from './agent-session-params'
import { TERMINAL_PANE_SPLIT_SOURCES } from '../../feature-education-telemetry'
import {
  isManagedAgentAccountRef,
  type ManagedAgentAccountRef
} from '../../agent-accounts/agent-account-preference'

export function createTerminalSpawnParams<
  TExpectedIncarnation extends z.ZodTypeAny,
  TColorReplies extends z.ZodTypeAny,
  TShell extends z.ZodTypeAny
>(input: {
  expectedIncarnationId: TExpectedIncarnation
  terminalColorQueryReplies: TColorReplies
  shell: TShell
}) {
  const ResumeProviderSessionParam = z.object({
    key: z.enum(['session_id', 'conversation_id']),
    id: z.string().min(1).max(512),
    transcriptPath: z.string().min(1).max(32_768).optional()
  })

  const TerminalCreateParams = z
    .object({
      worktree: OptionalString,
      clientMutationId: z.string().min(1).max(128).optional(),
      reconcileExisting: z.boolean().optional(),
      command: OptionalString,
      startupCommandDelivery: z.enum(['fast', 'shell-ready']).optional(),
      env: z.record(z.string(), z.string()).optional(),
      envToDelete: z.array(z.string().min(1).max(256)).max(32).optional(),
      launchConfig: z
        .object({
          agentCommand: z.string().optional(),
          agentArgs: z.string(),
          agentEnv: z.record(z.string(), z.string()),
          ompResumeFilePath: z
            .string()
            .min(1)
            .max(32 * 1024)
            .optional(),
          accountBinding: z.custom<ManagedAgentAccountRef>(isManagedAgentAccountRef).optional()
        })
        .optional(),
      resumeProviderSession: ResumeProviderSessionParam.optional(),
      resumeOrigin: z.literal('saved').optional(),
      launchToken: OptionalString,
      trustWorktreeId: z.string().min(1).max(32_768).optional(),
      launchAgent: z.string().refine(isTuiAgent).optional(),
      terminalKittyKeyboardProtocol: z.boolean().optional(),
      terminalColorQueryReplies: input.terminalColorQueryReplies.optional(),
      terminalViewAttributes: z.unknown().optional(),
      title: OptionalString,
      focus: z.unknown().optional(),
      rendererBacked: z.unknown().optional(),
      activate: z.unknown().optional(),
      presentation: z.enum(['background', 'focused']).optional(),
      tabId: OptionalString,
      leafId: OptionalString,
      spawnIntent: SpawnIntentParam.optional(),
      shell: input.shell.optional(),
      windowTab: z.literal(true).optional(),
      cwd: OptionalString
    })
    .superRefine((params, context) => {
      const binding = params.launchConfig?.accountBinding
      if (binding && binding.provider !== params.launchAgent) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['launchConfig', 'accountBinding'],
          message: 'Account binding provider must match the launch agent'
        })
      }
    })

  const TerminalSplit = z
    .object({
      terminal: OptionalString,
      expectedIncarnationId: input.expectedIncarnationId,
      direction: z
        .unknown()
        .transform((value) => (value === 'vertical' || value === 'horizontal' ? value : undefined))
        .pipe(z.union([z.enum(['vertical', 'horizontal']), z.undefined()]))
        .optional(),
      command: OptionalString,
      env: z.record(z.string(), z.string()).optional(),
      telemetrySource: z.enum(TERMINAL_PANE_SPLIT_SOURCES).optional(),
      retrySplit: z.string().min(1, 'Missing split id').optional(),
      pane: z
        .object({
          worktreeId: requiredString('Missing worktree'),
          tabId: requiredString('Missing tab'),
          leafId: requiredString('Missing pane')
        })
        .optional(),
      newLeafId: OptionalString,
      cwd: OptionalString,
      initialSize: z
        .object({
          cols: z.number().int().min(1).max(1000),
          rows: z.number().int().min(1).max(500)
        })
        .optional()
    })
    .superRefine((params, context) => {
      if (!params.terminal && !params.pane) {
        context.addIssue({ code: 'custom', message: 'Missing terminal handle', path: ['terminal'] })
      }
    })

  return { ResumeProviderSessionParam, TerminalCreateParams, TerminalSplit }
}
