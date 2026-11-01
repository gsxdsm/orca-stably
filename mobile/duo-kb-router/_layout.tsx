import { View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Notifications from 'expo-notifications'
import { registerPushDismissalTask } from '../src/notifications/push-background-dismissal'
import { foregroundNotificationBehavior } from '../src/notifications/push-receive'
import { startMobileAppearance } from '../src/theme/mobile-appearance'
import { useMobileColorScheme } from '../src/theme/use-mobile-color-scheme'
import { SideSafeArea } from '../src/layout/side-safe-area'
import { SideRailProvider } from '../src/layout/side-rail'

// Diagnostic providers cut. One text field under Orca's root shell. Do not merge.
startMobileAppearance()
void registerPushDismissalTask().catch(() => {})
Notifications.setNotificationHandler({
  handleNotification: foregroundNotificationBehavior
})

export default function RootLayout() {
  const colorScheme = useMobileColorScheme()
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <SideRailProvider>
        <SideSafeArea>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
          </Stack>
        </SideSafeArea>
      </SideRailProvider>
    </View>
  )
}
