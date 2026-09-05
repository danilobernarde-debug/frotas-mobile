import { scanFromURLAsync } from 'expo-camera'
import { useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useCapturaComLocal } from '../../camera/useCapturaComLocal'
import { identificarChavePix, limparChavePix, type TipoChavePix } from '../../lib/chavePix'
import { lerChavePix } from '../../lib/pixBrCode'
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
  /** Texto cru da chave, como entrou (digitado ou lido do QR). Tudo o
   *  mais -- máscara, tipo, avisos -- é derivado dele logo abaixo, então
   *  não há como o campo e o tipo saírem de sincronia. */
  const [textoChavePix, setTextoChavePix] = useState('')
  /** Só é preenchido quando o motorista usa a troca oferecida no caso
   *  ambíguo (11 dígitos que fecham como CPF e como celular). Volta a
   *  null assim que ele edita o campo -- a partir daí a detecção manda. */
  const [tipoForcadoChavePix, setTipoForcadoChavePix] = useState<TipoChavePix | null>(null)
  /** Como a chave atual chegou no campo -- só pra tela poder explicar
   *  ("lida do QR Code") ou avisar que o QR não trazia chave. Volta a
   *  'digitada' assim que o motorista edita o campo na mão. */
  const [origemChavePix, setOrigemChavePix] = useState<'digitada' | 'qr' | 'qr-dinamico' | 'qr-sem-chave'>(
    'digitada',
  )
  const [fotos, setFotos] = useState<FotoCapturada[]>([])
  const [enviando, setEnviando] = useState(false)
  const { capturando, capturar } = useCapturaComLocal()

  // Derivado, não guardado: o tipo sai do próprio texto a cada render.
  // identificarChavePix() é idempotente (reconhece tanto "12345678901"
  // quanto "123.456.789-01"), então reaplicar no valor já formatado dá
  // sempre o mesmo resultado.
  const chaveIdentificada = identificarChavePix(textoChavePix, tipoForcadoChavePix)

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
      if (!textoChavePix.trim()) {
        // Entra crua: identificarChavePix() já entende o "+55" que o BR
        // Code sempre grava no celular, então o tipo sai certo sozinho e
        // o campo mostra formatado no mesmo render.
        setTextoChavePix(resultado.chave)
        setTipoForcadoChavePix(null)
        setOrigemChavePix('qr')
      }
    } else if (resultado.tipo === 'dinamico') {
      // QR legítimo, mas de cobrança dinâmica: a chave não está nele.
      setOrigemChavePix('qr-dinamico')
    } else {
      setOrigemChavePix('qr-sem-chave')
    }
  }

  /** Digitar na mão sempre vence a leitura automática -- e desfaz também
   *  uma troca de tipo feita antes, porque o número mudou. */
  function alterarChavePix(valor: string) {
    setTextoChavePix(valor)
    setTipoForcadoChavePix(null)
    setOrigemChavePix('digitada')
  }

  /** Aceita a outra leitura possível dos mesmos dígitos, no único caso em
   *  que a detecção não tem como decidir sozinha (11 dígitos que fecham
   *  como CPF e como celular ao mesmo tempo). */
  function trocarTipoChavePix() {
    if (chaveIdentificada.alternativa) setTipoForcadoChavePix(chaveIdentificada.alternativa)
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
      valor: ehAbastecimento ? valorAbastecimento : paraNumero(valor),
      odometro: ehAbastecimento ? paraNumero(odometro) : null,
      motoristaId: perfil?.motorista_id ?? null,
      litros: ehAbastecimento ? paraNumero(litros) : null,
      precoLitro: ehAbastecimento ? paraNumero(precoLitro) : null,
      tipoCombustivel: ehAbastecimento ? tipoCombustivel : null,
      // Sem pontuação e com o "+55" do celular: é assim que a chave está
      // registrada no Banco Central. Mandar a versão formatada da tela
      // quebraria o pagamento do outro lado.
      chavePix: limparChavePix(chaveIdentificada.texto, chaveIdentificada.tipo) || null,
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

  // Só as fotos do problema (manutenção) -- a do PIX mora no mesmo
  // array, mas não conta como registro do problema nem aparece na lista
  // aberta da tela.
  const fotosProblema = fotos.filter((f) => f.tipoFoto === 'PROBLEMA')
  const fotoPix = fotos.find((f) => f.tipoFoto === 'PIX') ?? null

  const podeEnviar = Boolean(
    veiculo &&
      (categoria !== 'MANUTENÇÃO' || (descricao.trim() && fotosProblema.length > 0)) &&
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
    chavePix: chaveIdentificada.texto,
    tipoChavePix: chaveIdentificada.tipo,
    alternativaChavePix: chaveIdentificada.alternativa,
    chavePixSuspeita: chaveIdentificada.suspeita,
    origemChavePix,
    valorAbastecimento,
    fotos,
    fotosProblema,
    fotoPix,
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
    setChavePix: alterarChavePix,
    trocarTipoChavePix,
    tirarFotoSlot,
    removerFotoSlot,
    tirarFotoMultipla,
    substituirFotoMultipla,
    enviarSolicitacao,
  }
}

export type FormularioSolicitacao = ReturnType<typeof useFormularioSolicitacao>
