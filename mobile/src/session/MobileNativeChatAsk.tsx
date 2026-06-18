import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { formatAskAnswer, type AskPrompt } from './mobile-native-chat-ask'

type Props = {
  prompt: AskPrompt
  onAnswer: (text: string) => void
}

/** Native renderer for a Claude AskUserQuestion prompt: one section per question
 *  with selectable option cards (single- or multi-select) and a Submit action. */
export function MobileNativeChatAsk({ prompt, onAnswer }: Props): React.JSX.Element {
  // selections[i] = chosen labels for question i.
  const [selections, setSelections] = useState<string[][]>(() => prompt.questions.map(() => []))

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

  const canSubmit = useMemo(
    () => selections.every((s, i) => prompt.questions[i]!.options.length === 0 || s.length > 0),
    [selections, prompt.questions]
  )

  const submit = (): void => {
    const text = formatAskAnswer(prompt, selections)
    if (text.length > 0) {
      onAnswer(text)
    }
  }

  return (
    <View style={styles.card}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="always">
        {prompt.questions.map((q, qi) => (
          <View key={qi} style={styles.question}>
            {q.header ? <Text style={styles.header}>{q.header.toUpperCase()}</Text> : null}
            <Text style={styles.questionText}>{q.question}</Text>
            {q.options.map((opt) => {
              const selected = (selections[qi] ?? []).includes(opt.label)
              return (
                <Pressable
                  key={opt.label}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => toggle(qi, opt.label, q.multiSelect)}
                >
                  <View style={[styles.check, selected && styles.checkOn]}>
                    {selected ? <Check size={12} color={colors.bgBase} strokeWidth={3} /> : null}
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={styles.optionLabel}>{opt.label}</Text>
                    {opt.description ? (
                      <Text style={styles.optionDescription} numberOfLines={3}>
                        {opt.description}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
          </View>
        ))}
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

const styles = StyleSheet.create({
  card: {
    maxHeight: 340,
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
    color: colors.accentBlue,
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
    borderColor: 'transparent',
    marginBottom: spacing.xs
  },
  optionSelected: {
    borderColor: colors.accentBlue
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
    backgroundColor: colors.accentBlue,
    borderColor: colors.accentBlue
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
  submit: {
    margin: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.button,
    backgroundColor: colors.accentBlue,
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
