/**
 * Lê a chave PIX de dentro do conteúdo de um QR Code.
 *
 * O QR do PIX não guarda a chave "solta": ele carrega um BR Code, o
 * formato EMV® QRCPS que o Banco Central adotou. É uma sequência de
 * campos no formato TLV -- 2 dígitos de ID, 2 dígitos de tamanho, e o
 * valor com exatamente aquele tamanho, um atrás do outro:
 *
 *     00 02 01   26 44 [...]   52 04 0000   53 03 986   ...
 *     ^id ^tam ^valor
 *
 * A chave fica num campo aninhado (outro TLV dentro do valor), no bloco
 * "Merchant Account Information" -- qualquer ID de 26 a 51, por isso a
 * varredura abaixo não fixa o 26. Dentro dele:
 *
 *     00 = GUI, sempre "br.gov.bcb.pix" (é o que identifica que é PIX)
 *     01 = a chave  <- é isso que queremos
 *     25 = URL      <- QR dinâmico: não tem chave, ver abaixo
 *
 * Módulo sem dependência de React ou de Expo de propósito: é só análise
 * de texto, então dá pra exercitar em node puro.
 */

/** IDs que podem conter um bloco de conta de recebedor no BR Code. */
const ID_CONTA_INICIO = 26
const ID_CONTA_FIM = 51

const GUI_PIX = 'br.gov.bcb.pix'

export type ResultadoPix =
  /** QR estático: a chave estava lá dentro. */
  | { tipo: 'chave'; chave: string }
  /** QR dinâmico: em vez da chave traz uma URL que o banco resolve na
   *  hora do pagamento. Não dá pra extrair chave nenhuma daqui -- e não é
   *  erro, é um QR legítimo. Quem chama avisa o motorista pra digitar. */
  | { tipo: 'dinamico' }
  /** QR de outra coisa (link, wi-fi, nota fiscal...) ou texto que não é
   *  um BR Code válido. */
  | { tipo: 'nao-e-pix' }

interface Campo {
  id: string
  valor: string
}

/**
 * Quebra uma sequência TLV em campos. Devolve lista vazia se encontrar
 * qualquer coisa fora do formato (tamanho não numérico, valor que
 * ultrapassa o fim da string) -- entrada malformada é tratada como "não
 * é BR Code", nunca como exceção.
 */
function separarCampos(texto: string): Campo[] {
  const campos: Campo[] = []
  let i = 0

  while (i < texto.length) {
    // Precisa de pelo menos 4 caracteres pra ler id + tamanho.
    if (i + 4 > texto.length) return []

    const id = texto.slice(i, i + 2)
    const tamanhoBruto = texto.slice(i + 2, i + 4)
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(tamanhoBruto)) return []

    const tamanho = Number(tamanhoBruto)
    const inicio = i + 4
    const fim = inicio + tamanho
    if (fim > texto.length) return []

    campos.push({ id, valor: texto.slice(inicio, fim) })
    i = fim
  }

  return campos
}

/**
 * Extrai a chave PIX do conteúdo lido de um QR Code.
 *
 * Não valida o CRC do fim do BR Code de propósito: aqui não estamos
 * autorizando um pagamento, só preenchendo um campo que o motorista
 * ainda vai conferir na tela. Recusar um QR levemente fora do padrão
 * (acontece com maquininha antiga) atrapalharia mais do que ajudaria.
 */
export function lerChavePix(conteudoQr: string): ResultadoPix {
  const texto = conteudoQr.trim()
  // Todo BR Code começa com o "payload format indicator": 00 02 01.
  if (!texto.startsWith('0002')) return { tipo: 'nao-e-pix' }

  const campos = separarCampos(texto)
  if (campos.length === 0) return { tipo: 'nao-e-pix' }

  for (const campo of campos) {
    const id = Number(campo.id)
    if (id < ID_CONTA_INICIO || id > ID_CONTA_FIM) continue

    const internos = separarCampos(campo.valor)
    const gui = internos.find((c) => c.id === '00')?.valor
    if (gui?.toLowerCase() !== GUI_PIX) continue

    const chave = internos.find((c) => c.id === '01')?.valor?.trim()
    if (chave) return { tipo: 'chave', chave }

    // Bloco é PIX mas sem o campo 01 -- é o QR dinâmico (campo 25 traz a
    // URL). Só reporta se realmente houver a URL, senão segue procurando
    // outro bloco.
    if (internos.some((c) => c.id === '25')) return { tipo: 'dinamico' }
  }

  return { tipo: 'nao-e-pix' }
}
