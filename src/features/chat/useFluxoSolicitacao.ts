import { useEffect, useRef, useState } from 'react'
import { capturarFoto } from '../../camera/capturarFoto'
import { obterLocalizacaoAtual, type LocalCapturado } from '../../lib/localizacao'
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

  // Dispara assim que o roteiro de abastecimento começa -- antes até do
  // veículo/KM serem escolhidos, não só depois da 1ª foto. Duas razões:
  // (1) dá tempo de sobra pra já estar resolvido quando chegar nas fotos
  // (o usuário ainda vai escolher veículo e digitar KM antes disso); (2)
  // principalmente, evita pedir permissão de localização logo depois que
  // a câmera fecha -- no Expo Go isso trava o diálogo do sistema pra
  // sempre (bug real visto em teste, tanto Android quanto iOS). Uma
  // chamada só, reaproveitada pelas 3 fotos: é o mesmo local no mesmo
  // minuto, não faz sentido buscar de novo a cada uma. `iniciada` (não só
  // o dependency array) evita disparar de novo no duplo-mount que o modo
  // de desenvolvimento do React faz de propósito (confirmado em teste:
  // sem essa guarda, obterLocalizacaoAtual() rodava 2x em paralelo).
  const localizacaoPromise = useRef<Promise<LocalCapturado | null> | null>(null)
  const localizacaoIniciada = useRef(false)
  useEffect(() => {
    if (categoria === 'ABASTECIMENTO' && !localizacaoIniciada.current) {
      localizacaoIniciada.current = true
      localizacaoPromise.current = obterLocalizacaoAtual()
    }
  }, [categoria])

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
    // offline-first, onde a foto pode subir horas depois. A localização
    // já foi disparada lá no início do roteiro (useEffect acima) -- aqui
    // só espera o que já estava em andamento, nunca inicia um pedido novo
    // logo depois da câmera fechar.
    const capturadaEm = new Date().toISOString()
    const local = await (localizacaoPromise.current ?? Promise.resolve(null))
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
    avancar,
    tirarFotoUnica,
    tirarFotoMultipla,
    enviarSolicitacao,
    voltar,
  }
}

export type FluxoSolicitacao = ReturnType<typeof useFluxoSolicitacao>
