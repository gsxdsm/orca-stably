import { unwrapClaudePastedContent } from '../../claude-pasted-content'
import {
  stripAnsiEscapeSequences,
  TERMINAL_CONTROL_CHARACTER_PATTERN
} from '../../ansi-escape-sequences'
import {
  isImageRefBlock,
  isTextBlock,
  type NativeChatBlock,
  type NativeChatMessage
} from '../native-chat-types'
import { imageReferenceToken, replaceImageReferences } from '../native-chat-image-reference'
import { NATIVE_CHAT_QUOTED_FILE_REFERENCE } from '../../agent-image-paste'

// Keep whitespace and path starts disjoint so incomplete markers cannot rescan their suffix.
const IMAGE_SOURCE_MARKER = /^\[Image:\s*source:\s*(\S.*?|[^\S\r\n\u2028\u2029])\]\s*$/
export const IMAGE_PROMPT_MARKER = /\[Image #\d+\]/
const IMAGE_PROMPT_MARKERS = /\[Image #\d+\]/g
// A quoted file reference is matched whole, so a path that reads like a marker is left as typed.
const IMAGE_PROMPT_MARKER_NUMBERS_OUTSIDE_FILE_REFERENCES = new RegExp(
  `(${NATIVE_CHAT_QUOTED_FILE_REFERENCE.source})|\\[Image #(\\d+)\\]`,
  'g'
)
const IMAGE_PROMPT_MARKER_AT_START = /^[^\S\r\n]*\[Image #\d+\]/
const IMAGE_PROMPT_MARKER_AT_END = /\[Image #\d+\][^\S\r\n]*$/
const HORIZONTAL_WHITESPACE_START = /^[^\S\r\n]+/
const HORIZONTAL_WHITESPACE_END = /[^\S\r\n]+$/

export function imageSourcePathFromText(text: string): string | null {
  return text.match(IMAGE_SOURCE_MARKER)?.[1]?.trim() ?? null
}

const imageSourcePaths = new WeakMap<NativeChatMessage['blocks'], string[]>()
const imagePromptMarkers = new WeakMap<NativeChatMessage['blocks'], boolean>()

/** Source paths only from all-text turns whose every block is an image-source marker. Claude groups multi-image pastes into one turn;
 * requiring one block misses them, while accepting mixed blocks would hide real prompts. */
export function imageSourcePathsFromMessage(message: NativeChatMessage): string[] {
  if (message.role !== 'user') {
    return []
  }
  const cached = imageSourcePaths.get(message.blocks)
  if (cached) {
    return cached
  }
  const paths = deriveImageSourcePaths(message)
  imageSourcePaths.set(message.blocks, paths)
  return paths
}

function deriveImageSourcePaths(message: NativeChatMessage): string[] {
  const paths: string[] = []
  for (const block of message.blocks) {
    if (!isTextBlock(block)) {
      return []
    }
    const path = imageSourcePathFromText(block.text)
    if (path === null) {
      return []
    }
    paths.push(path)
  }
  return paths
}

export function isImageSourceUserTurn(message: NativeChatMessage): boolean {
  return imageSourcePathsFromMessage(message).length > 0
}

/** Map chips to sent-image [Image #N] positions, matching Claude/Codex TUIs; drop chips whose images were not sent. */
export function imageReferencesToPromptMarkers(
  text: string,
  sentImageIds: readonly string[]
): string {
  return replaceImageReferences(text, (attachmentId) => {
    const index = sentImageIds.indexOf(attachmentId)
    return index === -1 ? '' : `[Image #${index + 1}]`
  })
}

function replaceSentImagePromptMarkers(
  text: string,
  replace: (number: number, marker: string) => string
): string {
  return text.replace(
    IMAGE_PROMPT_MARKER_NUMBERS_OUTSIDE_FILE_REFERENCES,
    (match, fileReference: string | undefined, number: string) =>
      fileReference === undefined ? replace(Number(number), match) : match
  )
}

/** Restore sent markers as image chips; leave out-of-range numbers literal. */
export function promptMarkersToImageReferences(text: string, imageIds: readonly string[]): string {
  return replaceSentImagePromptMarkers(text, (number, marker) => {
    const attachmentId = imageIds[number - 1]
    return attachmentId === undefined ? marker : imageReferenceToken(attachmentId)
  })
}

/** Remove only markers belonging to this structured send’s imageCount; leave out-of-range numbers literal. */
export function stripSentImagePromptMarkers(text: string, imageCount: number): string {
  return withoutStrippedMarkerSpace(
    text,
    replaceSentImagePromptMarkers(text, (number, marker) =>
      number >= 1 && number <= imageCount ? '' : marker
    )
  )
}

export function stripImagePromptMarker(text: string): string {
  return withoutStrippedMarkerSpace(text, text.replace(IMAGE_PROMPT_MARKERS, ''))
}

function withoutStrippedMarkerSpace(text: string, stripped: string): string {
  if (stripped === text) {
    return text
  }
  let result = IMAGE_PROMPT_MARKER_AT_START.test(text)
    ? stripped.replace(HORIZONTAL_WHITESPACE_START, '')
    : stripped
  if (IMAGE_PROMPT_MARKER_AT_END.test(text)) {
    result = result.replace(HORIZONTAL_WHITESPACE_END, '')
  }
  return result
}

/** Normalizes PTY-backed user text into the pending-echo comparison key. */
export function normalizeNativeChatUserText(text: string): string {
  // Strip sequences first so their printable tails cannot survive a lone-control pass.
  return stripImagePromptMarker(
    stripAnsiEscapeSequences(unwrapClaudePastedContent(text)).replace(
      TERMINAL_CONTROL_CHARACTER_PATTERN,
      ''
    )
  )
    .trim()
    .replace(/\s+/g, ' ')
}

export function normalizedNativeChatUserMessageText(message: NativeChatMessage): string | null {
  if (message.role !== 'user') {
    return null
  }
  const normalized = normalizeNativeChatUserText(
    message.blocks
      .filter(isTextBlock)
      .map((block) => unwrapClaudePastedContent(block.text))
      .join(' ')
  )
  return normalized || null
}

function stripImagePromptMarkersFromTextBlocks(
  blocks: readonly NativeChatBlock[]
): NativeChatBlock[] {
  let sawText = false
  let next: NativeChatBlock[] | null = null
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!
    if (!isTextBlock(block)) {
      next?.push(block)
      continue
    }
    const isFirstText = !sawText
    sawText = true
    const text = stripImagePromptMarker(block.text)
    if (!text.trim() && (text !== block.text || isFirstText)) {
      next ??= blocks.slice(0, index)
      continue
    }
    if (text !== block.text) {
      next ??= blocks.slice(0, index)
      next.push({ ...block, text })
      continue
    }
    next?.push(block)
  }
  return next ?? (blocks as NativeChatBlock[])
}

export function hasImagePromptMarker(message: NativeChatMessage): boolean {
  const cached = imagePromptMarkers.get(message.blocks)
  if (cached !== undefined) {
    return cached
  }
  const hasMarker = message.blocks.some(
    (block) => isTextBlock(block) && IMAGE_PROMPT_MARKER.test(block.text)
  )
  imagePromptMarkers.set(message.blocks, hasMarker)
  return hasMarker
}

/** Consecutive source turns and their optional prompt form one preparation dependency. */
export function nativeChatImageTranscriptUnits(
  messages: readonly NativeChatMessage[]
): NativeChatMessage[][] {
  const units: NativeChatMessage[][] = []
  for (let index = 0; index < messages.length; index += 1) {
    const first = messages[index]!
    const members = [first]
    if (imageSourcePathsFromMessage(first).length > 0) {
      while (index + 1 < messages.length) {
        const next = messages[index + 1]!
        if (next.source !== first.source || imageSourcePathsFromMessage(next).length === 0) {
          break
        }
        members.push(next)
        index += 1
      }
      const prompt = messages[index + 1]
      if (
        prompt?.role === 'user' &&
        prompt.source === first.source &&
        hasImagePromptMarker(prompt)
      ) {
        members.push(prompt)
        index += 1
      }
    } else if (hasImagePromptMarker(first)) {
      const following = equalTimestampImageSourceRun(messages, index + 1, first)
      if (following) {
        members.push(...messages.slice(index + 1, following.end))
        index = following.end - 1
      }
    }
    units.push(members)
  }
  return units
}

/** Companions Claude writes after the prompt share its clock. A missing clock is not that clock. */
function equalTimestampImageSourceRun(
  messages: readonly NativeChatMessage[],
  start: number,
  prompt: NativeChatMessage
): { end: number; paths: string[] } | null {
  const paths: string[] = []
  let end = start
  while (end < messages.length) {
    const candidate = messages[end]!
    const candidatePaths = imageSourcePathsFromMessage(candidate)
    if (
      candidate.source !== prompt.source ||
      prompt.timestamp == null ||
      candidate.timestamp !== prompt.timestamp ||
      candidatePaths.length === 0
    ) {
      break
    }
    paths.push(...candidatePaths)
    end += 1
  }
  return end === start ? null : { end, paths }
}

// Insert each new companion beside the reference it follows. A path already on the prompt stays once.
function insertImageRefsInCompanionOrder(
  blocks: NativeChatBlock[],
  paths: readonly string[]
): void {
  let cursor = 0
  for (const path of paths) {
    const existing = blocks.findIndex((block) => isImageRefBlock(block) && block.path === path)
    if (existing !== -1) {
      cursor = existing + 1
      continue
    }
    blocks.splice(cursor, 0, { type: 'image-ref', path })
    cursor += 1
  }
}

/** Claude records image paths as source turns around a prompt carrying image
 * markers. Merge that run into the prompt so one paste renders once. */
export function normalizeImageTranscriptMessages(
  messages: readonly NativeChatMessage[]
): NativeChatMessage[] {
  const rows = nativeChatImageTranscriptUnits(messages).flatMap(normalizeImageTranscriptUnit)
  return rows.length === messages.length && rows.every((row, index) => row === messages[index])
    ? (messages as NativeChatMessage[])
    : rows
}

export function normalizeImageTranscriptUnit(
  messages: readonly NativeChatMessage[]
): NativeChatMessage[] {
  const first = messages[0]!
  if (imageSourcePathsFromMessage(first).length > 0) {
    const last = messages.at(-1)!
    const hasPrompt = imageSourcePathsFromMessage(last).length === 0
    const sources = hasPrompt ? messages.slice(0, -1) : messages
    const paths = (source: NativeChatMessage) => imageSourcePathsFromMessage(source)
    if (!hasPrompt) {
      return sources.map((source) => ({
        ...source,
        blocks: paths(source).map((path) => ({ type: 'image-ref' as const, path }))
      }))
    }
    const blocks = [...stripImagePromptMarkersFromTextBlocks(last.blocks)]
    insertImageRefsInCompanionOrder(blocks, sources.flatMap(paths))
    return [{ ...last, blocks }]
  }
  if (first.role !== 'user') {
    return messages as NativeChatMessage[]
  }
  const blocks = [...stripImagePromptMarkersFromTextBlocks(first.blocks)]
  if (messages.length > 1) {
    insertImageRefsInCompanionOrder(blocks, messages.slice(1).flatMap(imageSourcePathsFromMessage))
    return [{ ...first, blocks }]
  }
  return blocks.length === first.blocks.length && blocks.every((b, i) => b === first.blocks[i])
    ? (messages as NativeChatMessage[])
    : [{ ...first, blocks }]
}
