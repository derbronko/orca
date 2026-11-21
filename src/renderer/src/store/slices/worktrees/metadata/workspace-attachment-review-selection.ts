import type { WorktreeMeta } from '../../../../../../shared/worktree/meta-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { WorktreeMetaUpdate } from './worktree-meta-update-options'
import { getHostedReviewLinkForMetaRefresh } from './hosted-review-link-update-encoding'

const REVIEW_SLOTS = [
  'linkedPR',
  'linkedGitLabMR',
  'linkedBitbucketPR',
  'linkedAzureDevOpsPR',
  'linkedGiteaPR'
] as const

export function hasExplicitWorkspaceReviewSelection(
  updates: Pick<
    Partial<WorktreeMeta>,
    | 'linkedPR'
    | 'linkedGitLabMR'
    | 'linkedBitbucketPR'
    | 'linkedAzureDevOpsPR'
    | 'linkedGiteaPR'
    | 'linkedItems'
  >
): boolean {
  return (
    REVIEW_SLOTS.some((slot) => typeof updates[slot] === 'number' && updates[slot] > 0) ||
    REVIEW_SLOTS.every((slot) => updates[slot] === null)
  )
}

export function getWorkspaceReviewRefreshHints(
  updates: Partial<WorktreeMeta>,
  workspace: Worktree | undefined
) {
  return {
    linkedGitHubPR: getHostedReviewLinkForMetaRefresh(updates, workspace, 'linkedPR'),
    linkedGitLabMR: getHostedReviewLinkForMetaRefresh(updates, workspace, 'linkedGitLabMR'),
    linkedBitbucketPR: getHostedReviewLinkForMetaRefresh(updates, workspace, 'linkedBitbucketPR'),
    linkedAzureDevOpsPR: getHostedReviewLinkForMetaRefresh(
      updates,
      workspace,
      'linkedAzureDevOpsPR'
    ),
    linkedGiteaPR: getHostedReviewLinkForMetaRefresh(updates, workspace, 'linkedGiteaPR')
  }
}

export function getWorkspaceReviewPersistenceUpdates(
  mutation: WorktreeMetaUpdate,
  normalized: Partial<WorktreeMeta>
): WorktreeMetaUpdate {
  // Keep the original delta; generated review slots guard its derived push target on the host.
  return {
    ...mutation,
    ...Object.fromEntries(
      Object.entries(normalized).filter(
        ([key]) =>
          !key.startsWith('linked') ||
          (mutation.linkedItems !== undefined &&
            REVIEW_SLOTS.some((slot) => slot === key) &&
            !(key in mutation))
      )
    )
  }
}
