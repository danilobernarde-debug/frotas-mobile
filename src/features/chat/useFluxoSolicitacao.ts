import { useState } from 'react'
import { capturarFoto } from '../../camera/capturarFoto'
import { obterLocalizacaoAtual } from '../../lib/localizacao'
import type { CategoriaSolicitacao, Veiculo } from '../../lib/tipos'
import { TIPO_NOVA_SOLICITACAO, type FotoPayload, type NovaSolicitacaoPayload } from '../../outbox/handlers/novaSolicitacao'
import { enfileirar } from '../../outbox/outbox'
import { runSync } from '../../outbox/syncEngine'
import { obterFluxo } from './fluxo'

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
 * Estado do roteiro guiado (abastecimento/manutenção), compartilhado entre
 * a área de conteúdo (veículo, fotos, resumo) e a barra de entrada estilo
 * WhatsApp no rodapé do chat -- os dois desenham a partir do mesmo passo
 * atual, então precisam do mesmo hook, não de cópias separadas de estado.
 */
export function useFluxoSolicitacao(categoria: CategoriaSolicitacao) {
  const passos = obterFluxo(categoria)
  const [passoAtual, setPassoAtual] = useState(0)
  const [veiculo, setVeiculo] = useState<Veiculo | null>(null)
  const [descricao, setDescricao] = useState('')
  const [odometro, setOdometro] = useState('')
  const [valor, setValor] = useState('')
  const [fotos, setFotos] = useState<FotoCapturada[]>([])
  const [capturando, setCapturando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const passo = passos[passoAtual]

  function avancar() {
    setPassoAtual((p) => Math.min(p + 1, passos.length - 1))
  }

  function voltar() {
    setPassoAtual((p) => Math.max(p - 1, 0))
  }

  function escolherVeiculo(v: Veiculo) {
    setVeiculo(v)
    avancar()
  }

  /** Usada pelo passo 'texto' (descrição), 'km' e 'valor' -- a barra de
   *  entrada chama isto ao tocar no ícone de enviar. */
  function enviarTexto(digitado: string) {
    if (passo.tipo === 'texto') {
      if (!digitado.trim()) return // descrição é obrigatória, não avança em branco
      setDescricao(digitado.trim())
      avancar()
    } else if (passo.tipo === 'km') {
      // obrigatório, diferente de 'valor' -- é o dado que a feature existe pra coletar
      if (!digitado.trim() || paraNumero(digitado) <= 0) return
      setOdometro(digitado)
      avancar()
    } else if (passo.tipo === 'valor') {
      setValor(digitado) // opcional -- avança mesmo em branco
      avancar()
    }
  }

  async function tirarFotoUnica() {
    if (passo.tipo !== 'foto_unica' || !passo.tipoFoto) return
    setCapturando(true)
    const uri = await capturarFoto()
    if (!uri) {
      setCapturando(false)
      return
    }
    // Carimba no momento da captura, não do envio -- importa num app
    // offline-first, onde a foto pode subir horas depois. Só chama
    // obterLocalizacaoAtual() (pode levar alguns segundos) depois de
    // confirmar que o usuário não cancelou a foto, pra não pagar a
    // espera do GPS à toa.
    const capturadaEm = new Date().toISOString()
    const local = await obterLocalizacaoAtual()
    setCapturando(false)
    const tipoFoto = passo.tipoFoto
    setFotos((atual) => [
      ...atual.filter((f) => f.tipoFoto !== tipoFoto),
      {
        tipoFoto,
        uriLocal: uri,
        capturadaEm,
        latitude: local?.latitude,
        longitude: local?.longitude,
        localizacaoRotulo: local?.rotulo ?? undefined,
      },
    ])
    avancar()
  }

  async function tirarFotoMultipla() {
    setCapturando(true)
    const uri = await capturarFoto()
    setCapturando(false)
    if (!uri) return
    setFotos((atual) => [...atual, { tipoFoto: 'PROBLEMA', uriLocal: uri }])
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

  const podeConfirmar = Boolean(
    veiculo &&
      (categoria !== 'MANUTENÇÃO' || (descricao.trim() && fotos.length > 0)) &&
      (categoria !== 'ABASTECIMENTO' || paraNumero(odometro) > 0),
  )

  return {
    categoria,
    passos,
    passo,
    passoAtual,
    veiculo,
    descricao,
    odometro,
    valor,
    fotos,
    capturando,
    enviando,
    podeConfirmar,
    escolherVeiculo,
    enviarTexto,
    tirarFotoUnica,
    tirarFotoMultipla,
    enviarSolicitacao,
    voltar,
  }
}

export type FluxoSolicitacao = ReturnType<typeof useFluxoSolicitacao>
