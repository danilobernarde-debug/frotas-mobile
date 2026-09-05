/**
 * Identifica e formata a chave PIX digitada, sem perguntar o tipo.
 *
 * O problema central: CPF e celular têm exatamente 11 dígitos, então o
 * tamanho não separa os dois. Quem resolve isso é o dígito verificador do
 * CPF -- ele é calculado a partir dos 9 primeiros, então um CPF de
 * verdade SEMPRE passa na conta, enquanto um telefone só passa por
 * coincidência (cerca de 1 em 100, ver `cpfValido`). Combinado com o
 * formato do celular brasileiro (DDD que existe + o dígito 9 na frente do
 * número), dá pra acertar o tipo sozinho na quase totalidade dos casos.
 *
 * Quando os 11 dígitos passam nas DUAS verificações -- acontece com uns
 * 6% dos CPFs, que por acaso começam com algo parecido com DDD + 9 -- o
 * módulo assume CPF e devolve as duas leituras em `opcoes`, pra tela
 * abrir as abas CPF/Celular e deixar a escolha com quem está com o número
 * na frente. É o único caso em que nenhuma regra local decide: os
 * aplicativos de banco resolvem consultando o cadastro de chaves do Banco
 * Central, o que daqui não dá pra fazer.
 *
 * Duas representações, de propósito:
 *   - a formatada, com pontuação, que aparece no campo;
 *   - a limpa (`limparChavePix`), que é o que vai pro servidor -- o
 *     registro da chave no Banco Central é sem pontuação, e celular leva
 *     o "+55" na frente. Mandar a versão bonita quebraria o pagamento.
 *
 * Módulo sem dependência de React ou Expo, mesmo motivo do pixBrCode.ts:
 * é só manipulação de texto, dá pra exercitar em node puro.
 */

export type TipoChavePix = 'CPF' | 'CNPJ' | 'CELULAR' | 'EMAIL' | 'ALEATORIA'

const DIGITOS_CPF = 11
const DIGITOS_CNPJ = 14
const DIGITOS_CELULAR = 11
/** Chave aleatória é um UUID: 32 hexadecimais em 8-4-4-4-12. */
const HEX_ALEATORIA = 32

/** DDDs que existem de fato. Um número que comece fora desta lista não é
 *  celular, o que já elimina boa parte da confusão com CPF. */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
])

function soDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

/**
 * Confere os dois dígitos verificadores do CPF (módulo 11).
 *
 * É o que separa CPF de celular: os 9 primeiros dígitos determinam os 2
 * últimos, então um CPF real sempre fecha a conta e um telefone só fecha
 * por acaso -- daí as `opcoes` devolvidas por identificarChavePix().
 *
 * Sequências repetidas (111.111.111-11 e parentes) fecham a aritmética
 * mas não são CPF de ninguém; entram na recusa explícita abaixo.
 */
export function cpfValido(digitos: string): boolean {
  if (digitos.length !== DIGITOS_CPF) return false
  if (/^(\d)\1{10}$/.test(digitos)) return false

  // Os dois dígitos seguem a mesma regra, mudando só quantos números
  // entram na soma (9 pro primeiro, 10 pro segundo) e o peso inicial.
  for (const ate of [9, 10]) {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(digitos[i]) * (ate + 1 - i)
    const esperado = ((soma * 10) % 11) % 10
    if (esperado !== Number(digitos[ate])) return false
  }
  return true
}

/**
 * Confere os dois dígitos verificadores do CNPJ (módulo 11).
 *
 * Mesma ideia do CPF: os 12 primeiros determinam os 2 últimos. Sem isso o
 * "Reconhecido como CNPJ" seria só uma contagem de dígitos -- diria que
 * está tudo certo em cima de um número com dígito trocado, e CNPJ é
 * justamente a chave mais comum por aqui (posto, oficina).
 */
export function cnpjValido(digitos: string): boolean {
  if (digitos.length !== DIGITOS_CNPJ) return false
  if (/^(\d)\1{13}$/.test(digitos)) return false

  for (const ate of [12, 13]) {
    let soma = 0
    // Pesos vão de 2 a 9, ciclicamente, contados da direita pra esquerda.
    for (let i = 0; i < ate; i++) soma += Number(digitos[i]) * (((ate - 1 - i) % 8) + 2)
    const resto = soma % 11
    const esperado = resto < 2 ? 0 : 11 - resto
    if (esperado !== Number(digitos[ate])) return false
  }
  return true
}

