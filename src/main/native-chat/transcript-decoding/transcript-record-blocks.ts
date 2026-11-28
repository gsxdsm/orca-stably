import type {
  NativeChatBlock,
  NativeChatImageRefBlock,
  NativeChatToolResultBlock
} from '../../../shared/native-chat/native-chat-types'
import { asRecord } from '../../ai-vault/parsing/session-record-fields'
import { extractString } from '../../../shared/text/trimmed-string'
import {
  isClaudeToolUseContent,
  isClaudeToolResultContent,
  claudeToolResultText,
  claudeToolResultFailed
} from '../../../shared/agent-hook-listener/providers/claude/transcripts/claude-tool-content'

/** Content whitespace is meaningful to Markdown and copied tool output. */
function contentString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/** Keeps a text block's first-line indent; its edge blank lines would land in copied text. */
function blockText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const lead = value.length - value.trimStart().length
  if (lead === value.length) {
    return null
  }
  return (lead ? value.slice(value.lastIndexOf('\n', lead) + 1) : value).trimEnd()
}

/** Bytes live here, not on the block, so a snapshot cannot serialize them. */
const pendingToolResultImages = new WeakMap<NativeChatToolResultBlock, ToolResultImageSource[]>()

export type ToolResultImageSource = {
  path?: string
  url?: string
  alt?: string
  mediaType?: string
  base64?: string
}

export function takePendingToolResultImages(
  block: NativeChatBlock
): ToolResultImageSource[] | undefined {
  if (block.type !== 'tool-result') {
    return undefined
  }
  const pending = pendingToolResultImages.get(block)
  if (pending) {
    pendingToolResultImages.delete(block)
  }
  return pending
}

export function movePendingToolResultImages(from: NativeChatBlock, to: NativeChatBlock): void {
  const pending = takePendingToolResultImages(from)
  if (pending && to.type === 'tool-result') {
    pendingToolResultImages.set(to, pending)
  }
}

export function toolResultOutput(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (!Array.isArray(value)) {
    const record = asRecord(value)
    if (record) {
      const text = contentString(record.text) ?? contentString(record.content)
      if (text) {
        return text
      }
    }
    return value === undefined || value === null ? '' : JSON.stringify(value)
  }
  const parts: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      parts.push(item)
      continue
    }
    const record = asRecord(item)
    const text = contentString(record?.text) ?? contentString(record?.content)
    if (text) {
      parts.push(text)
    }
  }
  // A part's own final newline already separates it from the next.
  return parts.map((part, i) => (i && !parts[i - 1].endsWith('\n') ? `\n${part}` : part)).join('')
}

export function claudeContentBlocks(content: unknown): NativeChatBlock[] {
  if (typeof content === 'string') {
    const text = content.trim()
    return text ? [{ type: 'text', text: content }] : []
  }
  if (!Array.isArray(content)) {
    return []
  }
  const blocks: NativeChatBlock[] = []
  for (const item of content) {
    if (typeof item === 'string') {
      if (item.trim()) {
        blocks.push({ type: 'text', text: item })
      }
      continue
    }
    const record = asRecord(item)
    if (!record) {
      continue
    }
    blocks.push(...claudeContentBlock(record))
  }
  return blocks
}

