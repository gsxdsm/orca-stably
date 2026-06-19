import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { AskPrompt } from './mobile-native-chat-ask'

type Props = {
  prompt: AskPrompt
  onAnswer: (text: string) => void
}

const OTHER = '__other__'

/** Native renderer for an agent's AskUserQuestion prompt: one section per
 *  question with selectable option cards (single- or multi-select) plus a
 *  free-text "Other" field, and a Send action. Neutral styling with a subtle
 *  green accent on the active choice to match the rest of the app. */
export function MobileNativeChatAsk({ prompt, onAnswer }: Props): React.JSX.Element {
  const [selections, setSelections] = useState<string[][]>(() => prompt.questions.map(() => []))
  const [otherText, setOtherText] = useState<string[]>(() => prompt.questions.map(() => ''))

  const toggle = (qi: number, label: string, multi: boolean): void => {
    setSelections((prev) => {
      const next = prev.map((s) => [...s])
      const cur = next[qi] ?? []
      if (multi) {
        next[qi] = cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]
      } else {
        next[qi] = cur.includes(label) ? [] : [label]
      }
      return next
    })
  }

  const setOther = (qi: number, value: string): void => {
    setOtherText((prev) => {
      const next = [...prev]
      next[qi] = value
      return next
    })
  }

  const answerFor = (qi: number): string => {
    const picked = (selections[qi] ?? []).filter((l) => l !== OTHER)
    const other = (selections[qi] ?? []).includes(OTHER) ? (otherText[qi] ?? '').trim() : ''
    return [...picked, other].filter((p) => p.length > 0).join(', ')
  }

  const canSubmit = useMemo(
    () => prompt.questions.every((_, i) => answerFor(i).length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selections, otherText, prompt.questions]
  )

  const submit = (): void => {
    const text = prompt.questions
      .map((_, i) => answerFor(i))
      .filter((l) => l.length > 0)
      .join('\n')
    if (text.length > 0) {
      onAnswer(text)
    }
  }

  return (
    <View style={styles.card}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="always">
        {prompt.questions.map((q, qi) => {
          const otherSelected = (selections[qi] ?? []).includes(OTHER)
          return (
            <View key={qi} style={styles.question}>
              {q.header ? <Text style={styles.header}>{q.header.toUpperCase()}</Text> : null}
              <Text style={styles.questionText}>{q.question}</Text>
              {q.options.map((opt) => (
                <OptionRow
                  key={opt.label}
                  label={opt.label}
                  description={opt.description}
                  selected={(selections[qi] ?? []).includes(opt.label)}
                  onPress={() => toggle(qi, opt.label, q.multiSelect)}
                />
              ))}
              <OptionRow
                label="Other…"
                selected={otherSelected}
                onPress={() => toggle(qi, OTHER, q.multiSelect)}
              />
              {otherSelected ? (
                <TextInput
                  style={styles.input}
                  value={otherText[qi]}
                  onChangeText={(v) => setOther(qi, v)}
                  placeholder="Type your answer"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  autoFocus
                />
              ) : null}
            </View>
          )
        })}
      </ScrollView>
      <Pressable
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        onPress={submit}
        disabled={!canSubmit}
      >
        <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
          Send answer
        </Text>
      </Pressable>
    </View>
  )
}

function OptionRow({
  label,
  description,
  selected,
  onPress
}: {
  label: string
  description?: string
  selected: boolean
  onPress: () => void
}): React.JSX.Element {
  return (
    <Pressable style={[styles.option, selected && styles.optionSelected]} onPress={onPress}>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected ? <Check size={12} color={colors.bgBase} strokeWidth={3} /> : null}
      </View>
      <View style={styles.optionBody}>
        <Text style={styles.optionLabel}>{label}</Text>
        {description ? (
          <Text style={styles.optionDescription} numberOfLines={3}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    maxHeight: 360,
    backgroundColor: colors.bgPanel,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  scroll: {
    paddingHorizontal: spacing.md
  },
  question: {
    paddingVertical: spacing.sm,
    gap: spacing.xs
  },
  header: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  questionText: {
    color: colors.textPrimary,
    fontSize: typography.bodySize + 1,
    fontWeight: '600',
    marginBottom: spacing.xs
  },
  option: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.card,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.xs
  },
  optionSelected: {
    borderColor: colors.statusGreen
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1
  },
  checkOn: {
    backgroundColor: colors.statusGreen,
    borderColor: colors.statusGreen
  },
  optionBody: {
    flex: 1,
    gap: 2
  },
  optionLabel: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600'
  },
  optionDescription: {
    color: colors.textSecondary,
    fontSize: typography.metaSize
  },
  input: {
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.card,
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    padding: spacing.sm,
    minHeight: 44,
    marginBottom: spacing.xs
  },
  submit: {
    margin: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.button,
    backgroundColor: colors.textPrimary,
    alignItems: 'center'
  },
  submitDisabled: {
    backgroundColor: colors.bgRaised
  },
  submitText: {
    color: colors.bgBase,
    fontSize: typography.bodySize,
    fontWeight: '700'
  },
  submitTextDisabled: {
    color: colors.textMuted
  }
})
