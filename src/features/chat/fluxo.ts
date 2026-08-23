import type { CategoriaSolicitacao } from '../../lib/tipos'

export type TipoPasso = 'veiculo' | 'km' | 'texto' | 'fotos_abastecimento' | 'foto_multipla' | 'valor' | 'confirmar'

/** Uma foto fixa exigida dentro do passo fotos_abastecimento -- vira o
 *  `tipo` do anexo (BOMBA/PLACA/KM) quando capturada. */
export interface SlotFotoFixa {
  tipoFoto: string
  rotulo: string
  textoBotao: string
}

export interface DefinicaoPasso {
  id: string
  tipo: TipoPasso
  pergunta: string
  /** Só pro passo fotos_abastecimento -- as fotos fixas exigidas, todas
   *  mostradas juntas de uma vez (não mais uma por vez em sequência). */
  slots?: SlotFotoFixa[]
}

/**
 * Roteiro fixo, não reconhecimento de texto livre: o app já sabe
 * exatamente o que vai perguntar em cada passo. Cada categoria tem o seu;
 * "+ mais uma opção depois" é só somar outro arquivo de roteiro.
 */
export function obterFluxo(categoria: CategoriaSolicitacao): DefinicaoPasso[] {
  const veiculo: DefinicaoPasso = { id: 'veiculo', tipo: 'veiculo', pergunta: 'Qual veículo?' }
  const km: DefinicaoPasso = { id: 'km', tipo: 'km', pergunta: 'Qual o KM atual do veículo?' }
  const valor: DefinicaoPasso = { id: 'valor', tipo: 'valor', pergunta: 'Valor estimado (opcional)' }
  const confirmar: DefinicaoPasso = { id: 'confirmar', tipo: 'confirmar', pergunta: 'Confirmar envio' }

  if (categoria === 'ABASTECIMENTO') {
    return [
      veiculo,
      km,
      {
        id: 'fotos_abastecimento',
        tipo: 'fotos_abastecimento',
        pergunta: 'Fotos do abastecimento',
        slots: [
          { tipoFoto: 'BOMBA', rotulo: 'Bomba de combustível', textoBotao: 'Tirar foto da bomba' },
          { tipoFoto: 'KM', rotulo: 'KM do veículo', textoBotao: 'Tirar foto do hodômetro' },
          { tipoFoto: 'PLACA', rotulo: 'Placa do veículo', textoBotao: 'Tirar foto da placa' },
        ],
      },
      valor,
      confirmar,
    ]
  }

  // MANUTENÇÃO (e OUTRO, se algum dia ganhar botão próprio no menu)
  return [
    veiculo,
    { id: 'descricao', tipo: 'texto', pergunta: 'Descreva o problema' },
    { id: 'fotos', tipo: 'foto_multipla', pergunta: 'Fotos do problema' },
    valor,
    confirmar,
  ]
}
