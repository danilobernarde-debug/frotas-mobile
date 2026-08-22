import type { PostgrestError } from '@supabase/supabase-js'

/** Código de "unique_violation" do Postgres -- usado pra reconhecer a
 *  recuperação de idempotência (origem_local_id repetido), que não é uma
 *  falha de verdade. */
export const VIOLACAO_UNICIDADE = '23505'

/**
 * Classifica um erro do supabase-js pra decidir se vale tentar de novo.
 * RLS/permissão/validação (CHECK) não vão se resolver sozinhos numa
 * próxima tentativa -- são permanentes, precisam de atenção manual.
 * Qualquer outra coisa (timeout, 5xx, falha de rede que passou pelo
 * NetInfo mas ainda assim falhou) é tratada como recuperável.
 */
export function classificarErroSupabase(erro: PostgrestError | Error | unknown): {
  retentavel: boolean
  mensagem: string
} {
  const mensagem =
    (erro as PostgrestError)?.message ?? (erro instanceof Error ? erro.message : String(erro))
  const codigo = (erro as PostgrestError)?.code

  const permanente =
    codigo === '42501' ||
    codigo === '23514' ||
    /row-level security|permission denied/i.test(mensagem)

  return { retentavel: !permanente, mensagem }
}
