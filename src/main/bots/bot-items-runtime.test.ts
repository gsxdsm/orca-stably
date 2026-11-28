import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { BotItemsHostDeps } from './bot-items-runtime'
import { BotItemsHost } from './bot-items-runtime'
import { botItemsStoreFile } from './bot-items-input'

const state = vi.hoisted(() => ({ directory: '/profile' }))
const directories: string[] = []

vi.mock('../orca-profiles/profile-storage-paths', () => ({
  getProfileUserDataPath: () => state.directory
}))

function hostWith(deps: Partial<BotItemsHostDeps>): BotItemsHost {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these tests exercise only paths whose dependencies are supplied below.
  const defaults = {
    workRuntime: {},
    db: { items: vi.fn(), dispose: vi.fn() },
    bots: () => [],
    githubCache: () => ({ pr: {}, issue: {} }),
    automations: () => [],
    chatTitle: () => null,
    chatExists: () => true,
    chatRoot: (id: string) => id,
    threadChats: () => [],
    automationRunChats: () => [],
    notify: () => {},
    sendMail: async () => true
  } as unknown as BotItemsHostDeps
  return new BotItemsHost({ ...defaults, ...deps })
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

it('keeps item-mail attachment retention unknown only while an existing store cannot read', async () => {
  const read = vi.fn<() => Promise<string[]>>()
  state.directory = await mkdtemp(join(tmpdir(), 'orca-item-retention-'))
  directories.push(state.directory)
  const remote = { owedCommentAttachmentUploads: read }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the retention path reads only this method of the store.
  const host = hostWith({ db: { items: vi.fn(() => remote), dispose: vi.fn() } as never })

  expect(await host.owedCommentAttachmentUploads(state.directory, '/attachments')).toEqual(
    new Set()
  )

  await writeFile(botItemsStoreFile(state.directory), '')

  read.mockRejectedValueOnce(new Error('items database is temporarily unavailable'))
  expect(await host.owedCommentAttachmentUploads(state.directory, '/attachments')).toBeNull()

  read.mockResolvedValueOnce(['recovered-upload'])
  expect(await host.owedCommentAttachmentUploads(state.directory, '/attachments')).toEqual(
    new Set(['recovered-upload'])
  )
})

it('shows an item from a replaced Home Chat as a plain chat, under its own title', () => {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: owningChat reads only a bot's id and chatSessionId.
  const bots = () => [{ id: 'bo', chatSessionId: 'home-2' }] as never
  const titles: Record<string, string> = { 'home-1': 'Share dialog planning', 'home-2': 'Home' }
  const source = { kind: 'home', title: 'Home Chat' } as const
  const host = hostWith({ bots, chatTitle: (id) => titles[id] ?? null })
  const untitled = hostWith({ bots })

  expect(host.owningChat({ chatId: 'home-1', ownerBotId: 'bo', source })).toEqual({
    id: 'home-1',
    kind: 'chat',
    title: 'Share dialog planning'
  })
  expect(untitled.owningChat({ chatId: 'home-1', ownerBotId: 'bo', source })).toEqual({
    id: 'home-1',
    kind: 'chat',
    title: null
  })
  expect(host.owningChat({ chatId: 'home-2', ownerBotId: 'bo', source }).kind).toBe('home')
})
