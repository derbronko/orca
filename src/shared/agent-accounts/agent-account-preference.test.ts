import { describe, expect, it } from 'vitest'
import {
  mergeAgentAccountPreferencePatch,
  resolveAgentAccountPreference
} from './agent-account-preference'

describe('resolveAgentAccountPreference', () => {
  it('prefers a workspace account over the project account', () => {
    expect(
      resolveAgentAccountPreference({
        provider: 'claude',
        workspace: { claude: { accountId: 'workspace-account' } },
        project: { claude: { accountId: 'project-account' } }
      })
    ).toEqual({
      source: 'workspace',
      account: { provider: 'claude', accountId: 'workspace-account' }
    })
  })

  it('reveals the project account after the workspace preference is cleared', () => {
    expect(
      resolveAgentAccountPreference({
        provider: 'claude',
        workspace: {},
        project: { claude: { accountId: 'project-account' } }
      })
    ).toEqual({
      source: 'project',
      account: { provider: 'claude', accountId: 'project-account' }
    })
  })

  it('returns global inheritance after both preferences are cleared', () => {
    expect(
      resolveAgentAccountPreference({
        provider: 'codex',
        workspace: {},
        project: {}
      })
    ).toEqual({ source: 'global', account: null })
  })

  it('keeps an explicit workspace assignment even if unavailable at this pure layer', () => {
    expect(
      resolveAgentAccountPreference({
        provider: 'codex',
        workspace: { codex: { accountId: 'removed-account' } },
        project: { codex: { accountId: 'project-account' } }
      })
    ).toEqual({
      source: 'workspace',
      account: { provider: 'codex', accountId: 'removed-account' }
    })
  })

  it('merges provider patches without overwriting the sibling preference', () => {
    expect(
      mergeAgentAccountPreferencePatch(
        { claude: { accountId: 'claude-account' } },
        { codex: { accountId: 'codex-account' } }
      )
    ).toEqual({
      claude: { accountId: 'claude-account' },
      codex: { accountId: 'codex-account' }
    })
  })
})
