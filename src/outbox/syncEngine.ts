import NetInfo from '@react-native-community/netinfo'
import { buscarHandler } from './handlerRegistry'
import { atualizarPayload, listarPendentes, marcarEnviado, marcarErro, marcarEnviando } from './outbox'

const COOLDOWN_MS = 8_000
const TENTATIVAS_MAX = 5

export interface EstadoSync {
  sincronizando: boolean
  ultimoErro: string | null
}

let estadoAtual: EstadoSync = { sincronizando: false, ultimoErro: null }
const ouvintes = new Set<(estado: EstadoSync) => void>()

function definirEstado(parcial: Partial<EstadoSync>) {
  estadoAtual = { ...estadoAtual, ...parcial }
  ouvintes.forEach((ouvinte) => ouvinte(estadoAtual))
}

/** useSyncStatus() assina aqui pra atualizar o badge da UI. */
export function assinarEstadoSync(ouvinte: (estado: EstadoSync) => void): () => void {
  ouvintes.add(ouvinte)
  ouvinte(estadoAtual)
  return () => {
    ouvintes.delete(ouvinte)
  }
}

let emAndamento = false
let ultimoFimMs = 0

/**
 * Drena a fila local, um item de cada vez, em ordem. Chamada pelos três
 * gatilhos (primeiro plano, reconexão, puxar-pra-atualizar) -- todos
 * convergem aqui, nunca rodam a lógica de envio duas vezes em paralelo.
 */
export async function runSync(): Promise<void> {
  if (emAndamento) return
  if (Date.now() - ultimoFimMs < COOLDOWN_MS) return

  const rede = await NetInfo.fetch()
  if (!rede.isConnected) return

  emAndamento = true
  definirEstado({ sincronizando: true, ultimoErro: null })

  try {
    const itens = await listarPendentes()

    for (const item of itens) {
      const handler = buscarHandler(item.tipo)
      if (!handler) {
        // Tipo sem handler registrado não deveria acontecer em produção
        // (todo módulo se registra no boot do app) -- marca permanente
        // pra não ficar tentando pra sempre em vão.
        await marcarErro(item.id, `Nenhum handler para o tipo "${item.tipo}".`, true)
        continue
      }

      await marcarEnviando(item.id)

      try {
        const resultado = await handler.enviar(item.payload, {
          itemId: item.id,
          atualizarPayload: async (parcial) => {
            const mesclado = { ...(item.payload as object), ...parcial }
            item.payload = mesclado as typeof item.payload
            await atualizarPayload(item.id, mesclado)
          },
        })

        if (resultado.ok) {
          await marcarEnviado(item.id)
        } else {
          const excedeuTentativas = item.tentativas + 1 >= TENTATIVAS_MAX
          const permanente = !resultado.retentavel || excedeuTentativas
          await marcarErro(item.id, resultado.mensagem, permanente)
          definirEstado({ ultimoErro: resultado.mensagem })
        }
      } catch (e) {
        // enviar() não deveria lançar (o contrato pede um ResultadoEnvio),
        // mas se lançar mesmo assim trata como recuperável por padrão --
        // o teto de tentativas acima cuida de eventualmente parar sozinho.
        const mensagem = e instanceof Error ? e.message : String(e)
        const excedeuTentativas = item.tentativas + 1 >= TENTATIVAS_MAX
        await marcarErro(item.id, mensagem, excedeuTentativas)
        definirEstado({ ultimoErro: mensagem })
      }
      // Item travado não trava os outros -- segue pro próximo independente
      // do resultado deste.
    }
  } finally {
    emAndamento = false
    ultimoFimMs = Date.now()
    definirEstado({ sincronizando: false })
  }
}