/**
 * Formato de celular brasileiro: DDD que existe + o 9 que todo número
 * móvel passou a ter + os oito dígitos restantes. Fixo (8 dígitos) não
 * pode ser chave PIX.
 *
 * Deliberadamente permissiva -- é ela que CLASSIFICA, e classificar
 * errado tem custo: um celular recusado aqui cairia no aviso de
 * "confira esses números", alarme falso em cima de um número correto.
 * O aperto extra fica em `celularTipico`, que não classifica nada.
 */
export function pareceCelular(digitos: string): boolean {
  if (digitos.length !== DIGITOS_CELULAR) return false
  if (!DDDS.has(Number(digitos.slice(0, 2)))) return false
  return digitos[2] === '9'
}

/**
 * Mesma regra, mais o dígito seguinte ao 9 restrito a 6-9.
 *
 * O 9 foi prefixado aos antigos números móveis de 8 dígitos, que já
 * começavam em 6, 7, 8 ou 9 (2 a 5 eram de telefone fixo) -- então
 * celular hoje é, na prática, 9 seguido de 6-9. "Na prática" é o ponto:
 * não dá pra afirmar que a Anatel nunca alocou fora dessa faixa, e por
 * isso esta função NÃO decide o tipo de nada.
 *
 * Serve só pra decidir se vale abrir as abas CPF/Celular num número que
 * já fechou como CPF. Errar aqui custa no máximo umas abas a menos;
 * errar em pareceCelular() custaria um aviso falso. Medido em simulação
 * de 300 mil CPFs: as abas caem de 6,7% pra 2,7% das digitações, sem
 * deixar de aparecer em nenhum celular de formato normal.
 */
export function celularTipico(digitos: string): boolean {
  return pareceCelular(digitos) && '6789'.includes(digitos[3])
}

/**
 * Junta os pedaços de uma máscara posicional: corta os dígitos nos
 * tamanhos pedidos e só emenda o separador quando o pedaço SEGUINTE já
 * começou a ser digitado. É o que faz "123" virar "123" e não
 * "123.___.___-__" -- pontuação que aparece antes da hora atrapalha
 * apagar com o backspace.
 */
function agrupar(digitos: string, tamanhos: number[], separadores: string[]): string {
  let saida = ''
  let i = 0
  for (let bloco = 0; bloco < tamanhos.length; bloco++) {
    const pedaco = digitos.slice(i, i + tamanhos[bloco])
    if (!pedaco) break
    if (bloco > 0) saida += separadores[bloco - 1]
    saida += pedaco
    i += tamanhos[bloco]
  }
  return saida
}

/** Aplica a pontuação de um tipo já conhecido. E-mail sai como veio:
 *  qualquer recorte automático estragaria endereço válido. */
export function formatarChavePix(texto: string, tipo: TipoChavePix): string {
  switch (tipo) {
    case 'CPF':
      return agrupar(soDigitos(texto).slice(0, DIGITOS_CPF), [3, 3, 3, 2], ['.', '.', '-'])
    case 'CNPJ':
      return agrupar(soDigitos(texto).slice(0, DIGITOS_CNPJ), [2, 3, 3, 4, 2], ['.', '.', '/', '-'])
    case 'CELULAR': {
      const d = soDigitos(texto).slice(0, DIGITOS_CELULAR)
      if (!d) return ''
      // O "(" entra fora do agrupamento porque abre o primeiro bloco --
      // agrupar() só sabe emendar separador ENTRE blocos.
      return `(${agrupar(d, [2, 5, 4], [') ', '-'])}`
    }
    case 'ALEATORIA': {
      const hex = texto.toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, HEX_ALEATORIA)
      return agrupar(hex, [8, 4, 4, 4, 12], ['-', '-', '-', '-'])
    }
    case 'EMAIL':
      return texto
  }
}

/**
 * Versão que vai pro servidor: sem pontuação, e celular com o "+55" que o
 * Banco Central exige no registro da chave. Tipo desconhecido vai como
 * foi digitado -- o campo é opcional e quem paga ainda confere contra a
 * foto, então recusar seria pior do que passar adiante.
 */
