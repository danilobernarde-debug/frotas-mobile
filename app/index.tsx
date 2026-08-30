import { Redirect } from 'expo-router'

/**
 * (auth) e (app) só existem como grupos -- nenhum dos dois mapeia a raiz
 * "/". Sem esta rota, um cold start "limpo" (sem nenhum path anexado,
 * caso de um app standalone instalado) cai direto em +not-found. O
 * redirect de "/(auth)/entrar" já resolve pra "/(app)/menu" sozinho se
 * já houver sessão (ver app/(auth)/_layout.tsx).
 */
export default function Index() {
  return <Redirect href="/(auth)/entrar" />
}
