import { withLiveCatalogListing } from '../../native-chat/agent-model-catalog/agent-model-catalog-entry'
import type { AcpStructuredOptions } from './acp-structured-options'
import type { AcpDialect } from '../acp-dialects/acp-dialect'
import { acpCatalogModels } from './acp-catalog-models'
import { acpSessionAcceptsImages } from '../protocol/acp-image-capability'

export async function readAcpLiveOptions(
  session: Parameters<typeof acpSessionAcceptsImages>[0] & {
    options: AcpStructuredOptions
    spec: { dialect: Pick<AcpDialect, 'catalogModels'> }
  },
  permissionModes?: Readonly<Partial<Record<string, string>>>
) {
  const acceptsImages = await acpSessionAcceptsImages(session)
  // Only startup establishes config resolution; later reads may reflect changed picks.
  const read = session.options.read()
  const { catalogListing } = withLiveCatalogListing({
    ...read,
    models: acpCatalogModels(session.spec.dialect, session.options)
  })
  const options = { ...read, catalogListing }
  return {
    ...options,
    current: {
      ...options.current,
      reportedPermissionMode: session.options.reportedPermissionMode(permissionModes)
    },
    acceptsImages
  }
}