export function limparChavePix(texto: string, tipo: TipoChavePix | null): string {
  switch (tipo) {
    case 'CPF':
    case 'CNPJ':
      return soDigitos(texto)
    case 'CELULAR': {
      const d = soDigitos(texto)
      return d ? `+55${d}` : ''
    }
    case 'EMAIL':
    case 'ALEATORIA':
      return texto.trim().toLowerCase()
    default:
      return texto.trim()
  }
}

/** Como escrever o tipo identificado na tela. */
export const NOME_TIPO_CHAVE: Record<TipoChavePix, string> = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  CELULAR: 'Celular',
  EMAIL: 'E-mail',
  ALEATORIA: 'Chave aleatória',
}

export interface ChavePixIdentificada {
  /** null = ainda não dá pra afirmar (digitação incompleta ou formato
   *  irreconhecível). A tela usa isso pra não afirmar besteira. */
  tipo: TipoChavePix | null
  /** O que mostrar no campo: formatado quando o tipo já é conhecido, cru
   *  enquanto não é -- reescrever texto que ainda não se entende só
   *  atrapalha quem está digitando. */
  texto: string
  /**
   * As leituras possíveis quando os mesmos dígitos servem para mais de
   * uma coisa -- hoje só o par CPF/celular. null quando não há dúvida.
   *
   * Vem como lista, e não como "a outra opção", porque a tela desenha
   * abas: a lista tem ordem fixa (CPF, Celular), então as abas não trocam
   * de lugar quando o motorista escolhe uma. `tipo` diz qual está ativa.
   */
  opcoes: readonly TipoChavePix[] | null
  /** Frase a mostrar quando o que foi digitado tem cara de erro, ou null
   *  quando não há o que apontar. O texto mora aqui, e não na tela,
   *  porque cada motivo pede uma frase diferente e quem sabe o motivo é
   *  esta função. */
  aviso: string | null
  /**
   * A chave está inteira, não só reconhecível.
   *
   * Separado de `tipo` porque os dois respondem perguntas diferentes:
   * "12.345.678/0001" já só pode ser CNPJ (tipo), mas ainda faltam dois
   * dígitos (completa). É `completa` que a tela usa pro "✓ Reconhecido",
   * já que esse visto verde é lido como "pode enviar" -- aparecer em cima
   * de número pela metade seria dar aval a uma chave truncada.
   */
  completa: boolean
}

const INDEFINIDA: Omit<ChavePixIdentificada, 'texto'> = {
  tipo: null,
  opcoes: null,
  aviso: null,
  completa: false,
}

/** Ordem fixa das abas no caso ambíguo. CPF primeiro por ser a leitura
 *  assumida -- é a que tem o dígito verificador a favor. */
const PAR_AMBIGUO = ['CPF', 'CELULAR'] as const

/** E-mail só conta como inteiro com algo antes do @, algo depois e um
 *  ponto no domínio -- "posto@" é digitação em andamento, não chave. */
function emailCompleto(texto: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto.trim())
}

/**
 * Descobre sozinha o tipo do que está sendo digitado e devolve já
 * formatado quando tem certeza.
 *
 * `escolhido` é a aba que o motorista tocou no caso ambíguo. Ela vence a
 * detecção, mas NÃO apaga `opcoes`: a identificação natural é calculada
 * primeiro e só então a escolha é aplicada por cima. Se fosse um atalho
 * no começo da função, escolher "Celular" faria as opções sumirem junto
 * com a dúvida -- e as abas desapareceriam da tela, sem caminho de volta
 * pro CPF.
 *
 * A escolha também só vale dentro do par que a própria detecção ofereceu.
 * Assim uma aba tocada num número e um número novo digitado em seguida
 * não se misturam: a escolha antiga simplesmente deixa de valer.
 */
export function identificarChavePix(
  texto: string,
  escolhido?: TipoChavePix | null,
): ChavePixIdentificada {
  const natural = identificarSozinho(texto)
  if (!escolhido || !natural.opcoes?.includes(escolhido)) return natural
  return { ...natural, tipo: escolhido, texto: formatarChavePix(texto, escolhido) }
}

/**
 * A detecção em si, sem interferência de escolha nenhuma.
 *
 * A ordem das perguntas vai do mais decisivo pro menos: "@" só existe em
 * e-mail; letra fora de e-mail só existe em chave aleatória; o resto é
 * dígito, e aí manda o tamanho -- com o desempate do dígito verificador
 * nos 11.
 */
