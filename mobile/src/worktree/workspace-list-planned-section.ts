import type { Section, SectionRepo, Worktree } from './workspace-list-types'

// A section before lineage expansion: host rows only, no per-row view yet.
export type PlannedSection = Omit<Section, 'data'> & { data: Worktree[] }

export function makeSection(
  key: string,
  title: string,
  data: readonly Worktree[],
  decoration: { icon?: 'pin'; repo?: SectionRepo } = {}
): PlannedSection {
  return {
    key,
    title,
    ...(decoration.icon ? { icon: decoration.icon } : {}),
    ...(decoration.repo ? { repo: decoration.repo } : {}),
    data: [...data]
  }
}
