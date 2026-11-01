import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'

export default function DuoKbCoreRouterScreen() {
  const [value, setValue] = useState('')
  return (
    <View style={{ flex: 1, padding: 24, paddingTop: 80 }}>
      <Text>DuoKbCoreRouter. Tap the field. It does not focus itself.</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="First keyboard"
        style={{ borderWidth: 1, marginTop: 16, padding: 12 }}
      />
    </View>
  )
}
