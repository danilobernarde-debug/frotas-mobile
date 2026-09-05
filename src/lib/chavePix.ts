/**
 * Máscara e normalização da chave PIX digitada à mão.
 *
 * Chave PIX não tem um formato só -- são cinco, com regras diferentes --
 * e os dois mais comuns (CPF e celular) têm exatamente 11 dígitos, então
 * NÃO dá pra adivinhar o tipo pelo que foi digitado. Por isso a tela
 * mostra o tipo escolhido explicitamente (é o que o próprio app do banco
 * faz na hora de cadastrar chave) e este módulo só formata o que
 * corresponde ao tipo escolhido.
 *
 * Duas representações, de propósito:
 *   - a formatada, com pontuação, que aparece no campo enquanto digita;
 *   - a limpa (`limparChavePix`), que é o que vai pro servidor -- o
 *     registro da chave no Banco Central é sem pontuação, e celular leva
 *     o "+55" na frente. Mandar a versão bonita quebraria o pagamento.
 *
 * Módulo sem dependência de React ou Expo, mesmo motivo do pixBrCode.ts:
 * é só manipulação de texto, dá pra exercitar em node puro.
 */

export type TipoChavePix = 'CPF' | 'CNPJ' | 'CELULAR' | 'EMAIL' | 'ALEATORIA'

/** Quantos dígitos cada tipo numérico aceita -- também é onde a digitação
 *  para (não adianta deixar entrar o 12º dígito de um CPF). */
const DIGITOS_CPF = 11
const DIGITOS_CNPJ = 14
const DIGITOS_CELULAR = 11
/** Chave aleatória é um UUID: 32 hexadecimais em 8-4-4-4-12. */
const HEX_ALEATORIA = 32

/** Alimenta os botões de tipo e o teclado/placeholder do campo. `teclado`
 *  é escrito como literal (em vez de importar KeyboardTypeOptions) só pra
 *  este módulo continuar sem importar react-native. */
export const TIPOS_CHAVE_PIX = [
  { tipo: 'CPF', rotulo: 'CPF', placeholder: '000.000.000-00', teclado: 'number-pad' },
  { tipo: 'CNPJ', rotulo: 'CNPJ', placeholder: '00.000.000/0000-00', teclado: 'number-pad' },
  { tipo: 'CELULAR', rotulo: 'Celular', placeholder: '(00) 00000-0000', teclado: 'number-pad' },
  { tipo: 'EMAIL', rotulo: 'E-mail', placeholder: 'nome@email.com', teclado: 'email-address' },
  {
    tipo: 'ALEATORIA',
    rotulo: 'Aleatória',
    placeholder: '00000000-0000-0000-0000-000000000000',
    teclado: 'default',
  },
] as const satisfies ReadonlyArray<{
  tipo: TipoChavePix
  rotulo: string
  placeholder: string
  teclado: 'number-pad' | 'email-address' | 'default'
}>

function soDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
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

/**
 * Aplica a máscara do tipo escolhido ao que está sendo digitado.
 *
 * E-mail sai como veio: qualquer recorte automático estragaria endereço
 * válido, e não existe formato posicional pra impor.
 */
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
 * Banco Central exige no registro da chave. Devolve string vazia quando
 * não há nada digitado (quem chama transforma em null).
 */
export function limparChavePix(texto: string, tipo: TipoChavePix): string {
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
  }
}

/**
 * Descobre o tipo de uma chave que veio pronta do QR Code -- ali não há
 * ambiguidade que justifique perguntar: o BR Code guarda celular sempre
 * com "+55" na frente, então 11 dígitos secos só podem ser CPF.
 *
 * Devolve null quando não reconhece o formato; quem chama mantém o tipo
 * que já estava escolhido na tela.
 */
export function detectarTipoChave(chave: string): TipoChavePix | null {
  const texto = chave.trim()
  if (!texto) return null
  if (texto.includes('@')) return 'EMAIL'
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto)) return 'ALEATORIA'
  if (texto.startsWith('+')) return 'CELULAR'

  const d = soDigitos(texto)
  if (d !== texto.replace(/[.\-/() ]/g, '')) return null
  if (d.length === DIGITOS_CPF) return 'CPF'
  if (d.length === DIGITOS_CNPJ) return 'CNPJ'
  return null
}

/**
 * Tipo que o campo deve assumir sozinho enquanto se digita. Só corrige o
 * caso em que a escolha atual não comporta mais o que foi digitado (passou
 * de 11 dígitos com CPF marcado = é CNPJ), e nunca o contrário: apagar
 * dígitos de um CNPJ não pode ficar trocando o botão marcado embaixo do
 * dedo de quem está digitando.
 */
export function ajustarTipoDigitando(texto: string, tipo: TipoChavePix): TipoChavePix {
  if (tipo === 'CPF' && soDigitos(texto).length > DIGITOS_CPF) return 'CNPJ'
  if ((tipo === 'CPF' || tipo === 'CNPJ' || tipo === 'CELULAR') && texto.includes('@')) return 'EMAIL'
  return tipo
}

/**
 * Prepara pro campo uma chave que veio pronta do QR Code: descobre o tipo
 * e devolve já formatada pra leitura.
 *
 * O "+55" do celular sai antes de formatar -- no BR Code a chave é
 * gravada com ele, mas o campo mostra só DDD + número, como todo mundo
 * escreve. limparChavePix() recoloca na hora de enviar, então dá a volta
 * completa sem perder nada.
 *
 * `tipo` volta null quando o formato não é reconhecido (chave fora do
 * padrão): aí o texto sai como veio e quem chama mantém o tipo que já
 * estava marcado na tela, em vez de reformatar por cima de um palpite.
 */
export function formatarChaveRecebida(chave: string): { tipo: TipoChavePix | null; texto: string } {
  const tipo = detectarTipoChave(chave)
  if (!tipo) return { tipo: null, texto: chave.trim() }
  const semPrefixo = tipo === 'CELULAR' ? chave.trim().replace(/^\+55/, '') : chave.trim()
  return { tipo, texto: formatarChavePix(semPrefixo, tipo) }
}
