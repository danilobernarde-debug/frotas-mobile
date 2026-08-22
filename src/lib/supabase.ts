import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

// RN não pausa timers sozinho quando o app vai pra segundo plano -- sem
// isso, o supabase-js tentaria renovar o token enquanto o app está
// invisível, gastando bateria/rede à toa (recomendação oficial do
// supabase-js pra React Native).
AppState.addEventListener('change', (estado) => {
  if (estado === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})
