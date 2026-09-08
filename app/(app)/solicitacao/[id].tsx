import { Ionicons } from '@expo/vector-icons'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  // Clipboard: saiu do núcleo do RN mas ainda funciona (só avisa de
  // depreciação) -- mesma escolha já feita no chat, pra não somar
  // expo-clipboard, que é módulo nativo e exigiria recompilar o app.
  Clipboard,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../../src/auth/useAuth'
import { capturarFoto, capturarFotoComQr, removerFotoLocal } from '../../../src/camera/capturarFoto'
import { escolherImagemChat } from '../../../src/camera/escolherImagemChat'
import { CampoChavePix } from '../../../src/features/pix/CampoChavePix'
import { formatarChaveGravada } from '../../../src/lib/chavePix'
import { useChavePix } from '../../../src/features/pix/useChavePix'
import { data as fmtData, moeda } from '../../../src/lib/formato'
import { lerChavePix } from '../../../src/lib/pixBrCode'
import { enviarAnexo, removerAnexo, urlAnexo } from '../../../src/lib/api'
import { supabase } from '../../../src/lib/supabase'
import { SLOTS_ABASTECIMENTO } from '../../../src/features/chat/fluxo'
import { BarraTeclado, ID_BARRA_TECLADO } from '../../../src/ui/BarraTeclado'
import { TIPOS_COMBUSTIVEL, type AnexoAprovacao, type Aprovacao, type TipoAnexo } from '../../../src/lib/tipos'

/** Aceita vírgula decimal, como o teclado brasileiro oferece. */
function paraNumero(texto: string): number {
  const limpo = texto.trim()
  if (!limpo) return 0
  const n = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo)
  return Number.isFinite(n) ? n : 0
}

const ROTULO_STATUS: Record<string, string> = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado ✅',
  REPROVADO: 'Reprovado ❌',
}

const ROTULO_STATUS_PAGAMENTO: Record<string, string> = {
  'NÃO SE APLICA': 'Sem pagamento previsto',
  'AGD PAGAMENTO': 'Aguardando pagamento',
  PAGO: 'Pago ✅',
}

const ROTULO_FOTO: Record<string, string> = {
  BOMBA: 'Bomba de combustível',
  PLACA: 'Placa do veículo',
  KM: 'KM do veículo',
  PROBLEMA: 'Foto do problema',
  OUTRO: 'Foto',
  PIX: 'Chave / QR do PIX',
  COMPROVANTE: 'Comprovante',
  'NOTA FISCAL': 'Nota fiscal',
}

/** Anexos que o ciclo de pagamento tem seção própria pra mostrar -- o
 *  resto (BOMBA/PLACA/KM/PROBLEMA/OUTRO/ORCAMENTO) cai na galeria geral
 *  "Fotos", como sempre foi. */
const TIPOS_PAGAMENTO: TipoAnexo[] = ['PIX', 'COMPROVANTE', 'NOTA FISCAL']

/** Anexos que NÃO são imagem -- ficam fora da galeria, que baixa cada
 *  item como foto pra exibir. Hoje só o recado em áudio. */
const TIPOS_NAO_IMAGEM: TipoAnexo[] = ['OBSERVACAO']

/** <Image source={{ uri, headers }}> não manda o header Authorization de
 *  forma confiável (achado em teste real: um fetch() com o mesmo token
 *  pra mesma URL funciona -- 200, image/jpeg -- mas o Image nunca
 *  carrega). Baixa os bytes na mão e converte pra data URI, que o Image
 *  exibe sem precisar de nenhum header. */
async function baixarComoDataUri(url: string, token: string): Promise<string> {
  const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!resposta.ok) throw new Error(`Falha ao buscar foto (status ${resposta.status}).`)
  const blob = await resposta.blob()
  return await new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(leitor.result as string)
    leitor.onerror = () => reject(new Error('Falha ao ler a foto.'))
    leitor.readAsDataURL(blob)
  })
}

