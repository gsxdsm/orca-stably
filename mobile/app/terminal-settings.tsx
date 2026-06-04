import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppState,
  View,
  Text,
  Pressable,
  ScrollView,
  Switch,
  type AppStateStatus
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight, Minus, Plus, Smartphone, X } from 'lucide-react-native'
import {
  CustomKeyModal,
  loadCustomKeys,
  saveCustomKeys,
  type CustomKey
} from '../src/components/CustomKeyModal'
import { spacing } from '../src/theme/mobile-theme'
import { useTheme, useThemedStyles } from '../src/theme/theme-context'
import { createStyles } from '../src/screen-styles/terminal-settings-screen-styles'
import { loadHosts } from '../src/transport/host-store'
import type { HostProfile } from '../src/transport/types'
import { useAllHostClients } from '../src/transport/client-context'
import type { RpcClient } from '../src/transport/rpc-client'
import { PickerModal, type PickerOption } from '../src/components/PickerModal'
import {
  TERMINAL_ACCESSORY_KEYS,
  type TerminalAccessoryKey
} from '../src/terminal/terminal-accessory-keys'
import {
  getDefaultTerminalAccessoryBuiltInIds,
  loadTerminalAccessoryLayout,
  resetTerminalAccessoryBuiltInIds,
  saveTerminalAccessoryLayout,
  setTerminalAccessoryBuiltInVisible
} from '../src/terminal/terminal-accessory-layout'
import { setTerminalAutoRestoreFitMsForHost } from '../src/terminal/terminal-auto-restore-fit-state'
import {
  clampTerminalFontSize,
  DEFAULT_TERMINAL_FONT_SIZE,
  loadTerminalFontSize,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  saveTerminalFontSize
} from '../src/terminal/terminal-font-size'

type RestoreValue = 'indefinite' | '60s' | '5m' | '30m'

const AUTO_RESTORE_FIT_OPTIONS: (PickerOption<RestoreValue> & { ms: number | null })[] = [
  { value: 'indefinite', label: 'Keep at phone size (default)', ms: null },
  { value: '60s', label: 'After 1 minute', ms: 60_000 },
  { value: '5m', label: 'After 5 minutes', ms: 5 * 60_000 },
  { value: '30m', label: 'After 30 minutes', ms: 30 * 60_000 }
]

function valueFromMs(ms: number | null | undefined): RestoreValue {
  if (ms == null) {
    return 'indefinite'
  }
  const exact = AUTO_RESTORE_FIT_OPTIONS.find((o) => o.ms === ms)
  if (exact) {
    return exact.value
  }
  // Why: server may return a non-preset ms (custom value, future preset,
  // or server-side clamp). Snap to the closest finite preset so the
  // picker's selected radio agrees with the row sublabel rendered by
  // autoRestoreSummary ("After Xs").
  let closest: (typeof AUTO_RESTORE_FIT_OPTIONS)[number] | null = null
  let bestDelta = Infinity
  for (const opt of AUTO_RESTORE_FIT_OPTIONS) {
    if (opt.ms == null) {
      continue
    }
    const delta = Math.abs(opt.ms - ms)
    if (delta < bestDelta) {
      bestDelta = delta
      closest = opt
    }
  }
  return closest ? closest.value : 'indefinite'
}

function autoRestoreSummary(ms: number | null | undefined): string {
  if (ms === undefined) {
    return '…'
  }
  if (ms === null) {
    return AUTO_RESTORE_FIT_OPTIONS[0]!.label
  }
  const exact = AUTO_RESTORE_FIT_OPTIONS.find((o) => o.ms === ms)
  return exact ? exact.label : `After ${Math.round(ms / 1000)}s`
}

function HostFitRow({
  client,
  hostName,
  ms,
  onPress
}: {
  client: RpcClient | null
  hostName: string
  ms: number | null | undefined
  onPress: () => void
}): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      disabled={!client}
    >
      <Smartphone size={16} color={colors.textSecondary} />
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{hostName}</Text>
        <Text style={styles.rowSublabel}>{autoRestoreSummary(ms)}</Text>
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
    </Pressable>
  )
}

