import type { AgentSessionModelOption } from '../../../shared/agent-session/options/model-catalog/agent-session-model-option'
import {
  withLiveCatalogListing,
  type AgentModelCatalogLiveListing
} from '../../native-chat/agent-model-catalog/agent-model-catalog-entry'
import type { AcpDialect } from '../acp-dialects/acp-dialect'
import type { AcpStructuredOptions } from './acp-structured-options'

type CatalogDialect = Pick<AcpDialect, 'catalogModels'>

/** The models a session shows the account catalog, which may name more than it can switch to. */
export function acpCatalogModels(
  dialect: CatalogDialect,
  options: Pick<AcpStructuredOptions, 'read'>
): AgentSessionModelOption[] {
  const { models } = options.read()
  return dialect.catalogModels?.(models) ?? models
}

/** A started session's listing for the account catalog, with its configured default. */
export function acpStartListing(
  dialect: CatalogDialect,
  options: AcpStructuredOptions
): AgentModelCatalogLiveListing {
  return withLiveCatalogListing(
    { ...options.read(), models: acpCatalogModels(dialect, options) },
    options.configuredDefault()
  ).catalogListing
}