export default function TelaDetalheSolicitacao() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { perfil } = useAuth()
  const [aprovacao, setAprovacao] = useState<Aprovacao | null>(null)
  const [anexos, setAnexos] = useState<AnexoAprovacao[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [fotosDataUri, setFotosDataUri] = useState<Record<number, string>>({})
  const [fotoAmpliada, setFotoAmpliada] = useState<number | null>(null)
  const [decidindo, setDecidindo] = useState(false)
  /** Qual anexo está subindo agora (null = nenhum) -- também serve pra
   *  desabilitar o botão daquela seção sem travar a outra. */
  const [enviando, setEnviando] = useState<TipoAnexo | null>(null)
  /** Formulário da chave PIX aberto (o motorista tocou em "Informar
   *  chave PIX"). Fechado por padrão: quem já mandou a chave na criação
   *  não precisa ver campo nenhum aqui. */
  /** Painel de aprovação aberto (o ADMIN tocou em "Aprovar") -- é onde
   *  ele informa quanto o motorista pode abastecer. */
  const [aprovando, setAprovando] = useState(false)
  const [limiteEm, setLimiteEm] = useState<'VALOR' | 'LITROS'>('VALOR')
  const [limiteTexto, setLimiteTexto] = useState('')
  /** Formulário de conclusão do abastecimento (depois da bomba). */
  const [litros, setLitros] = useState('')
  /**
   * Quanto foi PAGO, não o preço por litro.
   *
   * O motorista sabe de cor o que pagou -- é o valor que ele vai pedir no
   * PIX. O preço por litro é o número pequeno da bomba, o que menos se
   * olha e o que mais sai errado; e errar ali multiplica o erro pelo
   * número de litros. Aqui ele é CALCULADO (pago ÷ litros), com as 4
   * casas que a coluna preco_litro comporta.
   */
  const [valorPago, setValorPago] = useState('')
  const [tipoCombustivel, setTipoCombustivel] = useState('')
  const [odometro, setOdometro] = useState('')
  const [salvandoDados, setSalvandoDados] = useState(false)
  /** Aberto à mão -- só pra reabrir o formulário depois de já ter
   *  salvado. Enquanto os dados não existem ele aparece sozinho. */
  const [corrigindoAbastecimento, setCorrigindoAbastecimento] = useState(false)
  const [editandoPix, setEditandoPix] = useState(false)
  const [salvandoPix, setSalvandoPix] = useState(false)
  /** Vira ✓ por alguns segundos depois de copiar -- sem isso não há como
   *  saber que o toque fez alguma coisa. */
  const [chaveCopiada, setChaveCopiada] = useState(false)
  const chave = useChavePix()

  const ehMinha = Boolean(perfil?.id && aprovacao?.solicitante_id === perfil.id)
  const ehGestao = perfil?.papel === 'ADMIN' || perfil?.papel === 'GESTOR'
  // O ciclo de pagamento só abre depois do "sim" -- antes disso não há o
  // que pagar nem nota pra cobrar.
  const aprovada = aprovacao?.status === 'APROVADO'
  const comprovantes = anexos.filter((a) => a.tipo === 'COMPROVANTE')
  const observacaoAudio = anexos.find((a) => a.tipo === 'OBSERVACAO') ?? null
  const fotosPix = anexos.filter((a) => a.tipo === 'PIX')
  /**
   * Quem pediu pode completar a chave depois de enviar -- ela costuma
   * chegar depois da solicitação (o frentista foi buscar o QR, o dono não
   * estava). Trava depois de pago: com o dinheiro já enviado, trocar a
   * chave não muda o pagamento e só faria o comprovante não bater com o
   * que aparece na tela. Mesmo recorte da policy no banco
   * (0039_motorista_edita_chave_pix.sql) -- a tela não é a garantia, é a
   * cortesia de não oferecer um caminho que o banco recusaria.
   */
  const podeInformarPix = ehMinha && aprovacao?.status_pagamento !== 'PAGO'
  /** Os números já vieram do motorista -- é o que separa "preencher" de
   *  "corrigir". */
  const abastecimentoPreenchido = aprovacao?.litros != null && aprovacao.preco_litro != null
  /**
   * Quem preenche é o motorista: ele é quem esteve na bomba e viu o
   * painel. A gestão entra só DEPOIS, e só pra corrigir o que ele mandou
   * errado -- deixar os dois preencherem do zero convidava a gestão a
   * digitar por cima de quem tinha o dado na frente.
   *
   * Trava depois de pago, mesma razão da chave PIX: os números que
   * justificaram o valor não mudam depois do dinheiro sair.
   */
  const podeCompletarAbastecimento =
    aprovacao?.categoria === 'ABASTECIMENTO' &&
    aprovada &&
    aprovacao.status_pagamento !== 'PAGO' &&
    (ehMinha || (ehGestao && abastecimentoPreenchido))
  /**
   * Formulário só fica na tela enquanto tem o que preencher. Depois de
   * salvo ele fecha e os números aparecem na ficha acima -- deixar o
   * formulário aberto sugeria que faltava fazer algo, e ainda escondia o
   * resultado atrás dos próprios campos.
   */
  const mostrarFormAbastecimento =
    podeCompletarAbastecimento && (corrigindoAbastecimento || !abastecimentoPreenchido)
  /**
   * A chave é passo do formulário só no PREENCHIMENTO -- ali ela não
   * existe ainda e faz parte da mesma ida ao posto. Na CORREÇÃO ela já
   * está na ficha, e mostrá-la de novo como campo repetiria na tela algo
   * que está dois dedos acima. Lá a edição fica no próprio quadro que
   * exibe a chave.
   */
  const pixNoFormulario = mostrarFormAbastecimento && ehMinha && !abastecimentoPreenchido
  /** A ação de informar/editar a chave mora no quadro do PIX, EXCETO
   *  quando ela é passo do formulário aberto -- aí seriam dois campos
   *  pedindo a mesma chave na mesma tela. */
  const editarPixNoQuadro = podeInformarPix && !pixNoFormulario
  const litrosNum = paraNumero(litros)
  const totalAbastecimento = paraNumero(valorPago)
  const precoPorLitro = litrosNum > 0 ? totalAbastecimento / litrosNum : 0
  /** O que ainda falta pra poder salvar -- vira o texto do botão, pra
   *  ninguém tocar e ficar sem saber por que não aconteceu nada. */
  const faltaNoAbastecimento = [
    !tipoCombustivel && 'combustível',
    litrosNum <= 0 && 'litros',
    totalAbastecimento <= 0 && 'valor total',
  ].filter(Boolean) as string[]

  /** Câmera própria do app ou galeria, devolvendo só o uri do arquivo
   *  local. Comprovante e nota fiscal são documentos pra LER, então a
   *  câmera vai sem contexto de marca d'água (nenhuma faixa por cima) --
   *  mesma razão da foto do PIX, ver tirarFotoSlot em
   *  useFormularioSolicitacao. */
  async function escolherArquivo(fonte: 'camera' | 'galeria'): Promise<string | null> {
    if (fonte === 'camera') return await capturarFoto()

    const resultado = await escolherImagemChat('galeria')
    if (!resultado.ok) {
      if (resultado.motivo === 'permissao') {
        Alert.alert('Sem permissão', 'Libere o acesso às fotos nas configurações do aparelho.')
      } else if (resultado.motivo === 'travado') {
        Alert.alert('Não consegui abrir a galeria', 'Tenta de novo em alguns segundos.')
      }
      return null
    }
    if (resultado.midia.categoria !== 'IMAGEM') {
      Alert.alert('Envie uma foto', 'Vídeo não serve como comprovante nem como nota fiscal.')
      return null
    }
    return resultado.midia.uri
  }

  /**
   * Sobe direto (await no upload), sem passar pela fila do outbox: esta
   * tela já depende de rede pra existir -- ela busca a solicitação e as
   * fotos do servidor a cada abertura, não tem versão offline. Enfileirar
   * aqui só adiaria o envio sem o usuário poder acompanhar, e ainda
   * esbarraria no cooldown de 8s do runSync.
   */
  async function anexar(tipo: TipoAnexo, fonte: 'camera' | 'galeria') {
    const uri = await escolherArquivo(fonte)
    if (!uri) return
    await anexarUri(tipo, uri)
  }

  /** A parte do envio que já tem o arquivo em mãos -- separada porque a
   *  leitura do QR do PIX chega aqui com a foto já tirada pela câmera,
   *  sem passar por escolherArquivo(). */
  async function anexarUri(tipo: TipoAnexo, uri: string) {
    if (!aprovacao) return

    setEnviando(tipo)
    try {
      const { data: sessao } = await supabase.auth.getSession()
      const tokenAtual = sessao.session?.access_token
      if (!tokenAtual) throw new Error('Sessão expirada -- entre de novo no app.')

      const anexo = await enviarAnexo({
        alvo: 'aprovacoes',
        idPai: aprovacao.id,
        uriArquivo: uri,
        tipo,
        tokenAcesso: tokenAtual,
      })
      removerFotoLocal(uri)
      setToken(tokenAtual)
      setAnexos((atual) => [
        ...atual,
        {
          id: anexo.id,
          aprovacao_id: aprovacao.id,
          tipo,
          caminho: anexo.caminho,
          legenda: anexo.legenda,
          criado_em: anexo.criado_em,
        },
      ])

      // Anexar o comprovante É o ato de pagar -- não faz sentido pedir
      // um segundo toque em "marcar como pago" logo depois. Só ADMIN:
      // trg_aprovacoes_aa_permissao rejeita a mudança de qualquer outro
      // papel, então nem tenta pra GESTOR (o anexo dele fica registrado
      // e o ADMIN confirma o pagamento depois).
      if (tipo === 'COMPROVANTE' && perfil?.papel === 'ADMIN' && aprovacao.status_pagamento !== 'PAGO') {
        const { error } = await supabase
          .from('frota_aprovacoes')
          .update({ status_pagamento: 'PAGO' })
          .eq('id', aprovacao.id)
        if (!error) setAprovacao((a) => (a ? { ...a, status_pagamento: 'PAGO' } : a))
      }
    } catch (e) {
      Alert.alert('Não consegui enviar', e instanceof Error ? e.message : 'Tenta de novo em alguns segundos.')
    } finally {
      setEnviando(null)
    }
  }

  /**
   * Abre a câmera com o leitor de QR ligado: a foto dispara sozinha
   * quando o código entra no visor, a chave vem junto já lida e a foto
   * fica anexada como prova (tipo PIX), igual acontece na criação da
   * solicitação.
   *
   * A chave preenche o campo mas NÃO salva sozinha -- o motorista ainda
   * confere e toca em "Salvar". É pra onde o dinheiro vai; gravar sem
   * ninguém olhar seria trocar uma conferência por um automatismo.
   */
  async function lerQrDoPix() {
    const captura = await capturarFotoComQr()
    if (!captura) return

    if (captura.codigoQr) {
      const resultado = lerChavePix(captura.codigoQr)
      if (resultado.tipo === 'chave') {
        chave.definir(resultado.chave)
      } else if (resultado.tipo === 'dinamico') {
        Alert.alert('QR de cobrança', 'Esse QR Code não contém a chave. Digite a chave no campo.')
      }
    } else {
      Alert.alert('Não achei QR Code', 'A foto foi anexada. Digite a chave no campo.')
    }

    // A foto vai junto de qualquer jeito: mesmo sem QR legível ela é o
    // registro que quem paga confere contra a chave digitada.
    await anexarUri('PIX', captura.uriLocal)
  }

  /** Trocar a foto da chave: apaga a atual pra próxima não chegar em
   *  quem paga junto com a errada, sem dizer qual vale. */
  async function apagarAnexo(anexoId: number) {
    const { data: sessao } = await supabase.auth.getSession()
    const tokenAtual = sessao.session?.access_token
    if (!tokenAtual) {
      Alert.alert('Sessão expirada', 'Entre de novo no app.')
      return
    }
    setEnviando('PIX')
    try {
      await removerAnexo({ alvo: 'aprovacoes', anexoId, tokenAcesso: tokenAtual })
      setAnexos((atual) => atual.filter((a) => a.id !== anexoId))
    } catch (e) {
      Alert.alert('Não consegui remover', e instanceof Error ? e.message : 'Tenta de novo.')
    } finally {
      setEnviando(null)
    }
  }

  function confirmarApagarAnexo(anexoId: number) {
    // Apagar é irreversível e o alvo é uma miniatura pequena, fácil de
    // tocar sem querer -- por isso confirma.
    Alert.alert('Remover esta foto?', 'A foto sai da solicitação.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => apagarAnexo(anexoId) },
    ])
  }

  function copiarChave() {
    if (!aprovacao?.chave_pix) return
    // Copia a forma CANÔNICA (a gravada), não a formatada da tela: é a
    // que está registrada no Banco Central, e é ela que o aplicativo do
    // banco aceita sem discussão -- celular, por exemplo, vai com o +55
    // que a máscara esconde.
    Clipboard.setString(aprovacao.chave_pix)
    setChaveCopiada(true)
    setTimeout(() => setChaveCopiada(false), 2500)
  }

  async function salvarChavePix() {
    if (!aprovacao) return
    setSalvandoPix(true)
    // Grava a versão limpa (sem pontuação, celular com +55) -- é como a
    // chave está registrada no Banco Central; a formatada da tela
    // quebraria o pagamento do outro lado.
    const valor = chave.paraGravar() || null
    const { error } = await supabase
      .from('frota_aprovacoes')
      .update({ chave_pix: valor })
      .eq('id', aprovacao.id)
    setSalvandoPix(false)
    if (error) {
      Alert.alert('Não consegui salvar', error.message)
      return
    }
    setAprovacao((a) => (a ? { ...a, chave_pix: valor } : a))
    setEditandoPix(false)
  }

  /** Alert nativo em vez de um Modal de escolha: esta tela já tem o Modal
   *  da foto ampliada, e dois Modal do RN abertos juntos travam o iOS. */
  function perguntarFonte(tipo: TipoAnexo, titulo: string) {
    Alert.alert(titulo, 'De onde vem o arquivo?', [
      { text: 'Tirar foto', onPress: () => anexar(tipo, 'camera') },
      { text: 'Escolher da galeria', onPress: () => anexar(tipo, 'galeria') },
      { text: 'Cancelar', style: 'cancel' },
    ])
  }

  // GESTOR até enxerga esta tela (RLS deixa ver qualquer solicitação da
  // regional), mas só ADMIN decide de verdade -- uma trigger no banco
  // (trg_aprovacoes_aa_permissao) bloqueia a mudança de status pra
  // qualquer outro papel, mesmo que a UPDATE passe pela RLS. Esconder o
  // botão pra GESTOR evita um toque que sempre falharia. Mesmo gate do
  // painel web (`ehAdmin` em PainelDecisao).
  async function decidir(novoStatus: 'APROVADO' | 'REPROVADO') {
    if (!aprovacao) return
    setDecidindo(true)
    // Update direto, igual o Server Action decidirAprovacao do painel web
    // faz -- é só isso mesmo, o resto (quem decidiu, quando, status de
    // pagamento inicial) é trigger no banco (0001_schema.sql:628-650).
    // O limite acompanha só a aprovação, e só se foi informado: aprovar
    // sem preencher nada continua valendo ("pode abastecer, sem teto"), e
    // é como fica toda solicitação anterior a este campo existir.
    const limite = paraNumero(limiteTexto)
    const campos: Record<string, unknown> = { status: novoStatus }
    if (novoStatus === 'APROVADO' && limite > 0) {
      campos.autorizado_valor = limiteEm === 'VALOR' ? limite : null
      campos.autorizado_litros = limiteEm === 'LITROS' ? limite : null
    }

    const { error } = await supabase.from('frota_aprovacoes').update(campos).eq('id', aprovacao.id)
    setDecidindo(false)
    if (error) {
      // A mensagem do banco, não um "tenta de novo": nem todo erro aqui
      // passa com o tempo. Coluna que falta, permissão negada e regra de
      // trigger nunca melhoram esperando, e mandar esperar esconde a
      // única informação que diz o que fazer (achado em teste real: o
      // app pedia pra tentar de novo enquanto faltava uma migration).
      Alert.alert('Não consegui salvar', error.message)
      return
    }
    setAprovacao({ ...aprovacao, ...campos, status: novoStatus } as Aprovacao)
    setAprovando(false)
    setLimiteTexto('')
  }

  /**
   * Conclusão do abastecimento: o que só se sabe depois da bomba.
   *
   * `valor` vai junto porque é litros x preço -- sem isso a solicitação
   * mostraria um total que não bate com os próprios números. É também o
   * salvamento que faz o lançamento em frota_abastecimentos acontecer: a
   * trigger da 0041 dispara quando a linha fica completa, não na
   * aprovação (que aqui vem antes dos dados existirem).
   */
  async function salvarDadosAbastecimento() {
    if (!aprovacao) return
    setSalvandoDados(true)
    const dados = {
      // A chave só entra quando ela é passo DESTE formulário. Na correção
      // ela é editada no próprio quadro que a exibe, e mandá-la aqui
      // significaria reescrever por cima de um campo que este salvamento
      // nem mostrou.
      ...(pixNoFormulario ? { chave_pix: chave.paraGravar() || null } : {}),
      litros: litrosNum || null,
      // Derivado do que foi pago. 4 casas é o que a coluna guarda, e é
      // precisão de sobra: o erro no total volta em menos de um centavo
      // mesmo num tanque de caminhão.
      preco_litro: precoPorLitro > 0 ? Number(precoPorLitro.toFixed(4)) : null,
      tipo_combustivel: tipoCombustivel || null,
      odometro: paraNumero(odometro) || null,
      valor: totalAbastecimento,
    }
    const { error } = await supabase.from('frota_aprovacoes').update(dados).eq('id', aprovacao.id)
    setSalvandoDados(false)
    if (error) {
      Alert.alert('Não consegui salvar', error.message)
      return
    }
    setAprovacao((a) => (a ? ({ ...a, ...dados } as Aprovacao) : a))
    // Fecha o formulário e fica na solicitação, sem sair da tela. Antes
    // saltava pro chat, o que atrapalhava justamente a correção: quem
    // conserta um número quer conferir se ficou certo, e era jogado pra
    // fora antes de ver o resultado. Fechado o formulário, os valores
    // salvos aparecem na ficha logo acima -- e sair continua sendo a
    // seta de voltar, como em qualquer outra tela.
    setCorrigindoAbastecimento(false)
  }

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      const [{ data: sessao }, respostaAprovacao, respostaAnexos] = await Promise.all([
        supabase.auth.getSession(),
        supabase
          .from('frota_aprovacoes')
          .select('*, veiculo:frota_veiculos(id, placa, modelo)')
          .eq('id', Number(id))
          .maybeSingle(),
        supabase.from('frota_aprovacao_anexos').select('*').eq('aprovacao_id', Number(id)).order('id'),
      ])
      if (cancelado) return
      setToken(sessao.session?.access_token ?? null)
      const carregada = (respostaAprovacao.data as Aprovacao) ?? null
      setAprovacao(carregada)
      // Campos já preenchidos voltam pro formulário -- corrigir um preço
      // digitado errado não pode obrigar a redigitar o resto.
      if (carregada) {
        setLitros(carregada.litros != null ? String(carregada.litros) : '')
        setValorPago(carregada.valor > 0 ? String(carregada.valor) : '')
        setTipoCombustivel(carregada.tipo_combustivel ?? '')
        setOdometro(carregada.odometro != null ? String(carregada.odometro) : '')
        if (carregada.chave_pix) chave.definir(carregada.chave_pix)
      }
      setAnexos((respostaAnexos.data as AnexoAprovacao[]) ?? [])
      setCarregando(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [id])

  // Roda só depois que anexos/token já chegaram -- busca cada foto por
  // fora do Image (ver baixarComoDataUri) e guarda o resultado por id,
  // pra cada uma aparecer assim que estiver pronta em vez de esperar
  // todas juntas.
  useEffect(() => {
    if (anexos.length === 0 || !token) return
    let cancelado = false
    for (const a of anexos) {
      // Áudio não é imagem: baixar como data URI só gastaria rede pra
      // alimentar um <Image> que nunca vai renderizar.
      if (TIPOS_NAO_IMAGEM.includes(a.tipo)) continue
      // Já baixado numa passada anterior -- a lista cresce quando um
      // comprovante/nota é anexado aqui mesmo, e sem esta guarda o efeito
      // rebaixaria todas as fotos antigas junto com a nova.
      if (fotosDataUri[a.id]) continue
      baixarComoDataUri(urlAnexo('aprovacoes', a.id), token)
        .then((dataUri) => {
          if (!cancelado) setFotosDataUri((atual) => ({ ...atual, [a.id]: dataUri }))
        })
        .catch(() => {
          // best-effort -- essa foto fica com o placeholder cinza, resto segue normal
        })
    }
    return () => {
      cancelado = true
    }
    // fotosDataUri de propósito FORA das dependências: ele é lido só como
    // "o que já tenho" e é escrito dentro do próprio efeito -- incluí-lo
    // faria o efeito se redisparar a cada foto que chega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anexos, token])

  return (
    <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
      {/* Cabeçalho próprio (não o nativo do Stack) -- mesma razão das
          outras telas desde a Fase H: o nativo não respeita a área
          segura no Android em modo edge-to-edge, o que deixava o botão
          de voltar sobreposto pela barra de status e, na prática,
          difícil de tocar direito (achado em teste real). */}
      <View style={styles.cabecalho}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.botaoVoltar}>
          <Text style={styles.iconeVoltar}>←</Text>
        </Pressable>
        <Text style={styles.tituloCabecalho}>Solicitação</Text>
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator />
        </View>
      ) : !aprovacao ? (
        <View style={styles.centro}>
          <Text style={styles.textoVazio}>Solicitação não encontrada.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.tela}
          contentContainerStyle={styles.conteudo}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.status}>
            {ROTULO_STATUS[aprovacao.status]}
            {aprovada && aprovacao.status_pagamento !== 'NÃO SE APLICA'
              ? `  ·  ${ROTULO_STATUS_PAGAMENTO[aprovacao.status_pagamento]}`
              : ''}
          </Text>
          <Text style={styles.servico}>{aprovacao.servico}</Text>

          {/* Trajeto junto do recado: os dois existem pela mesma razão --
              dar contexto pra quem decide o teto. */}
          {aprovacao.trajeto && aprovacao.trajeto.length > 0 && (
            <View style={styles.blocoObservacao}>
              <Text style={styles.rotuloPix}>Trajeto</Text>
              <Text style={styles.textoObservacao}>
                {aprovacao.trajeto.map((p) => `${p.cidade}/${p.uf}`).join('  →  ')}
              </Text>
              {/* Só aparece se o servidor já calculou -- o app não pede
                  rota a ninguém: o motorista pode estar sem sinal, e o
                  número é pra quem decide o teto. */}
              {aprovacao.distancia_km != null && (
                <Text style={styles.distancia}>
                  {aprovacao.distancia_km.toLocaleString('pt-BR')} km
                </Text>
              )}
            </View>
          )}

          {/* O recado do motorista fica no topo: é o que explica o
              pedido, e quem abre esta tela abre pra decidir. */}
          {(aprovacao.justificativa || observacaoAudio) && (
            <View style={styles.blocoObservacao}>
              <Text style={styles.rotuloPix}>Observação do motorista</Text>
              {aprovacao.justificativa && (
                <Text style={styles.textoObservacao}>{aprovacao.justificativa}</Text>
              )}
              {observacaoAudio && token && (
                <PlayerObservacao
                  url={`${urlAnexo('aprovacoes', observacaoAudio.id)}&token=${encodeURIComponent(token)}`}
                />
              )}
            </View>
          )}

          {/* O rótulo "Pago" na linha de status é discreto demais pra uma
              notícia que o motorista está esperando -- e a seção do
              comprovante fica lá embaixo, depois de fotos e valores.
              Este aviso põe o fato onde ele é visto primeiro. */}
          {comprovantes.length > 0 && (
            <View style={styles.avisoPago}>
              <Text style={styles.avisoPagoTitulo}>✅ Pagamento confirmado</Text>
            </View>
          )}

          {perfil?.papel === 'ADMIN' && aprovacao.status === 'PENDENTE' && !aprovando && (
            <View style={styles.decisao}>
              <Pressable
                onPress={() => decidir('REPROVADO')}
                disabled={decidindo}
                style={[styles.botaoDecisao, styles.botaoReprovar, decidindo && styles.botaoDesabilitado]}
              >
                <Text style={styles.botaoDecisaoTexto}>Reprovar</Text>
              </Pressable>
              <Pressable
                // No abastecimento, aprovar é responder QUANTO -- abre o
                // painel em vez de decidir na hora. Nas outras categorias
                // não há teto a informar, então aprova direto.
                onPress={() =>
                  aprovacao.categoria === 'ABASTECIMENTO' ? setAprovando(true) : decidir('APROVADO')
                }
                disabled={decidindo}
                style={[styles.botaoDecisao, styles.botaoAprovar, decidindo && styles.botaoDesabilitado]}
              >
                {decidindo ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.botaoDecisaoTexto}>Aprovar</Text>}
              </Pressable>
            </View>
          )}

          {/* Painel inline, não um Modal: esta tela já tem o Modal da foto
              ampliada, e dois Modal do RN abertos juntos travam o iOS. */}
          {aprovando && (
            <View style={styles.painelLimite}>
              <Text style={styles.painelTitulo}>Quanto ele pode abastecer?</Text>
              <View style={styles.linhaChips}>
                {(['VALOR', 'LITROS'] as const).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setLimiteEm(t)}
                    style={[styles.chip, limiteEm === t && styles.chipAtivo]}
                  >
                    <Text style={[styles.chipTexto, limiteEm === t && styles.chipTextoAtivo]}>
                      {t === 'VALOR' ? 'Em reais' : 'Em litros'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.campo}
                value={limiteTexto}
                onChangeText={setLimiteTexto}
                keyboardType="decimal-pad"
                inputAccessoryViewID={ID_BARRA_TECLADO}
                placeholder={limiteEm === 'VALOR' ? 'R$ 300,00' : '40 litros'}
                placeholderTextColor="#94a3b8"
              />
              <Text style={styles.dicaPix}>
                Deixe em branco para aprovar sem limite.
              </Text>
              <View style={styles.acoesPix}>
                <Pressable onPress={() => setAprovando(false)} hitSlop={8} disabled={decidindo}>
                  <Text style={styles.linkPixFraco}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={() => decidir('APROVADO')}
                  disabled={decidindo}
                  style={[styles.botaoSalvarPix, decidindo && styles.botaoDesabilitado]}
                >
                  {decidindo ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.botaoPixTexto}>Aprovar</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          {/* O teto autorizado é a resposta que o motorista foi buscar --
              fica em destaque, não numa linha da ficha. */}
          {aprovada && (aprovacao.autorizado_valor != null || aprovacao.autorizado_litros != null) && (
            <View style={styles.avisoAutorizado}>
              <Text style={styles.avisoAutorizadoTitulo}>
                {aprovacao.autorizado_valor != null
                  ? `Autorizado até ${moeda(aprovacao.autorizado_valor)}`
                  : `Autorizado até ${aprovacao.autorizado_litros?.toLocaleString('pt-BR')} litros`}
              </Text>
            </View>
          )}

          <View style={styles.linha}>
            <Text style={styles.rotulo}>Placa</Text>
            <Text style={styles.valor}>{aprovacao.veiculo?.placa ?? '—'}</Text>
          </View>
          <View style={styles.linha}>
            <Text style={styles.rotulo}>Data</Text>
            <Text style={styles.valor}>{fmtData(aprovacao.data)}</Text>
          </View>
          {aprovacao.odometro != null && (
            <View style={styles.linha}>
              <Text style={styles.rotulo}>KM Atual</Text>
              <Text style={styles.valor}>{aprovacao.odometro.toLocaleString('pt-BR')}</Text>
            </View>
          )}
          {aprovacao.tipo_combustivel != null && (
            <View style={styles.linha}>
              <Text style={styles.rotulo}>Combustível</Text>
              <Text style={styles.valor}>{aprovacao.tipo_combustivel}</Text>
            </View>
          )}
          {aprovacao.litros != null && (
            <View style={styles.linha}>
              <Text style={styles.rotulo}>Litros</Text>
              <Text style={styles.valor}>{aprovacao.litros.toLocaleString('pt-BR')} L</Text>
            </View>
          )}
          {aprovacao.preco_litro != null && (
            <View style={styles.linha}>
              <Text style={styles.rotulo}>Preço por litro</Text>
              <Text style={styles.valor}>{moeda(aprovacao.preco_litro)}</Text>
            </View>
          )}
          {aprovacao.valor > 0 && (
            <View style={styles.linha}>
              <Text style={styles.rotulo}>Total</Text>
              <Text style={styles.valor}>{moeda(aprovacao.valor)}</Text>
            </View>
          )}

          {mostrarFormAbastecimento && (
            <View style={styles.painelLimite}>
              <Text style={styles.painelTitulo}>
                {ehMinha ? 'Depois de abastecer' : 'Corrigir dados do abastecimento'}
              </Text>

              {/* Numerado e em forma de pergunta: quem preenche está em
                  pé na bomba, com pressa, e pergunta pede menos
                  interpretação que um substantivo solto. As linhas de
                  ajuda que existiam aqui saíram a pedido do usuário --
                  carregavam a tela; a orientação ficou no exemplo dentro
                  do próprio campo, que só aparece enquanto está vazio. */}
              {/* KM primeiro: é o número que se lê ao chegar, antes de
                  encostar na bomba -- pedir depois obrigava a voltar ao
                  painel do carro com a mangueira já guardada. */}
              <Text style={styles.passo}>1. KM do painel</Text>
              <TextInput
                style={styles.campo}
                value={odometro}
                onChangeText={setOdometro}
                keyboardType="decimal-pad"
                inputAccessoryViewID={ID_BARRA_TECLADO}
                placeholder="Ex.: 128500 km"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.passo}>2. Qual combustível?</Text>
              <View style={styles.linhaChips}>
                {TIPOS_COMBUSTIVEL.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setTipoCombustivel(c)}
                    style={[styles.chip, tipoCombustivel === c && styles.chipAtivo]}
                  >
                    <Text style={[styles.chipTexto, tipoCombustivel === c && styles.chipTextoAtivo]}>{c}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.passo}>3. Quantos litros?</Text>
              <TextInput
                style={styles.campo}
                value={litros}
                onChangeText={setLitros}
                keyboardType="decimal-pad"
                inputAccessoryViewID={ID_BARRA_TECLADO}
                placeholder="Ex.: 40,5 litros"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.passo}>4. Valor total</Text>
              <TextInput
                style={styles.campo}
                value={valorPago}
                onChangeText={setValorPago}
                keyboardType="decimal-pad"
                inputAccessoryViewID={ID_BARRA_TECLADO}
                placeholder="Ex.: R$ 250,00"
                placeholderTextColor="#94a3b8"
              />

              {/* Devolvido na hora, pra ele conferir contra a bomba sem
                  precisar digitar: se o preço por litro sair estranho, um
                  dos dois números acima está errado. */}
              {precoPorLitro > 0 && (
                <Text style={styles.contaFeita}>
                  Deu {moeda(precoPorLitro)} por litro
                </Text>
              )}


              {/* O teto vira comparação, não aviso solto: ao lado do que
                  ele acabou de digitar é onde a conta importa. */}
              {aprovacao.autorizado_valor != null && totalAbastecimento > 0 && (
                <Text
                  style={
                    totalAbastecimento > aprovacao.autorizado_valor
                      ? styles.avisoLimite
                      : styles.dentroDoLimite
                  }
                >
                  {totalAbastecimento > aprovacao.autorizado_valor
                    ? `Passou do autorizado (${moeda(aprovacao.autorizado_valor)}). Pode enviar assim mesmo, mas avise a gestão.`
                    : `Dentro do autorizado (${moeda(aprovacao.autorizado_valor)}).`}
                </Text>
              )}
              {aprovacao.autorizado_litros != null && litrosNum > aprovacao.autorizado_litros && (
                <Text style={styles.avisoLimite}>
                  Passou do autorizado ({aprovacao.autorizado_litros.toLocaleString('pt-BR')} litros).
                  Pode enviar assim mesmo, mas avise a gestão.
                </Text>
              )}

              {/* Foto da bomba, do hodômetro e da placa só o motorista
                  manda: elas são o registro de quem esteve lá, e não há o
                  que a gestão "corrija" numa foto de um posto onde não
                  esteve -- refazer, só voltando à bomba. */}
              {ehMinha && (
                <>
                  <Text style={styles.passo}>5. Tire as 3 fotos</Text>
                  {SLOTS_ABASTECIMENTO.map((slot) => {
                    const anexo = anexos.find((a) => a.tipo === slot.tipoFoto)
                    const subindo = enviando === slot.tipoFoto
                    // Miniatura, e não só um "✓": ele confere que
                    // fotografou a coisa certa sem precisar abrir nada --
                    // foto trocada entre hodômetro e placa só apareceria
                    // pra quem paga, dias depois.
                    const miniatura = anexo ? fotosDataUri[anexo.id] : undefined
                    return (
                      <Pressable
                        key={slot.tipoFoto}
                        onPress={() => perguntarFonte(slot.tipoFoto as TipoAnexo, slot.rotulo)}
                        disabled={subindo}
                        style={[styles.linhaFoto, anexo && styles.linhaFotoPronta]}
                      >
                        {miniatura ? (
                          <Image source={{ uri: miniatura }} style={styles.miniaturaFoto} />
                        ) : (
                          <View style={styles.miniaturaVazia}>
                            <Text style={styles.miniaturaVaziaTexto}>{anexo ? '✓' : '📷'}</Text>
                          </View>
                        )}
                        <View style={styles.linhaFotoTextos}>
                          <Text style={styles.linhaFotoTitulo}>{slot.rotulo}</Text>
                          <Text style={anexo ? styles.linhaFotoOk : styles.linhaFotoPendente}>
                            {subindo ? 'Enviando…' : anexo ? 'Enviada — toque para trocar' : 'Toque para tirar'}
                          </Text>
                        </View>
                        {subindo && <ActivityIndicator color="#0d9488" size="small" />}
                      </Pressable>
                    )
                  })}
                </>
              )}

              {/* PIX dentro do formulário: é a mesma ida ao posto, e ter
                  dois quadros separados fazia parecer duas tarefas -- com
                  dois botões de salvar, e um deles fácil de esquecer. */}
              {pixNoFormulario && (
                <>
                  <Text style={styles.passo}>6. Chave PIX de quem recebe</Text>
                  <CampoChavePix chave={chave} aoLerQr={lerQrDoPix} lendoQr={enviando === 'PIX'} />
                </>
              )}
            </View>
          )}

          {/* Fechado depois de salvo: os números já aparecem na ficha
              acima, e quem precisar ajustar reabre aqui. */}
          {podeCompletarAbastecimento && !mostrarFormAbastecimento && (
            <Pressable onPress={() => setCorrigindoAbastecimento(true)} hitSlop={8}>
              <Text style={styles.linkPix}>Corrigir dados do abastecimento</Text>
            </Pressable>
          )}

          {/* Quadro avulso do PIX só onde não existe o formulário de
              abastecimento (manutenção, ou solicitação já paga). No
              abastecimento a chave é o passo 5 lá dentro -- dois lugares
              pra corrigir a mesma coisa, cada um com seu botão de salvar,
              era o que confundia. */}
          {/* Um quadro só pro PIX: a chave, a foto dela e a ação. Eram
              três lugares -- texto num bloco, foto numa seção lá embaixo,
              e um bloco à parte quando não havia chave -- e a conferência
              que quem paga faz é justamente comparar chave e foto. */}
          {(aprovacao.chave_pix || fotosPix.length > 0 || editarPixNoQuadro) && !editandoPix && (
            <View style={styles.blocoPix}>
              <Text style={styles.rotuloPix}>
                {aprovacao.chave_pix ? 'Chave PIX informada pelo motorista' : 'Chave PIX'}
              </Text>
              {/* selectable: quem paga precisa copiar a chave (toque
                  longo -> Copiar). Não usa área de transferência via
                  código de propósito -- expo-clipboard é módulo nativo e
                  exigiria recompilar o app só por isso. */}
              {/* Formatada pra leitura. O banco guarda a forma canônica
                  (sem pontuação, celular com +55), que é ótima pra pagar
                  e ruim pra conferir -- e conferir é o que quem paga faz
                  antes de mandar o dinheiro. O mesmo módulo que aplica a
                  máscara na digitação reconhece o valor gravado, então as
                  duas telas mostram a chave igual. */}
              {aprovacao.chave_pix ? (
                <>
                  <View style={styles.linhaChavePix}>
                    <Text style={styles.chavePix} selectable>
                      {formatarChaveGravada(aprovacao.chave_pix)}
                    </Text>
                    <Pressable onPress={copiarChave} hitSlop={12} style={styles.botaoCopiar}>
                      <Ionicons
                        name={chaveCopiada ? 'checkmark' : 'copy-outline'}
                        size={22}
                        color={chaveCopiada ? '#047857' : '#0d9488'}
                      />
                    </Pressable>
                  </View>
                  <Text style={styles.dicaPix}>
                    {chaveCopiada ? 'Chave copiada.' : 'Toque no ícone para copiar.'}
                  </Text>
                </>
              ) : (
                <Text style={styles.dicaPix}>
                  Ainda não informada. Sem ela a gestão não tem para onde pagar.
                </Text>
              )}

              {/* A foto da chave/QR fica no MESMO quadro do texto: quem
                  paga confere um contra o outro, e ter os dois em seções
                  separadas obrigava a rolar pra frente e pra trás pra
                  fazer a única conferência que importa aqui. */}
              <AreaFotoPix fotos={fotosPix} fotosDataUri={fotosDataUri} aoAbrir={setFotoAmpliada} />

              {editarPixNoQuadro && (
                <Pressable
                  onPress={() => {
                    chave.definir(aprovacao.chave_pix ?? '')
                    setEditandoPix(true)
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.linkPix}>
                    {aprovacao.chave_pix ? 'Editar chave PIX' : 'Informar chave PIX'}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Sem chave e ainda dá pra informar: a chave costuma chegar
              DEPOIS da solicitação -- o frentista foi buscar o QR, o dono
              não estava, o sinal caiu na hora de digitar. Antes disso a
              única saída era pedir pra gestão digitar por ele. */}
          {editandoPix && (
            <View style={styles.blocoPix}>
              <Text style={styles.rotuloPix}>Chave PIX do recebedor</Text>
              <CampoChavePix chave={chave} aoLerQr={lerQrDoPix} lendoQr={enviando === 'PIX'} />
              <AreaFotoPix
                fotos={fotosPix}
                fotosDataUri={fotosDataUri}
                aoAbrir={setFotoAmpliada}
                // Só na edição: o ícone de QR do campo lê o código, este
                // aqui é pra fotografar a chave que veio escrita num
                // papel, ou pra pegar da galeria.
                aoAdicionar={() => perguntarFonte('PIX', 'Chave / QR do PIX')}
                aoRemover={confirmarApagarAnexo}
                enviando={enviando === 'PIX'}
              />
              <View style={styles.acoesPix}>
                <Pressable onPress={() => setEditandoPix(false)} hitSlop={8} disabled={salvandoPix}>
                  <Text style={styles.linkPixFraco}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={salvarChavePix}
                  disabled={salvandoPix}
                  style={[styles.botaoSalvarPix, salvandoPix && styles.botaoDesabilitado]}
                >
                  {salvandoPix ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.botaoPixTexto}>Salvar chave</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          <SecaoAnexos
            titulo="Fotos"
            anexos={anexos.filter(
              (a) => !TIPOS_PAGAMENTO.includes(a.tipo) && !TIPOS_NAO_IMAGEM.includes(a.tipo),
            )}
            fotosDataUri={fotosDataUri}
            aoAbrir={setFotoAmpliada}
          />

          <SecaoAnexos
            titulo="Comprovante de pagamento"
            vazio="Nenhum comprovante enviado ainda."
            anexos={anexos.filter((a) => a.tipo === 'COMPROVANTE')}
            fotosDataUri={fotosDataUri}
            aoAbrir={setFotoAmpliada}
            oculta={!aprovada}
            // Quem paga é a gestão -- o motorista só acompanha.
            textoBotao={ehGestao ? 'Enviar comprovante' : undefined}
            enviando={enviando === 'COMPROVANTE'}
            aoEnviar={() => perguntarFonte('COMPROVANTE', 'Comprovante de pagamento')}
          />

          <SecaoAnexos
            titulo="Nota fiscal"
            vazio="Nenhuma nota fiscal enviada ainda."
            anexos={anexos.filter((a) => a.tipo === 'NOTA FISCAL')}
            fotosDataUri={fotosDataUri}
            aoAbrir={setFotoAmpliada}
            oculta={!aprovada}
            // O motorista é quem recebe a nota na mão, no posto/oficina --
            // a gestão também pode anexar (às vezes chega por e-mail).
            textoBotao={ehMinha || ehGestao ? 'Enviar nota fiscal' : undefined}
            enviando={enviando === 'NOTA FISCAL'}
            aoEnviar={() => perguntarFonte('NOTA FISCAL', 'Nota fiscal')}
          />
        </ScrollView>
      )}

      {/* Barra fixa, como na tela de criação: dentro do formulário o
          botão já era o último, mas depois dele ainda vêm PIX, galeria,
          comprovante e nota fiscal -- ele acabava no meio da tela e quem
          rolava pra ver as fotos perdia o botão de vista. Aqui ele está
          sempre à mão, e é o mesmo lugar onde o motorista já aprendeu a
          achar o botão verde que envia. */}
      {mostrarFormAbastecimento && (
        <View style={styles.rodapeSalvar}>
          <Pressable
            onPress={salvarDadosAbastecimento}
            disabled={salvandoDados || faltaNoAbastecimento.length > 0}
            style={[
              styles.botaoSalvarRodape,
              (salvandoDados || faltaNoAbastecimento.length > 0) && styles.botaoDesabilitado,
            ]}
          >
            {salvandoDados ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.botaoPixTexto}>
                {faltaNoAbastecimento.length > 0
                  ? `Falta preencher: ${faltaNoAbastecimento.join(', ')}`
                  : ehMinha
                    ? 'Salvar e enviar para a gestão'
                    : 'Salvar correção'}
              </Text>
            )}
          </Pressable>
        </View>
      )}

      <BarraTeclado />

      <Modal
        visible={fotoAmpliada !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFotoAmpliada(null)}
      >
        <Pressable style={styles.fundoModal} onPress={() => setFotoAmpliada(null)}>
          {fotoAmpliada !== null && fotosDataUri[fotoAmpliada] && (
            <Image
              source={{ uri: fotosDataUri[fotoAmpliada] }}
              style={styles.fotoAmpliada}
              resizeMode="contain"
            />
          )}
        </Pressable>
        <SafeAreaView style={styles.areaSeguraModal} edges={['top']} pointerEvents="box-none">
          <Pressable style={styles.botaoFecharModal} onPress={() => setFotoAmpliada(null)} hitSlop={12}>
            <Text style={styles.botaoFecharModalTexto}>✕</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

/**
 * Um grupo de anexos da solicitação (fotos da situação, PIX, comprovante,
 * nota fiscal) -- mesma grade das fotos de sempre, mais um botão de envio
 * opcional. Vive aqui e não em src/ porque nada além desta tela mostra
 * anexo de aprovação hoje; se aparecer um segundo lugar, aí sim vale
 * mudar de casa.
 */
function SecaoAnexos({
  titulo,
  vazio,
  anexos,
  fotosDataUri,
  aoAbrir,
  oculta = false,
  textoBotao,
  enviando = false,
  aoEnviar,
}: {
  titulo: string
  /** Texto quando não há nenhum anexo. Sem ele, a seção some quando vazia
   *  (caso da galeria geral "Fotos": não é um passo pendente). */
  vazio?: string
  anexos: AnexoAprovacao[]
  fotosDataUri: Record<number, string>
  aoAbrir: (id: number) => void
  oculta?: boolean
  /** Ausente = este usuário não pode anexar aqui, só ver. */
  textoBotao?: string
  enviando?: boolean
  aoEnviar?: () => void
}) {
  if (oculta) return null
  if (anexos.length === 0 && !vazio) return null

  return (
    <>
      <Text style={styles.tituloFotos}>{titulo}</Text>
      {anexos.length === 0 ? (
        <Text style={styles.textoVazioSecao}>{vazio}</Text>
      ) : (
        <View style={styles.grade}>
          {anexos.map((a) => (
            <View key={a.id} style={styles.fotoCartao}>
              {fotosDataUri[a.id] ? (
                // A miniatura corta em quadrado (cover) -- numa foto
                // retrato, a marca d'água (BOMBA/PLACA/KM) fica no
                // rodapé da imagem inteira e quase some no corte
                // (achado em teste real). Toque abre a foto completa,
                // sem cortar nada.
                <Pressable onPress={() => aoAbrir(a.id)}>
                  <Image source={{ uri: fotosDataUri[a.id] }} style={styles.foto} resizeMode="cover" />
                </Pressable>
              ) : (
                <View style={[styles.foto, styles.fotoCarregando]}>
                  <ActivityIndicator size="small" />
                </View>
              )}
              <Text style={styles.fotoLegenda}>{ROTULO_FOTO[a.tipo] ?? a.tipo}</Text>
            </View>
          ))}
        </View>
      )}

      {textoBotao && (
        <Pressable
          onPress={aoEnviar}
          disabled={enviando}
          style={({ pressed }) => [styles.botaoAnexar, (pressed || enviando) && styles.botaoDesabilitado]}
        >
          {enviando ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.botaoAnexarTexto}>📎 {textoBotao}</Text>
          )}
        </Pressable>
      )}
    </>
  )
}

