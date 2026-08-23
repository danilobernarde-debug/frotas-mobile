import type { CategoriaSolicitacao } from '../../lib/tipos'

export type TipoPasso = 'veiculo' | 'km' | 'texto' | 'foto_unica' | 'foto_multipla' | 'valor' | 'confirmar'

export interface DefinicaoPasso {
  id: string
  tipo: TipoPasso
  pergunta: string
  /** Só pra passos foto_unica -- vira o `tipo` do anexo (BOMBA/PLACA/KM). */
  tipoFoto?: string
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
      { id: 'foto_bomba', tipo: 'foto_unica', pergunta: 'Foto da bomba de combustível', tipoFoto: 'BOMBA' },
      { id: 'foto_placa', tipo: 'foto_unica', pergunta: 'Foto da placa do veículo', tipoFoto: 'PLACA' },
      { id: 'foto_km', tipo: 'foto_unica', pergunta: 'Foto do KM do veículo', tipoFoto: 'KM' },
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
