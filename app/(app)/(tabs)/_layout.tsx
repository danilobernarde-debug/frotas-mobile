import { Tabs } from 'expo-router'
import { Text } from 'react-native'

function Icone({ simbolo, cor }: { simbolo: string; cor: string }) {
  return <Text style={{ fontSize: 20, color: cor }}>{simbolo}</Text>
}

export default function LayoutTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0d9488',
        tabBarInactiveTintColor: '#94a3b8',
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Solicitações',
          tabBarIcon: ({ color }) => <Icone simbolo="💬" cor={color} />,
        }}
      />
      <Tabs.Screen
        name="checklists"
        options={{
          title: 'Checklists',
          tabBarIcon: ({ color }) => <Icone simbolo="☑" cor={color} />,
        }}
      />
    </Tabs>
  )
}
