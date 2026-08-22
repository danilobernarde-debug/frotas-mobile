function obrigatoria(nome: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(`Falta ${nome} no .env.local (veja .env.local.example).`)
  }
  return valor
}

export const SUPABASE_URL = obrigatoria(
  'EXPO_PUBLIC_SUPABASE_URL',
  process.env.EXPO_PUBLIC_SUPABASE_URL,
)

export const SUPABASE_ANON_KEY = obrigatoria(
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
)

export const APP_URL = obrigatoria('EXPO_PUBLIC_APP_URL', process.env.EXPO_PUBLIC_APP_URL)
