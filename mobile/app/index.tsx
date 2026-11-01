import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'

// Diagnostic session cut. The real root layout paints this field. Do not merge.
export default function DuoKbCoreSessionScreen() {
  const [value, setValue] = useState('')
  return (
    <View style={{ flex: 1, padding: 24, paddingTop: 80 }}>
      <Text>DuoKbCoreSession. Tap the field. It does not focus itself.</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="First keyboard"
        style={{ borderWidth: 1, marginTop: 16, padding: 12 }}
      />
    </View>
  )
}