function ShortcutBarRow({
  shortcutKey,
  visible,
  onToggle
}: {
  shortcutKey: TerminalAccessoryKey
  visible: boolean
  onToggle: (visible: boolean) => void
}): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  return (
    <View style={styles.row}>
      <View style={styles.keycap}>
        <Text style={styles.keycapText}>{shortcutKey.label}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{shortcutKey.accessibilityLabel ?? shortcutKey.label}</Text>
      </View>
      <Switch
        value={visible}
        onValueChange={onToggle}
        trackColor={{ false: colors.borderSubtle, true: colors.textSecondary }}
        thumbColor={colors.textPrimary}
      />
    </View>
  )
}

export default function TerminalSettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [hosts, setHosts] = useState<HostProfile[]>([])
  useEffect(() => {
    void loadHosts().then(setHosts)
  }, [])
  const hostIds = useMemo(() => hosts.map((h) => h.id), [hosts])
  const hostClients = useAllHostClients(hostIds)
  const hostClientsById = useMemo(
    () => new Map(hostClients.map((entry) => [entry.hostId, entry.client])),
    [hostClients]
  )

  const [customKeys, setCustomKeys] = useState<CustomKey[]>([])
  const [showCustomKeyModal, setShowCustomKeyModal] = useState(false)

  // Why: per-host current value, lazily fetched. We keep state at the
  // screen level rather than per-row so the picker can render at root
  // level — embedding PickerModal inside a row clipped its BottomDrawer
  // absoluteFill backdrop to the ScrollView content frame and made the
  // drawer appear cut-off.
  const [hostMs, setHostMs] = useState<Record<string, number | null | undefined>>({})
  const [pickerHostId, setPickerHostId] = useState<string | null>(null)
  const [visibleBuiltInIds, setVisibleBuiltInIds] = useState<string[]>(
    getDefaultTerminalAccessoryBuiltInIds
  )
  const layoutWriteChainRef = useRef<Promise<void>>(Promise.resolve())
  const layoutWriteSeqRef = useRef(0)
  const pendingLayoutWritesRef = useRef(0)

  const persistLayout = useCallback((nextIds: string[]) => {
    layoutWriteSeqRef.current += 1
    pendingLayoutWritesRef.current += 1
    layoutWriteChainRef.current = layoutWriteChainRef.current
      .catch(() => {})
      .then(() => saveTerminalAccessoryLayout(nextIds))
      .catch(() => {})
      .finally(() => {
        pendingLayoutWritesRef.current -= 1
      })
  }, [])

  const refreshShortcutLayout = useCallback(() => {
    const refreshSeq = layoutWriteSeqRef.current
    void loadTerminalAccessoryLayout().then((layout) => {
      if (pendingLayoutWritesRef.current > 0 || refreshSeq !== layoutWriteSeqRef.current) {
        return
      }
      setVisibleBuiltInIds(layout.visibleBuiltInIds)
    })
  }, [])

  const refreshCustomKeys = useCallback(() => {
    void loadCustomKeys().then(setCustomKeys)
  }, [])

  const handleDeleteCustomKey = useCallback(
    async (key: CustomKey) => {
      const updated = customKeys.filter((k) => k.id !== key.id)
      setCustomKeys(updated)
      await saveCustomKeys(updated)
    },
    [customKeys]
  )

  useFocusEffect(
    useCallback(() => {
      refreshShortcutLayout()
      refreshCustomKeys()
    }, [refreshShortcutLayout, refreshCustomKeys])
  )

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') {
        refreshShortcutLayout()
        refreshCustomKeys()
      }
    })
    return () => sub.remove()
  }, [refreshShortcutLayout, refreshCustomKeys])

  const toggleBuiltInKey = useCallback(
    (id: string, visible: boolean) => {
      setVisibleBuiltInIds((current) => {
        const next = setTerminalAccessoryBuiltInVisible(current, id, visible)
        persistLayout(next)
        return next
      })
    },
    [persistLayout]
  )

  const resetBuiltInKeys = useCallback(() => {
    const next = resetTerminalAccessoryBuiltInIds()
    setVisibleBuiltInIds(next)
    persistLayout(next)
  }, [persistLayout])

  const [fontSize, setFontSize] = useState(DEFAULT_TERMINAL_FONT_SIZE)
  useEffect(() => {
    let cancelled = false
    void loadTerminalFontSize().then((size) => {
      if (!cancelled) {
        setFontSize(size)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const adjustFontSize = useCallback((delta: number) => {
    setFontSize((current) => {
      const next = clampTerminalFontSize(current + delta)
      void saveTerminalFontSize(next)
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    for (const host of hosts) {
      const client = hostClientsById.get(host.id) ?? null
      if (!client) {
        continue
      }
      void client
        .sendRequest('terminal.getAutoRestoreFit')
        .then((resp) => {
          if (cancelled) {
            return
          }
          const value = (resp as { ms?: number | null } | null)?.ms
          // Why: reconnect/status ticks can replay the same value; preserving
          // object identity avoids rerendering every settings row again.
          setHostMs((prev) => setTerminalAutoRestoreFitMsForHost(prev, host.id, value))
        })
        .catch(() => {
          if (!cancelled) {
            setHostMs((prev) => setTerminalAutoRestoreFitMsForHost(prev, host.id, null))
          }
        })
    }
    return () => {
      cancelled = true
    }
  }, [hosts, hostClientsById])

  async function selectValue(hostId: string, value: RestoreValue) {
    const client = hostClientsById.get(hostId) ?? null
    if (!client) {
      return
    }
    const opt = AUTO_RESTORE_FIT_OPTIONS.find((o) => o.value === value)
    if (!opt) {
      return
    }
    setHostMs((prev) => setTerminalAutoRestoreFitMsForHost(prev, hostId, opt.ms))
    try {
      const resp = (await client.sendRequest('terminal.setAutoRestoreFit', {
        ms: opt.ms
      })) as { ms?: number | null } | null
      setHostMs((prev) => setTerminalAutoRestoreFitMsForHost(prev, hostId, resp?.ms))
    } catch {
      try {
        const resp = (await client.sendRequest('terminal.getAutoRestoreFit')) as {
          ms?: number | null
        } | null
        setHostMs((prev) => setTerminalAutoRestoreFitMsForHost(prev, hostId, resp?.ms))
      } catch {
        // give up silently — the next mount retries
      }
    }
  }

  const pickerHost = pickerHostId ? hosts.find((h) => h.id === pickerHostId) : null
  const visibleBuiltInSet = useMemo(() => new Set(visibleBuiltInIds), [visibleBuiltInIds])

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.topRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.heading}>Terminal</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.groupHeading}>WHEN YOU LEAVE THE APP</Text>
        <Text style={styles.groupDescription}>
          While you&apos;re using a terminal on your phone, Orca shrinks it to fit your screen. When
          you close the app or switch away, this controls whether it stays at phone size (so
          interactive CLI tools don&apos;t reflow) or resizes back to your desktop. You can always
          tap Restore on the terminal banner to resize it manually.
        </Text>

        {hosts.length === 0 ? (
          <View style={[styles.section, styles.sectionTopGap]}>
            <Text style={styles.emptyText}>
              No paired desktops yet. Pair one to control terminal behavior.
            </Text>
          </View>
        ) : (
          <View style={[styles.section, styles.sectionTopGap]}>
            {hosts.map((host, idx) => {
              const client = hostClientsById.get(host.id) ?? null
              return (
                <View key={host.id}>
                  {idx > 0 && <View style={styles.separator} />}
                  <HostFitRow
                    client={client}
                    hostName={host.name}
                    ms={hostMs[host.id]}
                    onPress={() => setPickerHostId(host.id)}
                  />
                </View>
              )
            })}
          </View>
        )}

        <Text style={[styles.groupHeading, styles.groupTopGap]}>TEXT</Text>
        <View style={[styles.section, styles.sectionTopGap]}>
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Font size</Text>
            </View>
            <View style={styles.stepperGroup}>
              <Pressable
                style={({ pressed }) => [
                  styles.stepperButton,
                  pressed && styles.stepperButtonPressed,
                  fontSize <= MIN_TERMINAL_FONT_SIZE && styles.stepperButtonDisabled
                ]}
                disabled={fontSize <= MIN_TERMINAL_FONT_SIZE}
                onPress={() => adjustFontSize(-1)}
                accessibilityRole="button"
                accessibilityLabel="Decrease terminal font size"
              >
                <Minus size={16} color={colors.textSecondary} />
              </Pressable>
              <Text style={styles.stepperValue}>{fontSize}px</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.stepperButton,
                  pressed && styles.stepperButtonPressed,
                  fontSize >= MAX_TERMINAL_FONT_SIZE && styles.stepperButtonDisabled
                ]}
                disabled={fontSize >= MAX_TERMINAL_FONT_SIZE}
                onPress={() => adjustFontSize(1)}
                accessibilityRole="button"
                accessibilityLabel="Increase terminal font size"
              >
                <Plus size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={[styles.groupHeading, styles.groupTopGap]}>SHORTCUT BAR</Text>
        <View style={[styles.section, styles.sectionTopGap]}>
          {TERMINAL_ACCESSORY_KEYS.map((shortcutKey, idx) => (
            <View key={shortcutKey.id}>
              {idx > 0 && <View style={styles.separator} />}
              <ShortcutBarRow
                shortcutKey={shortcutKey}
                visible={visibleBuiltInSet.has(shortcutKey.id)}
                onToggle={(visible) => toggleBuiltInKey(shortcutKey.id, visible)}
              />
            </View>
          ))}
          <View style={styles.separator} />
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={resetBuiltInKeys}
          >
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Reset Defaults</Text>
              <Text style={styles.rowSublabel}>Show every built-in shortcut key</Text>
            </View>
          </Pressable>
        </View>

        <Text style={[styles.groupHeading, styles.groupTopGap]}>CUSTOM SHORTCUTS</Text>
        <View style={[styles.section, styles.sectionTopGap]}>
          {customKeys.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No custom shortcuts defined yet.</Text>
            </View>
          ) : (
            customKeys.map((key, idx) => (
              <View key={key.id}>
                {idx > 0 && <View style={styles.separator} />}
                <View style={styles.row}>
                  <View style={styles.keycap}>
                    <Text style={styles.keycapText}>{key.label}</Text>
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{key.label}</Text>
                    <Text style={styles.rowSublabel} numberOfLines={1} ellipsizeMode="tail">
                      {key.bytes.replace(/\r/g, ' ↵')}
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.deleteButton,
                      pressed && styles.deleteButtonPressed
                    ]}
                    onPress={() => handleDeleteCustomKey(key)}
                  >
                    <X size={16} color={colors.statusRed} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
          <View style={styles.separator} />
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => setShowCustomKeyModal(true)}
          >
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Add Custom Shortcut…</Text>
              <Text style={styles.rowSublabel}>Create key combo or text macro</Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      </ScrollView>

      <PickerModal<RestoreValue>
        visible={pickerHost != null}
        title={pickerHost ? `Restore ${pickerHost.name}` : ''}
        options={AUTO_RESTORE_FIT_OPTIONS}
        selected={valueFromMs(pickerHost ? hostMs[pickerHost.id] : null)}
        onSelect={(v) => {
          if (pickerHost) {
            void selectValue(pickerHost.id, v)
          }
        }}
        onClose={() => setPickerHostId(null)}
      />

      <CustomKeyModal
        visible={showCustomKeyModal}
        onClose={() => setShowCustomKeyModal(false)}
        onKeysChanged={(keys) => {
          setCustomKeys(keys)
        }}
      />
    </View>
  )
}