/**
 * Toca o recado que o motorista gravou ao pedir.
 *
 * A URL leva o token na query, e não no header: useAudioPlayer recebe só
 * um endereço e não tem como mandar cabeçalho nenhum junto -- foi por
 * isso que a rota de anexos passou a aceitar ?token= (mesma solução que
 * a rota de anexo de mensagem já usava).
 */
/**
 * Foto da chave/QR ao lado do texto da chave -- é o par que quem paga
 * compara antes de mandar o dinheiro.
 *
 * `aoAdicionar` só vem na edição: ali, sem foto nenhuma, aparece um
 * quadrado com ícone de câmera no lugar onde a miniatura estaria. Um
 * espaço vazio não diz que aceita foto; o quadrado diz.
 */
function AreaFotoPix({
  fotos,
  fotosDataUri,
  aoAbrir,
  aoAdicionar,
  aoRemover,
  enviando,
}: {
  fotos: AnexoAprovacao[]
  fotosDataUri: Record<number, string>
  aoAbrir: (id: number) => void
  aoAdicionar?: () => void
  /** Só na edição -- na exibição a foto é só pra conferir. */
  aoRemover?: (id: number) => void
  enviando?: boolean
}) {
  if (fotos.length === 0 && !aoAdicionar) return null

  return (
    <View style={styles.linhaFotosPix}>
      {fotos.map((a) => (
        <View key={a.id}>
          <Pressable onPress={() => aoAbrir(a.id)}>
            {fotosDataUri[a.id] ? (
              <Image source={{ uri: fotosDataUri[a.id] }} style={styles.fotoPix} />
            ) : (
              <View style={[styles.fotoPix, styles.fotoPixVazia]} />
            )}
          </Pressable>
          {aoRemover && (
            <Pressable onPress={() => aoRemover(a.id)} hitSlop={10} style={styles.removerFoto}>
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
          )}
        </View>
      ))}
      {aoAdicionar && (
        <Pressable
          onPress={aoAdicionar}
          disabled={enviando}
          style={[styles.fotoPix, styles.fotoPixAdicionar, enviando && styles.botaoDesabilitado]}
        >
          {enviando ? (
            <ActivityIndicator color="#0d9488" size="small" />
          ) : (
            <Ionicons name="camera-outline" size={26} color="#0d9488" />
          )}
        </Pressable>
      )}
    </View>
  )
}

