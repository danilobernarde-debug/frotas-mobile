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
