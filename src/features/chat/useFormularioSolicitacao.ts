import { useState } from 'react'
import { useCapturaComLocal } from '../../camera/useCapturaComLocal'
import type { CategoriaSolicitacao, Veiculo } from '../../lib/tipos'
import { TIPO_NOVA_SOLICITACAO, type FotoPayload, type NovaSolicitacaoPayload } from '../../outbox/handlers/novaSolicitacao'
import { enfileirar } from '../../outbox/outbox'
import { runSync } from '../../outbox/syncEngine'
import { SLOTS_ABASTECIMENTO } from './fluxo'

interface FotoCapturada {
  tipoFoto: string
  uriLocal: string
  capturadaEm?: string
  latitude?: number
  longitude?: number
  localizacaoRotulo?: string
}

function paraNumero(texto: string): number {
  const limpo = texto.trim()
  if (!limpo) return 0
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : 0
}

/**
 * Estado do formulário de nova solicitação (abastecimento/manutenção) --
 * tela cheia estilo "criar enquete" do WhatsApp, todos os campos visíveis
 * de uma vez, sem passo a passo. Compartilhado entre app/(app)/nova-
 * solicitacao.tsx e nada mais -- ao contrário do roteiro guiado anterior,
 * não precisa ser reaproveitado por uma barra de entrada contextual.
 */
export function useFormularioSolicitacao(categoria: CategoriaSolicitacao) {
  const [veiculo, setVeiculo] = useState<Veiculo | null>(null)
  const [descricao, setDescricao] = useState('')
  const [odometro, setOdometro] = useState('')
  const [valor, setValor] = useState('')
  const [fotos, setFotos] = useState<FotoCapturada[]>([])
  const [enviando, setEnviando] = useState(false)
  const { capturando, capturar } = useCapturaComLocal()

  /** Uma das 3 fotos fixas do abastecimento -- tirar de novo substitui só
   *  a foto daquele tipo, as outras 2 continuam como estavam. */
  async function tirarFotoSlot(tipoFoto: string) {
    const foto = await capturar()
    if (!foto) return
    setFotos((atual) => [...atual.filter((f) => f.tipoFoto !== tipoFoto), { tipoFoto, ...foto }])
  }

  /** Lista aberta (manutenção) -- cada toque soma mais uma foto. */
  async function tirarFotoMultipla() {
    const foto = await capturar()
    if (!foto) return
    setFotos((atual) => [...atual, { tipoFoto: 'PROBLEMA', ...foto }])
  }

  /** "Tirar de novo" de uma foto específica já tirada na lista aberta --
   *  identifica qual pela uri local (não tem slot fixo pra identificar,
   *  diferente de tirarFotoSlot). */
  async function substituirFotoMultipla(uriLocalAntigo: string) {
    const foto = await capturar()
    if (!foto) return
    setFotos((atual) =>
      atual.map((f) => (f.uriLocal === uriLocalAntigo ? { tipoFoto: 'PROBLEMA', ...foto } : f)),
    )
  }

  async function enviarSolicitacao() {
    if (!veiculo) return
    setEnviando(true)
    const payload: NovaSolicitacaoPayload = {
      veiculoId: veiculo.id,
      categoria,
      servico: categoria === 'ABASTECIMENTO' ? 'Abastecimento' : descricao,
      valor: paraNumero(valor),
      odometro: categoria === 'ABASTECIMENTO' ? paraNumero(odometro) : null,
      fotos: fotos.map<FotoPayload>((f) => ({
        uriLocal: f.uriLocal,
        tipo: f.tipoFoto,
        status: 'pendente',
        capturadaEm: f.capturadaEm,
        latitude: f.latitude,
        longitude: f.longitude,
        localizacaoRotulo: f.localizacaoRotulo,
      })),
    }
    await enfileirar(TIPO_NOVA_SOLICITACAO, payload)
    runSync()
    setEnviando(false)
  }

  const podeEnviar = Boolean(
    veiculo &&
      (categoria !== 'MANUTENÇÃO' || (descricao.trim() && fotos.length > 0)) &&
      (categoria !== 'ABASTECIMENTO' ||
        (paraNumero(odometro) > 0 &&
          SLOTS_ABASTECIMENTO.every((s) => fotos.some((f) => f.tipoFoto === s.tipoFoto)))),
  )

  return {
    categoria,
    veiculo,
    descricao,
    odometro,
    valor,
    fotos,
    capturando,
    enviando,
    podeEnviar,
    setVeiculo,
    setDescricao,
    setOdometro,
    setValor,
    tirarFotoSlot,
    tirarFotoMultipla,
    substituirFotoMultipla,
    enviarSolicitacao,
  }
}

export type FormularioSolicitacao = ReturnType<typeof useFormularioSolicitacao>
