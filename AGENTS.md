# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Duas armadilhas deste projeto no SDK 57

1. **`expo-notifications` não pode ser importado no topo de um módulo que
   carrega sempre.** No Expo Go do Android, só carregar o módulo faz
   `throw` (mudou de aviso pra exceção no SDK 55) e derruba o app inteiro
   antes de qualquer tela. O acesso é centralizado em
   `src/lib/pushNotifications.ts`, com require preguiçoso guardado por
   `isRunningInExpoGo()` -- use as funções de lá, não importe o módulo
   direto.

2. **`.env` (versionado) tem `EXPO_PUBLIC_USE_RN_FETCH=1` e não é
   decorativo.** Desde o SDK 56 o `expo/fetch` virou o `fetch` padrão e
   ele não aceita arquivo no formato `{ uri, name, type }` dentro de
   `FormData` -- que é como todo upload do app manda foto
   (`src/lib/api.ts`). Sem essa variável, nenhuma foto sobe. O próprio
   `.env` explica o racional completo.

## Supabase Local (compartilhado com outros sistemas)

O app usa o Supabase Local (servidor `192.168.100.6`, API em
`https://supabase.dbmachado.com`), **compartilhado com o painel do Frotas, o
Sistema RH e o módulo Documentos**. O banco e as migrations ficam no
`frotas-web`. Antes de mudar algo no Supabase (tabela, política, Storage,
Realtime, endereço ou chave), leia `D:\Sistemas Claude\.Conexões\Supabase Local\`
(LEIA-ME, INVENTARIO, as últimas entradas do HISTORICO e as PENDENCIAS). Depois
de mudar, registre no `HISTORICO.md` e atualize o `INVENTARIO.md`. Nunca copie
chaves ou senhas para esses arquivos.

Endereço e chave do app vêm do ambiente `preview` da EAS
(`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`), que **vence** o
`.env.local`. Trocar lá e publicar com
`eas update --branch preview --environment preview`.
