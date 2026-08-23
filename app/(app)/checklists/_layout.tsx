import { Stack } from 'expo-router'

export default function LayoutChecklists() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="novo" options={{ headerShown: true, title: 'Novo checklist' }} />
    </Stack>
  )
}
