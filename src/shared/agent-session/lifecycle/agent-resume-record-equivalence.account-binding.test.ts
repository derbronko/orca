import { expect, it } from 'vitest'
import { launchConfigsEqual } from './agent-resume-record-equivalence'

it('treats an account binding as launch identity when saving sleeping records', () => {
  const base = { agentArgs: '', agentEnv: {} }
  expect(
    launchConfigsEqual(base, {
      ...base,
      accountBinding: { provider: 'codex', accountId: 'managed-codex-a' }
    })
  ).toBe(false)
})
