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

  // Dispara assim que o roteiro começa -- antes até do veículo ser
  // escolhido, não só depois da 1ª foto. Duas razões: (1) dá tempo de
  // sobra pra já estar resolvido quando chegar nas fotos (o usuário ainda
  // vai escolher veículo e preencher texto antes disso); (2)
  // principalmente, evita pedir permissão de localização logo depois que
  // a câmera fecha -- no Expo Go isso trava o diálogo do sistema pra
  // sempre (bug real visto em teste, tanto Android quanto iOS). Uma
  // chamada só, reaproveitada por todas as fotos do roteiro (fixas ou da
  // lista aberta): é o mesmo local no mesmo minuto, não faz sentido
  // buscar de novo a cada uma. `iniciada` (não só o dependency array)
  // evita disparar de novo no duplo-mount que o modo de desenvolvimento
  // do React faz de propósito (confirmado em teste: sem essa guarda,
  // obterLocalizacaoAtual() rodava 2x em paralelo).
  const localizacaoPromise = useRef<Promise<LocalCapturado | null> | null>(null)
  const localizacaoIniciada = useRef(false)
  useEffect(() => {
    if (!localizacaoIniciada.current) {
      localizacaoIniciada.current = true
      localizacaoPromise.current = obterLocalizacaoAtual()
    }
  }, [])

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

  /** Tira uma foto e já resolve a localização (que começou a buscar lá no
   *  início do roteiro -- aqui só espera o que já estava em andamento,
   *  nunca inicia um pedido novo logo depois da câmera fechar). Carimba
   *  no momento da captura, não do envio -- importa num app
   *  offline-first, onde a foto pode subir horas depois. Compartilhada
   *  pelos dois roteiros de foto (slots fixos e lista aberta) pra
   *  alimentar a marca d'água do lado do servidor do mesmo jeito nos
   *  dois. Null se o usuário cancelar a captura. */
  async function capturarFotoComLocal(): Promise<Omit<FotoCapturada, 'tipoFoto'> | null> {
    setCapturando(true)
    const uri = await capturarFoto()
    if (!uri) {
      setCapturando(false)
      return null
    }
    const capturadaEm = new Date().toISOString()
    const local = await (localizacaoPromise.current ?? Promise.resolve(null))
    setCapturando(false)
    return {
      uriLocal: uri,
      capturadaEm,
      latitude: local?.latitude,
      longitude: local?.longitude,
      localizacaoRotulo: local?.rotulo ?? undefined,
    }
  }

  /** Usada pelo passo fotos_abastecimento -- todas as fotos fixas ficam
   *  visíveis juntas (não mais uma pergunta por vez), então capturar uma
   *  não avança o passo sozinho; só substitui a foto daquele tipo,
   *  igual "tirar de novo" também faz. Quem avança é o botão de enviar
   *  do rodapé, quando os 3 tipos já tiverem foto (ver BarraEntrada). */
  async function tirarFotoSlot(tipoFoto: string) {
    const foto = await capturarFotoComLocal()
    if (!foto) return
    setFotos((atual) => [...atual.filter((f) => f.tipoFoto !== tipoFoto), { tipoFoto, ...foto }])
  }

  /** Usada pelo passo foto_multipla (manutenção) -- lista aberta, cada
   *  toque em "Tirar foto" soma mais uma. */
  async function tirarFotoMultipla() {
    const foto = await capturarFotoComLocal()
    if (!foto) return
    setFotos((atual) => [...atual, { tipoFoto: 'PROBLEMA', ...foto }])
  }

  /** "Tirar de novo" de uma foto específica já tirada na lista aberta --
   *  identifica qual pela uri local (não tem slot fixo pra identificar,
   *  diferente de tirarFotoSlot). */
  async function substituirFotoMultipla(uriLocalAntigo: string) {
    const foto = await capturarFotoComLocal()
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

  // slots exigidos do abastecimento (BOMBA/PLACA/KM) -- lidos do próprio
  // roteiro em vez de repetir a lista aqui, pra ter uma única fonte de
  // verdade (ver fluxo.ts).
  const slotsAbastecimento = passos.find((p) => p.tipo === 'fotos_abastecimento')?.slots ?? []
  const podeConfirmar = Boolean(
    veiculo &&
      (categoria !== 'MANUTENÇÃO' || (descricao.trim() && fotos.length > 0)) &&
      (categoria !== 'ABASTECIMENTO' ||
        (paraNumero(odometro) > 0 &&
          slotsAbastecimento.every((s) => fotos.some((f) => f.tipoFoto === s.tipoFoto)))),
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
    tirarFotoSlot,
    tirarFotoMultipla,
    substituirFotoMultipla,
    enviarSolicitacao,
    voltar,
  }
}

export type FluxoSolicitacao = ReturnType<typeof useFluxoSolicitacao>
