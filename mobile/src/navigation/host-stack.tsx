import { Stack } from 'expo-router'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors } from '../theme/mobile-theme'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { HOST_STACK_SCREENS, type HostStackAnimation } from './host-stack-screens'

export function HostStack({ animation }: { animation: HostStackAnimation }) {
  useMobileTranslation()
  const colorScheme = useMobileColorScheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgBase },
        // Swap tablet detail panes instantly so slides cannot reveal the outgoing pane’s underlying screen; phones retain native slides.
        animation,
        // The focused host screen is this stack, so it has to carry the same view-controller style as the root.
        statusBarStyle: colorScheme === 'dark' ? 'light' : 'dark'
      }}
    >
      {HOST_STACK_SCREENS.map(({ name, title }) => (
        <Stack.Screen key={name} name={name} options={{ title }} />
      ))}
    </Stack>
  )
}
