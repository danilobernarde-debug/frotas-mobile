import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { scanFromURLAsync } from 'expo-camera'
import { useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useCapturaComLocal } from '../../camera/useCapturaComLocal'
import { useChavePix } from '../pix/useChavePix'
import { lerChavePix } from '../../lib/pixBrCode'
import type { CategoriaSolicitacao, Veiculo } from '../../lib/tipos'
import { TIPO_NOVA_SOLICITACAO, type FotoPayload, type NovaSolicitacaoPayload } from '../../outbox/handlers/novaSolicitacao'
import { enfileirar } from '../../outbox/outbox'
import { runSync } from '../../outbox/syncEngine'
import { SLOTS_ABASTECIMENTO } from './fluxo'

interface FotoCapturada {
  tipoFoto: string
  uriLocal: string
  /** Só na observação em áudio -- foto sobe como image/jpeg. */
  nomeArquivo?: string
  mime?: string
  duracaoSegundos?: number
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
  /** Mesmo campo usado na tela da solicitação já enviada (onde a chave
   *  pode ser completada depois) -- ver useChavePix. */
  const chavePix = useChavePix()
  /** Como a chave atual chegou no campo -- só pra tela poder explicar
   *  ("lida do QR Code") ou avisar que o QR não trazia chave. Volta a
   *  'digitada' assim que o motorista edita o campo na mão. */
  const [origemChavePix, setOrigemChavePix] = useState<'digitada' | 'qr' | 'qr-dinamico' | 'qr-sem-chave'>(
    'digitada',
  )
  /** Observação escrita -- no abastecimento é onde o motorista explica
   *  quanto precisa, já que o formulário não pede mais número nenhum. */
  const [observacao, setObservacao] = useState('')
  /** Observação falada: mais rápida que digitar de dentro do carro, e
   *  costuma explicar melhor ("tô na reserva, vou pra fazenda e volto
   *  amanhã") do que um campo de texto que ninguém preenche. Mesmo
   *  gravador da barra do chat (BarraEntrada), que já resolveu permissão,
   *  modo de áudio e o mimetype certo do m4a. */
  const gravador = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const estadoGravador = useAudioRecorderState(gravador, 200)
  const [erroAudio, setErroAudio] = useState<string | null>(null)
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

  async function gravarObservacao() {
    setErroAudio(null)
    const permissao = await requestRecordingPermissionsAsync()
    if (!permissao.granted) {
      setErroAudio('Sem permissão de microfone -- confira nas configurações do aparelho.')
      return
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await gravador.prepareToRecordAsync()
      gravador.record()
    } catch {
      setErroAudio('Não consegui começar a gravação -- tenta de novo.')
    }
  }

  /** O áudio entra na MESMA lista das fotos: o envio da solicitação já
   *  sobe essa lista inteira como anexo, com repetição e retomada
   *  resolvidas. Um caminho separado só pro áudio duplicaria isso. */
  async function pararObservacao() {
    const segundos = Math.round(estadoGravador.durationMillis / 1000)
    await gravador.stop()
    const uri = gravador.uri
    // Toque sem querer no botão não vira anexo de meio segundo.
    if (!uri || segundos < 1) return
    setFotos((atual) => [
      ...atual.filter((f) => f.tipoFoto !== 'OBSERVACAO'),
      {
        tipoFoto: 'OBSERVACAO',
        uriLocal: uri,
        nomeArquivo: `observacao-${Date.now()}.m4a`,
        // audio/mp4, não audio/m4a: o segundo não é mimetype IANA e o
        // player do iOS recusa carregar com ele (ver BarraEntrada).
        mime: 'audio/mp4',
        duracaoSegundos: segundos,
      },
    ])
  }

  function removerObservacaoAudio() {
    setFotos((atual) => atual.filter((f) => f.tipoFoto !== 'OBSERVACAO'))
  }

