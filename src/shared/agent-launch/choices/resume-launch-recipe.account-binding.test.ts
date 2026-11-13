import { expect, it } from 'vitest'
import { resolveResumeLaunchRecipe } from './resume-launch-recipe'

it('retains the saved account binding when rebuilding a terminal resume recipe', () => {
  const accountBinding = { provider: 'claude', accountId: 'managed-claude-a' } as const
  expect(
    resolveResumeLaunchRecipe({ agentArgs: '--continue', agentEnv: {}, accountBinding }, 'claude', {
      key: 'session_id',
      id: 'claude-session'
    })
  ).toMatchObject({ accountBinding })
})
