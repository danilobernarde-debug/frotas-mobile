import { useState } from 'react'
import { useAuth } from '../../auth/useAuth'
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
  const { perfil } = useAuth()
  const [veiculo, setVeiculo] = useState<Veiculo | null>(null)
  const [descricao, setDescricao] = useState('')
  const [odometro, setOdometro] = useState('')
  const [valor, setValor] = useState('')
  const [litros, setLitros] = useState('')
  const [precoLitro, setPrecoLitro] = useState('')
  const [tipoCombustivel, setTipoCombustivel] = useState('')
  const [fotos, setFotos] = useState<FotoCapturada[]>([])
  const [enviando, setEnviando] = useState(false)
  const { capturando, capturar } = useCapturaComLocal()

  // Só em ABASTECIMENTO: com litros e preço por litro exatos, pedir mais
  // um "valor estimado" digitado à parte só criaria divergência -- o
  // valor da solicitação nasce sempre desse cálculo.
  const valorAbastecimento = paraNumero(litros) * paraNumero(precoLitro)

  /** Completa a localização de uma foto já exibida na tela, quando (e se)
   *  o GPS terminar depois dela já ter sido mostrada -- ver capturar() em
   *  useCapturaComLocal. Casada por uri, não por índice/tipo: mais de uma
   *  foto pode estar com localização pendente ao mesmo tempo. */
  function completarLocal(uri: string, local: { latitude: number; longitude: number; rotulo: string | null } | null) {
    if (!local) return
    setFotos((atual) =>
      atual.map((f) =>
        f.uriLocal === uri
          ? { ...f, latitude: local.latitude, longitude: local.longitude, localizacaoRotulo: local.rotulo ?? undefined }
          : f,
      ),
    )
  }

  /** Uma das 3 fotos fixas do abastecimento -- tirar de novo substitui só
   *  a foto daquele tipo, as outras 2 continuam como estavam. */
  async function tirarFotoSlot(tipoFoto: string) {
    const foto = await capturar(completarLocal)
    if (!foto) return
    setFotos((atual) => [...atual.filter((f) => f.tipoFoto !== tipoFoto), { tipoFoto, ...foto }])
  }

  /** Lista aberta (manutenção) -- cada toque soma mais uma foto. */
  async function tirarFotoMultipla() {
    const foto = await capturar(completarLocal)
    if (!foto) return
    setFotos((atual) => [...atual, { tipoFoto: 'PROBLEMA', ...foto }])
  }

  /** "Tirar de novo" de uma foto específica já tirada na lista aberta --
   *  identifica qual pela uri local (não tem slot fixo pra identificar,
   *  diferente de tirarFotoSlot). */
  async function substituirFotoMultipla(uriLocalAntigo: string) {
    const foto = await capturar(completarLocal)
    if (!foto) return
    setFotos((atual) =>
      atual.map((f) => (f.uriLocal === uriLocalAntigo ? { tipoFoto: 'PROBLEMA', ...foto } : f)),
    )
  }

  async function enviarSolicitacao() {
    if (!veiculo) return
    setEnviando(true)
    const ehAbastecimento = categoria === 'ABASTECIMENTO'
    const payload: NovaSolicitacaoPayload = {
      veiculoId: veiculo.id,
      categoria,
      servico: ehAbastecimento ? 'Abastecimento' : descricao,
      valor: ehAbastecimento ? valorAbastecimento : paraNumero(valor),
      odometro: ehAbastecimento ? paraNumero(odometro) : null,
      motoristaId: perfil?.motorista_id ?? null,
      litros: ehAbastecimento ? paraNumero(litros) : null,
      precoLitro: ehAbastecimento ? paraNumero(precoLitro) : null,
      tipoCombustivel: ehAbastecimento ? tipoCombustivel : null,
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
          paraNumero(litros) > 0 &&
          paraNumero(precoLitro) > 0 &&
          tipoCombustivel !== '' &&
          SLOTS_ABASTECIMENTO.every((s) => fotos.some((f) => f.tipoFoto === s.tipoFoto)))),
  )

  return {
    categoria,
    motoristaNome: perfil?.motoristaNome ?? null,
    veiculo,
    descricao,
    odometro,
    valor,
    litros,
    precoLitro,
    tipoCombustivel,
    valorAbastecimento,
    fotos,
    capturando,
    enviando,
    podeEnviar,
    setVeiculo,
    setDescricao,
    setOdometro,
    setValor,
    setLitros,
    setPrecoLitro,
    setTipoCombustivel,
    tirarFotoSlot,
    tirarFotoMultipla,
    substituirFotoMultipla,
    enviarSolicitacao,
  }
}

export type FormularioSolicitacao = ReturnType<typeof useFormularioSolicitacao>