  /** Uma das 3 fotos fixas do abastecimento -- tirar de novo substitui só
   *  a foto daquele tipo, as outras 2 continuam como estavam. */
  // Motorista/placa já disponíveis aqui (mesmos dados que a prévia
  // pós-captura sempre mostrou) -- passados pra câmera pra desenhar a
  // faixa da marca d'água ao vivo, no visor, antes de tirar a foto.
  const marcaDagua = { nomeMotorista: perfil?.motoristaNome, placa: veiculo?.placa }

  async function tirarFotoSlot(tipoFoto: string) {
    const ehPix = tipoFoto === 'PIX'
    // A foto do PIX sai sem a faixa da marca d'água (nem no visor, nem
    // carimbada no servidor -- ver TIPOS_COM_MARCA_DAGUA na rota de
    // anexos): ela existe pra ser LIDA, chave ou QR code, e tanto a
    // barra do rodapé quanto o QR que o carimbo desenha no canto
    // atrapalhariam justamente isso.
    //
    // Só ela também abre a câmera com o leitor de QR ligado: a foto
    // dispara sozinha quando o código entra no visor.
    const foto = await capturar(completarLocal, ehPix ? undefined : marcaDagua, { lerQrCode: ehPix })
    if (!foto) return
    // codigoQr fica fora do que é guardado: é dado de leitura, não da
    // foto -- vira chave logo abaixo e não precisa acompanhar o anexo.
    const { codigoQr, ...dadosFoto } = foto
    setFotos((atual) => [...atual.filter((f) => f.tipoFoto !== tipoFoto), { tipoFoto, ...dadosFoto }])
    if (ehPix) await preencherChaveDoQr(dadosFoto.uriLocal, codigoQr)
  }

  /**
   * Preenche a chave a partir do QR Code, por dois caminhos, nesta ordem:
   *
   *   1. `codigoDoVisor` -- o leitor da própria câmera já reconheceu o
   *      código ao vivo, antes da foto existir. É o caminho normal e o
   *      confiável: o visor fica tentando quadro a quadro até acertar o
   *      foco, então praticamente não erra.
   *   2. relendo a imagem salva -- só quando o visor não pegou nada (o
   *      motorista apertou o botão antes do leitor travar no código).
   *      Foto de tela de celular tem reflexo e desfoque, então aqui a
   *      chance de sucesso é bem menor; serve de rede, não de plano A.
   *
   * Nunca falha o fluxo: se não houver QR, se for QR de outra coisa, ou
   * se o leitor der erro, a foto continua anexada e o campo continua como
   * estava -- é conveniência, não etapa obrigatória.
   *
   * Só preenche quando o campo está vazio. Se o motorista já digitou algo,
   * o que ele escreveu vale mais do que o que a máquina leu -- sobrescrever
   * seria trocar um dado conferido por um adivinhado, e aqui o dado é pra
   * onde o dinheiro vai.
   */
  async function preencherChaveDoQr(uri: string, codigoDoVisor?: string | null) {
    let conteudo = codigoDoVisor ?? undefined
    if (!conteudo) {
      try {
        const encontrados = await scanFromURLAsync(uri, ['qr'])
        conteudo = encontrados[0]?.data
      } catch {
        return // leitor não conseguiu abrir a imagem -- segue sem avisar nada
      }
    }
    if (!conteudo) return

    const resultado = lerChavePix(conteudo)
    if (resultado.tipo === 'chave') {
      // QR dá a chave em dado digital, não em leitura de imagem -- não há
      // risco de trocar dígito, diferente de tentar ler texto de uma foto.
      if (!chavePix.texto.trim()) {
        // Entra crua: identificarChavePix() já entende o "+55" que o BR
        // Code sempre grava no celular, então o tipo sai certo sozinho e
        // o campo mostra formatado no mesmo render.
        chavePix.definir(resultado.chave)
        setOrigemChavePix('qr')
      }
    } else if (resultado.tipo === 'dinamico') {
      // QR legítimo, mas de cobrança dinâmica: a chave não está nele.
      setOrigemChavePix('qr-dinamico')
    } else {
      setOrigemChavePix('qr-sem-chave')
    }
  }

  /** Digitar na mão sempre vence a leitura automática. */
  function alterarChavePix(valor: string) {
    chavePix.alterar(valor)
    setOrigemChavePix('digitada')
  }

