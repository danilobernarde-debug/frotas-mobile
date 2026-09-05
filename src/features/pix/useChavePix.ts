import { useState } from 'react'
import { identificarChavePix, limparChavePix, type TipoChavePix } from '../../lib/chavePix'

/**
 * Estado de um campo de chave PIX: o texto e, no caso ambíguo, a aba
 * escolhida. Todo o resto (máscara, tipo, avisos) é derivado a cada
 * render, não guardado -- identificarChavePix() é idempotente, então
 * reaplicar no valor já formatado dá sempre o mesmo resultado, e não há
 * como campo e tipo saírem de sincronia.
 *
 * Extraído de useFormularioSolicitacao pra servir também à tela da
 * solicitação já enviada, onde o motorista completa a chave depois. As
 * duas telas precisam do mesmo comportamento -- máscara, abas CPF/celular
 * e a mesma normalização antes de gravar -- e uma chave que fosse tratada
 * diferente em cada lugar é exatamente o tipo de divergência que acaba em
 * pagamento errado.
 */
export function useChavePix(inicial = '') {
  const [texto, setTexto] = useState(inicial)
  /** Só é preenchida quando o motorista toca numa das abas do caso
   *  ambíguo. Volta a null a cada edição -- o número mudou, a escolha
   *  anterior não vale mais. */
  const [tipoEscolhido, setTipoEscolhido] = useState<TipoChavePix | null>(null)

  const identificada = identificarChavePix(texto, tipoEscolhido)

  function alterar(valor: string) {
    setTexto(valor)
    setTipoEscolhido(null)
  }

  /** Aceita só o que a própria detecção ofereceu em `opcoes` -- é ela que
   *  sabe quais leituras cabem naqueles dígitos. */
  function escolherTipo(tipo: TipoChavePix) {
    if (identificada.opcoes?.includes(tipo)) setTipoEscolhido(tipo)
  }

  /** Repõe o campo a partir de um valor vindo de fora (chave lida do QR,
   *  ou a que já está gravada na solicitação). */
  function definir(valor: string) {
    setTexto(valor)
    setTipoEscolhido(null)
  }

  return {
    /** Já formatado -- é o que vai no `value` do TextInput. */
    texto: identificada.texto,
    tipo: identificada.tipo,
    opcoes: identificada.opcoes,
    aviso: identificada.aviso,
    completa: identificada.completa,
    /** Sem pontuação e com o "+55" do celular: o formato em que a chave
     *  está registrada no Banco Central, e o único que serve pra gravar. */
    paraGravar: () => limparChavePix(identificada.texto, identificada.tipo),
    alterar,
    escolherTipo,
    definir,
  }
}

export type ChavePixControlada = ReturnType<typeof useChavePix>
