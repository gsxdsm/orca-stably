import { Stack } from 'expo-router'

// Diagnostic router cut. One native stack screen and no Orca providers. Do not merge.
export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  )
}
