import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { registerRootComponent } from 'expo'

// Diagnostic entry. Keeps Orca's native binary and skips expo-router. Do not merge.
function DuoKbCore() {
  const [value, setValue] = useState('')
  return (
    <View style={{ flex: 1, padding: 24, paddingTop: 80 }}>
      <Text>DuoKbCore. Tap the field. It does not focus itself.</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="First keyboard"
        style={{ borderWidth: 1, marginTop: 16, padding: 12 }}
      />
    </View>
  )
}

registerRootComponent(DuoKbCore)