function identificarSozinho(texto: string): ChavePixIdentificada {
  const cru = texto.trim()
  if (!cru) return { ...INDEFINIDA, texto: '' }

  if (cru.includes('@')) {
    return { ...INDEFINIDA, tipo: 'EMAIL', texto, completa: emailCompleto(cru) }
  }

  // Letra (fora de e-mail) só aparece em chave aleatória. Só afirma o
  // tipo com os 32 hexadecimais completos; antes disso é digitação em
  // andamento e não há o que formatar.
  if (/[a-z]/i.test(cru)) {
    const hex = cru.toLowerCase().replace(/[^0-9a-f]/g, '')
    if (hex.length === HEX_ALEATORIA) {
      return {
        ...INDEFINIDA,
        tipo: 'ALEATORIA',
        texto: formatarChavePix(cru, 'ALEATORIA'),
        completa: true,
      }
    }
    return { ...INDEFINIDA, texto }
  }

  const d = soDigitos(cru)

  // "+55..." não é coisa que se digite -- chega assim pelo QR Code, e o
  // próprio prefixo já diz que é celular.
  if (cru.startsWith('+55') && d.length === 13) {
    return {
      ...INDEFINIDA,
      tipo: 'CELULAR',
      texto: formatarChavePix(d.slice(2), 'CELULAR'),
      completa: true,
    }
  }

  if (d.length === DIGITOS_CPF) {
    const ehCpf = cpfValido(d)
    const ehCelular = pareceCelular(d)
    if (ehCpf) {
      // Fecha nos dois: assume CPF (o dígito verificador é evidência bem
      // mais forte que "começa com DDD e 9") e abre as abas pro motorista
      // decidir -- mas só quando o número tem cara de celular DE VERDADE,
      // senão as abas apareceriam em 1 a cada 15 CPFs e virariam ruído
      // que se ignora. Nenhuma regra local decide esse caso: é aqui que a
      // pessoa que está olhando o número sabe mais que o app.
      return {
        tipo: 'CPF',
        texto: formatarChavePix(d, 'CPF'),
        opcoes: celularTipico(d) ? PAR_AMBIGUO : null,
        aviso: null,
        completa: true,
      }
    }
    if (ehCelular) {
      // Sem abas aqui: se o dígito verificador não fechou, esses 11
      // números não são CPF de ninguém -- oferecer a opção seria oferecer
      // uma escolha que já se sabe errada, em toda digitação de celular.
      return { ...INDEFINIDA, tipo: 'CELULAR', texto: formatarChavePix(d, 'CELULAR'), completa: true }
    }
    // Nem uma coisa nem outra -- CPF com dígito trocado, quase sempre.
    // Não bloqueia nada, só marca pra tela avisar.
    return {
      ...INDEFINIDA,
      texto: d,
      aviso: 'Confira: esses 11 números não formam um CPF válido nem um celular.',
    }
  }

  // Mais dígitos do que qualquer chave comporta -- colagem repetida, na
  // maior parte das vezes. Aqui NÃO dá pra cortar no 14 e seguir dizendo
  // "reconhecido como CNPJ": seria afirmar com confiança em cima de um
  // número que foi picotado em silêncio, que é pior do que não reconhecer
  // nada. Mostra o que a pessoa realmente colou e pede conferência.
  if (d.length > DIGITOS_CNPJ) {
    return {
      ...INDEFINIDA,
      texto: d,
      aviso: `Confira: ${d.length} números é mais do que qualquer chave PIX tem.`,
    }
  }

  // Entre 12 e 14: CPF e celular estão descartados pelo tamanho, só pode
  // ser CNPJ. Os verificadores só dá pra conferir com os 14 completos --
  // antes disso é digitação em andamento, e avisar seria implicar com
  // quem ainda está no meio do número.
  if (d.length > DIGITOS_CPF) {
    const inteiro = d.length === DIGITOS_CNPJ
    return {
      ...INDEFINIDA,
      tipo: 'CNPJ',
      texto: formatarChavePix(d, 'CNPJ'),
      aviso: inteiro && !cnpjValido(d) ? 'Confira: esses 14 números não formam um CNPJ válido.' : null,
      completa: inteiro,
    }
  }

  // Menos de 11 dígitos: ainda pode virar CPF, celular ou CNPJ. Segue cru
  // -- pontuar agora obrigaria a repontuar tudo dois dígitos depois, com
  // o cursor pulando no meio da digitação.
  return { ...INDEFINIDA, texto: d }
}