function PlayerObservacao({ url }: { url: string }) {
  const player = useAudioPlayer(url)
  const status = useAudioPlayerStatus(player)
  const tocando = status.playing

  return (
    <Pressable
      onPress={() => {
        if (tocando) {
          player.pause()
          return
        }
        // Terminado, o player fica parado no fim -- sem voltar ao início
        // o segundo toque não reproduz nada.
        if (status.currentTime >= status.duration - 0.1) player.seekTo(0)
        player.play()
      }}
      style={styles.botaoAudio}
    >
      <Text style={styles.botaoPixTexto}>
        {tocando ? '⏸ Pausar recado' : '▶️ Ouvir recado'}
        {status.duration > 0 ? `  (${Math.round(status.duration)}s)` : ''}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#f8fafc' },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  botaoVoltar: { padding: 6 },
  iconeVoltar: { fontSize: 22, color: '#0f172a', fontWeight: '600' },
  tituloCabecalho: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  conteudo: { padding: 16 },
  rodapeSalvar: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  botaoSalvarRodape: {
    backgroundColor: '#0d9488',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  textoVazio: { color: '#94a3b8' },
  status: { fontSize: 13, fontWeight: '700', color: '#0f766e', marginBottom: 4 },
  servico: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  decisao: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  botaoDecisao: { flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  botaoAprovar: { backgroundColor: '#0d9488' },
  botaoReprovar: { backgroundColor: '#be123c' },
  botaoDesabilitado: { opacity: 0.6 },
  botaoDecisaoTexto: { color: '#fff', fontWeight: '700', fontSize: 15 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  rotulo: { fontSize: 13, color: '#64748b' },
  valor: { fontSize: 14, color: '#1e293b', fontWeight: '600' },
  tituloFotos: { fontSize: 14, fontWeight: '700', color: '#334155', marginTop: 20, marginBottom: 8 },
  textoVazioSecao: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
  botaoAnexar: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: '#0d9488',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  botaoAnexarTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  blocoPix: {
    marginTop: 20,
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#99f6e4',
    borderRadius: 12,
    padding: 14,
  },
  rotuloPix: { fontSize: 12, fontWeight: '700', color: '#0f766e', textTransform: 'uppercase', letterSpacing: 0.4 },
  // flexShrink, não flex: com flex:1 o texto esticava até o fim da linha
  // e jogava o ícone de copiar lá pro canto, longe da chave. Encolhendo
  // só quando precisa, o ícone fica colado nela -- e a chave aleatória,
  // de 36 caracteres, ainda cabe quebrando linha.
  chavePix: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: '#0f172a', marginTop: 6 },
  dicaPix: { fontSize: 12, color: '#64748b', marginTop: 6 },
  linkPix: { fontSize: 14, fontWeight: '700', color: '#0d9488', marginTop: 10 },
  linhaChavePix: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  botaoCopiar: { padding: 4 },
  linhaFotosPix: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  fotoPix: { width: 84, height: 84, borderRadius: 8, backgroundColor: '#e2e8f0' },
  fotoPixVazia: { borderWidth: 1, borderColor: '#e2e8f0' },
  removerFoto: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fotoPixAdicionar: {
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#99f6e4',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  painelLimite: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  painelTitulo: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  linhaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipAtivo: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  chipTexto: { fontSize: 14, fontWeight: '600', color: '#334155' },
  chipTextoAtivo: { color: '#fff' },
  campo: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
    marginTop: 10,
  },
  // Amarelo, não verde: é instrução ("você pode gastar até X"), não
  // confirmação de algo concluído -- o verde da tela já é do pagamento.
  avisoAutorizado: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  avisoAutorizadoTitulo: { fontSize: 16, fontWeight: '800', color: '#92400e' },
  totalCalculado: { fontSize: 15, fontWeight: '700', color: '#0f766e', marginTop: 10 },
  rotuloCampo: { fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 14 },
  // Passo numerado, maior que um rótulo comum: é o que dá a sensação de
  // sequência ("faz um, depois dois") em vez de um monte de campo junto.
  passo: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginTop: 20 },
  dicaCampo: { fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 18 },
  contaFeita: { fontSize: 14, fontWeight: '700', color: '#0f766e', marginTop: 8 },
  dentroDoLimite: { fontSize: 13, fontWeight: '600', color: '#047857', marginTop: 8 },
  // Linha de foto com miniatura, em vez de botão verde cheio: mostra o
  // que foi enviado e deixa trocar com um toque.
  linhaFoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
  },
  linhaFotoPronta: { borderColor: '#6ee7b7', backgroundColor: '#f0fdf4' },
  miniaturaFoto: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#e2e8f0' },
  miniaturaVazia: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniaturaVaziaTexto: { fontSize: 22 },
  linhaFotoTextos: { flex: 1 },
  linhaFotoTitulo: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  linhaFotoOk: { fontSize: 12, color: '#047857', marginTop: 2 },
  linhaFotoPendente: { fontSize: 12, color: '#64748b', marginTop: 2 },
  blocoObservacao: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  textoObservacao: { fontSize: 14, color: '#1e293b', marginTop: 6, lineHeight: 20 },
  distancia: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginTop: 6 },
  botaoAudio: {
    backgroundColor: '#0d9488',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  avisoLimite: { fontSize: 13, fontWeight: '600', color: '#b45309', marginTop: 8, lineHeight: 18 },
  botaoSalvarLargo: {
    backgroundColor: '#0d9488',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  linkPixFraco: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  botaoPix: {
    backgroundColor: '#0d9488',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  botaoPixTexto: { color: '#fff', fontSize: 15, fontWeight: '700' },
  acoesPix: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginTop: 14 },
  botaoSalvarPix: {
    backgroundColor: '#0d9488',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  // Verde forte e largura cheia: é a notícia que o motorista está
  // esperando, não mais uma linha da ficha.
  avisoPago: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#6ee7b7',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  avisoPagoTitulo: { fontSize: 16, fontWeight: '800', color: '#065f46' },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fotoCartao: { width: '47%' },
  foto: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#e2e8f0' },
  fotoCarregando: { alignItems: 'center', justifyContent: 'center' },
  fotoLegenda: { fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center' },
  fundoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  fotoAmpliada: { width: '100%', height: '85%' },
  areaSeguraModal: { position: 'absolute', top: 0, left: 0, right: 0 },
  botaoFecharModal: {
    alignSelf: 'flex-end',
    margin: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoFecharModalTexto: { color: '#fff', fontSize: 20, fontWeight: '700' },
})
