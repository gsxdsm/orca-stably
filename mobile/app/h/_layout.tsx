import { Stack } from 'expo-router'
import { useTheme } from '../../src/theme/theme-context'

export default function HostGroupLayout() {
  const { colors } = useTheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgBase }
      }}
    >
      <Stack.Screen name="[hostId]/index" options={{ title: 'Host' }} />
      <Stack.Screen name="[hostId]/accounts" options={{ title: 'Accounts' }} />
      <Stack.Screen name="[hostId]/tasks" options={{ title: 'Tasks' }} />
      <Stack.Screen name="[hostId]/session/[worktreeId]" options={{ title: 'Terminal' }} />
      <Stack.Screen
        name="[hostId]/source-control/[worktreeId]"
        options={{ title: 'Source Control' }}
      />
    </Stack>
  )
}
