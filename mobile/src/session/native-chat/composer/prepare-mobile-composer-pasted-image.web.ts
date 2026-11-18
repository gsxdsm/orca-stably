import { fitMobileAgentImageBase64 } from '../../../files/attachments/mobile-agent-image-fit'
import type { MobileComposerPastedImage } from './mobile-native-chat-composer-image-paste'

const DATA_URL_PREFIX_RE = /^data:image\/[a-z0-9.+-]+;base64,/i

// Agents read only images within their size limits; small readable ones pass through unchanged.
async function prepareOne(image: MobileComposerPastedImage): Promise<MobileComposerPastedImage> {
  const source = image.base64.replace(DATA_URL_PREFIX_RE, '')
  const prepared = await fitMobileAgentImageBase64(source)
  if (prepared === source) {
    return image
  }
  return { base64: prepared, uri: `data:image/jpeg;base64,${prepared}` }
}

export function prepareMobileComposerPastedImages(
  images: readonly MobileComposerPastedImage[] | Promise<readonly MobileComposerPastedImage[]>
): Promise<readonly MobileComposerPastedImage[]> {
  return Promise.resolve(images).then((list) => Promise.all(list.map((image) => prepareOne(image))))
}