  /** Remove uma foto de slot fixo já tirada (hoje só a do PIX, que é
   *  opcional -- as 3 do abastecimento são obrigatórias, lá só faz
   *  sentido "tirar de novo"). */
  function removerFotoSlot(tipoFoto: string) {
    setFotos((atual) => atual.filter((f) => f.tipoFoto !== tipoFoto))
    // Tirar a foto do PIX apaga também o aviso que veio da leitura dela.
    if (tipoFoto === 'PIX') setOrigemChavePix('digitada')
  }

  /** Lista aberta (manutenção) -- cada toque soma mais uma foto. */
  async function tirarFotoMultipla() {
    const foto = await capturar(completarLocal, marcaDagua)
    if (!foto) return
    setFotos((atual) => [...atual, { tipoFoto: 'PROBLEMA', ...foto }])
  }

  /** "Tirar de novo" de uma foto específica já tirada na lista aberta --
   *  identifica qual pela uri local (não tem slot fixo pra identificar,
   *  diferente de tirarFotoSlot). */
  async function substituirFotoMultipla(uriLocalAntigo: string) {
    const foto = await capturar(completarLocal, marcaDagua)
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
      // Abastecimento nasce sem valor: quanto pode gastar é o gestor quem
      // responde na aprovação, e quanto foi de fato só se sabe na bomba.
      valor: ehAbastecimento ? 0 : paraNumero(valor),
      odometro: null,
      motoristaId: perfil?.motorista_id ?? null,
      litros: null,
      precoLitro: null,
      tipoCombustivel: null,
      // Sem pontuação e com o "+55" do celular: é assim que a chave está
      // registrada no Banco Central. Mandar a versão formatada da tela
      // quebraria o pagamento do outro lado.
      chavePix: chavePix.paraGravar() || null,
      justificativa: observacao.trim() || null,
      fotos: fotos.map<FotoPayload>((f) => ({
        uriLocal: f.uriLocal,
        tipo: f.tipoFoto,
        status: 'pendente',
        nomeArquivo: f.nomeArquivo,
        mime: f.mime,
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

  // Só as fotos do problema (manutenção) -- a do PIX mora no mesmo
  // array, mas não conta como registro do problema nem aparece na lista
  // aberta da tela.
  const fotosProblema = fotos.filter((f) => f.tipoFoto === 'PROBLEMA')
  const fotoPix = fotos.find((f) => f.tipoFoto === 'PIX') ?? null
  const audioObservacao = fotos.find((f) => f.tipoFoto === 'OBSERVACAO') ?? null

  // ABASTECIMENTO pede só o veículo. Antes exigia litros, preço, KM e as
  // 3 fotos -- dados que só existem DEPOIS de abastecer, o que fazia da
  // "solicitação" um lançamento do que já tinha acontecido. Quem pede
  // ainda não sabe quanto vai pôr: é justamente isso que o gestor
  // responde ao aprovar. O resto é preenchido na tela da solicitação,
  // depois da bomba.
  const podeEnviar = Boolean(
    veiculo && (categoria !== 'MANUTENÇÃO' || (descricao.trim() && fotosProblema.length > 0)),
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
    // O campo inteiro (texto, tipo, abas, avisos) num objeto só -- é o
    // que <CampoChavePix> consome.
    chavePix: { ...chavePix, alterar: alterarChavePix },
    origemChavePix,
    valorAbastecimento,
    fotos,
    fotosProblema,
    fotoPix,
    observacao,
    setObservacao,
    audioObservacao,
    gravandoObservacao: estadoGravador.isRecording,
    segundosGravados: Math.round(estadoGravador.durationMillis / 1000),
    erroAudio,
    gravarObservacao,
    pararObservacao,
    removerObservacaoAudio,
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
    removerFotoSlot,
    tirarFotoMultipla,
    substituirFotoMultipla,
    enviarSolicitacao,
  }
}

export type FormularioSolicitacao = ReturnType<typeof useFormularioSolicitacao>
