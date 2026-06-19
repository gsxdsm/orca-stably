import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { PickerModal, type PickerOption } from '../components/PickerModal'
import { findControlOption } from './mobile-native-chat-agent-controls'
import type {
  NativeChatAgentControls,
  NativeChatControl,
  NativeChatControlSelection
} from './mobile-native-chat-agent-controls'

type Props = {
  controls: NativeChatAgentControls
  selection: NativeChatControlSelection
  disabled?: boolean
  /** Pick an option. Thinking stays in state; mode/model also fire their send. */
  onSelect: (control: NativeChatControl, optionId: string) => void
}

/**
 * Compact toolbar of the agent control chips (Mode / Thinking / Model) above the
 * mobile composer input. Each chip taps open a bottom-sheet picker. Only the
 * controls the resolved agent supports render; a single-option control (Mode
 * cycle) reads as an action chip rather than a stateful value.
 */
export function MobileNativeChatControlBar({
  controls,
  selection,
  disabled = false,
  onSelect
}: Props): React.JSX.Element | null {
  const [openKind, setOpenKind] = useState<NativeChatControl['kind'] | null>(null)
  const ordered = [controls.mode, controls.thinking, controls.model].filter(
    (c): c is NativeChatControl => c != null
  )
  if (ordered.length === 0) {
    return null
  }
  const openControl = ordered.find((c) => c.kind === openKind) ?? null

  return (
    <View style={styles.bar}>
      {ordered.map((control) => {
        const isAction = control.options.length <= 1
        const active = findControlOption(control, selection[control.kind])
        return (
          <Pressable
            key={control.kind}
            disabled={disabled}
            accessibilityLabel={`${control.label}: ${active.label}`}
            style={({ pressed }) => [
              styles.chip,
              pressed && !disabled && styles.chipPressed,
              disabled && styles.chipDisabled
            ]}
            onPress={() => setOpenKind(control.kind)}
          >
            {!isAction ? <Text style={styles.chipMeta}>{control.label}</Text> : null}
            <Text style={styles.chipLabel}>{isAction ? control.label : active.label}</Text>
            <ChevronDown size={13} color={colors.textSecondary} strokeWidth={2} />
          </Pressable>
        )
      })}

      {openControl ? (
        <PickerModal
          visible
          title={openControl.note ?? openControl.label}
          options={openControl.options.map(
            (o): PickerOption => ({
              value: o.id,
              label: o.label,
              subtitle: o.description
            })
          )}
          selected={
            openControl.options.length <= 1
              ? '__none__'
              : findControlOption(openControl, selection[openControl.kind]).id
          }
          onSelect={(value) => onSelect(openControl, value)}
          onClose={() => setOpenKind(null)}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    height: 30,
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  chipPressed: {
    opacity: 0.7
  },
  chipDisabled: {
    opacity: 0.45
  },
  chipMeta: {
    fontSize: 11,
    color: colors.textSecondary
  },
  chipLabel: {
    fontSize: typography.metaSize,
    fontWeight: '500',
    color: colors.textPrimary
  }
})
