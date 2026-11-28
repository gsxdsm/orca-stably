import type { AgentSessionModelOption } from '../../shared/agent-session/options/model-catalog/agent-session-model-option'

// Muse serves each model's contributor variant under this suffix. Its ACP model option lists only
// base ids (plus the one it launched on) and refuses the rest; `muse acp --model <variant>` runs them.
const CONTRIBUTOR_SUFFIX = '-contributor'

export function isMuseContributorModel(model: string): boolean {
  return model.endsWith(CONTRIBUTOR_SUFFIX)
}

/** The listed base models, then each one's contributor variant. */
export function museCatalogModels(
  listed: readonly AgentSessionModelOption[]
): AgentSessionModelOption[] {
  const bases = listed.filter((model) => !isMuseContributorModel(model.id))
  const variants = bases.map((base) => {
    const id = `${base.id}${CONTRIBUTOR_SUFFIX}`
    const row = listed.find((model) => model.id === id) ?? { ...base, id, isDefault: false }
    return { ...row, label: `${base.label} (contributor)` }
  })
  const unpaired = listed.filter(
    (model) =>
      isMuseContributorModel(model.id) && !variants.some((variant) => variant.id === model.id)
  )
  return [...bases, ...variants, ...unpaired]
}
