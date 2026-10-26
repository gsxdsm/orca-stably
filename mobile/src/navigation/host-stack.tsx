import { Stack } from 'expo-router'
import { colors } from '../theme/mobile-theme'
import { HOST_STACK_SCREENS, type HostStackAnimation } from './host-stack-screens'
import { HostStackGestureContext } from './host-stack-gesture'

export function HostStack({
  animation,
  gestureEnabled
}: {
  animation: HostStackAnimation
  gestureEnabled: boolean
}) {
  return (
    <HostStackGestureContext.Provider value={gestureEnabled}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bgBase },
          // Swap tablet detail panes instantly so slides cannot reveal the outgoing pane’s underlying screen; phones retain native slides.
          animation,
          gestureEnabled
        }}
      >
        {HOST_STACK_SCREENS.map(({ name, title }) => (
          <Stack.Screen key={name} name={name} options={{ title }} />
        ))}
      </Stack>
    </HostStackGestureContext.Provider>
  )
}