function claudeContentBlock(record: Record<string, unknown>): NativeChatBlock[] {
  switch (record.type) {
    case 'text': {
      const text = blockText(record.text)
      return text ? [{ type: 'text', text }] : []
    }
    case 'thinking': {
      // Reasoning uses text blocks; message role carries its classification.
      const text = blockText(record.thinking) ?? blockText(record.text)
      return text ? [{ type: 'text', text }] : []
    }
    case 'tool_use': {
      const name = extractString(record.name) ?? 'tool'
      const callId = extractString(record.id)
      return [{ type: 'tool-call', name, input: record.input, ...(callId ? { callId } : {}) }]
    }
    case 'tool_result':
      return toolResultBlocks(record.content, {
        callId: extractString(record.tool_use_id) ?? undefined,
        isError: record.is_error === true
      })
    case 'image': {
      const image = imageRefBlock(record)
      return image ? [image] : []
    }
    default: {
      if (isClaudeToolUseContent(record)) {
        return [
          {
            type: 'tool-call',
            name: String(record.name),
            input: record.input,
            callId: String(record.id)
          }
        ]
      }
      if (isClaudeToolResultContent(record)) {
        return toolResultBlocks(claudeToolResultText(record.content), {
          callId: String(record.tool_use_id),
          isError: claudeToolResultFailed(record)
        })
      }
      return []
    }
  }
}

export function toolResultBlocks(
  content: unknown,
  options: { callId?: string; isError?: boolean } = {}
): NativeChatBlock[] {
  const block: NativeChatToolResultBlock = {
    type: 'tool-result',
    output: toolResultOutput(content),
    ...(options.callId ? { callId: options.callId } : {}),
    ...(options.isError ? { isError: true } : {})
  }
  const images = collectToolResultImageSources(content)
  if (images.length > 0) {
    pendingToolResultImages.set(block, images)
  }
  return [block]
}

export function collectToolResultImageSources(value: unknown): ToolResultImageSource[] {
  const sources: ToolResultImageSource[] = []
  for (const record of imageRecords(value)) {
    const source = imageSource(record)
    if (source) {
      sources.push(source)
    }
  }
  return sources
}

function imageRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const record = asRecord(item)
      return record ? [record] : []
    })
  }
  const record = asRecord(value)
  if (!record) {
    return []
  }
  if (isImageRecord(record)) {
    return [record]
  }
  if (Array.isArray(record.content)) {
    return imageRecords(record.content)
  }
  if (Array.isArray(record.output)) {
    return imageRecords(record.output)
  }
  return []
}

function isImageRecord(record: Record<string, unknown>): boolean {
  return (
    record.type === 'image' ||
    record.type === 'Image' ||
    record.type === 'input_image' ||
    record.type === 'local_image' ||
    record.type === 'LocalImage'
  )
}

function imageSource(record: Record<string, unknown>): ToolResultImageSource | null {
  if (!isImageRecord(record)) {
    return null
  }
  const source = asRecord(record.source)
  const alt = extractString(record.alt) ?? undefined
  const url =
    extractString(source?.url) ?? extractString(record.url) ?? extractString(record.image_url)
  const path =
    extractString(record.path) ?? extractString(source?.path) ?? extractString(source?.file_path)
  const inline = extractString(source?.data) ?? (source ? null : extractString(record.data))
  const base64 = inline ?? dataUrlPayload(url)
  const mediaType =
    extractString(source?.media_type) ??
    extractString(record.mimeType) ??
    extractString(record.media_type) ??
    undefined
  if (!path && !url && !base64) {
    return null
  }
  return {
    ...(path ? { path } : {}),
    ...(url && !url.startsWith('data:') ? { url } : {}),
    ...(alt ? { alt } : {}),
    ...(mediaType ? { mediaType } : {}),
    ...(base64 ? { base64 } : {})
  }
}

function dataUrlPayload(url: string | null): string | null {
  if (!url?.startsWith('data:')) {
    return null
  }
  const comma = url.indexOf(',')
  return comma === -1 ? null : url.slice(comma + 1)
}

function imageRefBlock(record: Record<string, unknown>): NativeChatImageRefBlock | null {
  const source = asRecord(record.source)
  const url = extractString(source?.url) ?? extractString(record.url)
  const path = extractString(record.path)
  const alt = extractString(record.alt) ?? undefined
  if (!url && !path) {
    return null
  }
  return {
    type: 'image-ref',
    ...(path ? { path } : {}),
    ...(url ? { url } : {}),
    ...(alt ? { alt } : {})
  }
}
