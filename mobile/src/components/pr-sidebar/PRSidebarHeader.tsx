import { Pressable, Text, View } from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import { colors } from '../../theme/mobile-theme'
import type { GitHubWorkItemDetails, PRInfo } from '../../../../src/shared/types'
import { prStateBadge } from './pr-checks-presentation'
import { statusColor } from './pr-sidebar-status-color'
import { openMobilePrUrl } from '../MobilePrComposeSheet'
import { mobilePrSidebarStyles as styles } from './mobile-pr-sidebar-styles'

type Props = {
  pr: PRInfo
  details: GitHubWorkItemDetails | null
}

// Header: state badge (incl. draft — display-only), title, author, base<-head.
export function PRSidebarHeader({ pr, details }: Props) {
  const item = details?.item
  const badge = prStateBadge(pr.state)
  const badgeColor = statusColor(badge.token)
  const title = item?.title ?? pr.title
  const author = item?.author ?? null
  const baseRef = item?.baseRefName ?? null
  const headRef = item?.branchName ?? null
  // Tapping the state badge or the #number opens the PR on its host (GitHub/etc.)
  // in the phone browser — pr.url is the canonical web URL.
  const openPr = pr.url ? () => openMobilePrUrl(pr.url) : undefined

  return (
    <View style={styles.section}>
      <View style={styles.sectionBody}>
        <Pressable
          onPress={openPr}
          disabled={!openPr}
          accessibilityRole="link"
          accessibilityLabel={`Open pull request #${pr.number} on the web`}
          style={({ pressed }) => [
            styles.badge,
            { borderColor: badgeColor },
            pressed && { opacity: 0.6 }
          ]}
        >
          <Text style={[styles.badgeText, { color: badgeColor }]}>{badge.label}</Text>
        </Pressable>
        <Text style={styles.prTitle}>
          {title}{' '}
          <Text
            style={styles.prMeta}
            onPress={openPr}
            accessibilityRole="link"
            accessibilityLabel={`Open pull request #${pr.number} on the web`}
          >
            #{pr.number}
          </Text>
        </Text>
        {author ? <Text style={styles.prMeta}>by {author}</Text> : null}
        {baseRef && headRef ? (
          <View style={styles.branchRow}>
            <Text style={styles.branchPill}>{baseRef}</Text>
            <ArrowLeft size={12} color={colors.textSecondary} strokeWidth={2.2} />
            <Text style={styles.branchPill}>{headRef}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
