/** Uma foto fixa exigida no formulário de abastecimento -- vira o `tipo`
 *  do anexo (BOMBA/KM/PLACA) quando capturada. */
export interface SlotFotoFixa {
  tipoFoto: string
  rotulo: string
  textoBotao: string
}

export const SLOTS_ABASTECIMENTO: SlotFotoFixa[] = [
  { tipoFoto: 'BOMBA', rotulo: 'Bomba de combustível', textoBotao: 'Tirar foto da bomba' },
  { tipoFoto: 'KM', rotulo: 'KM do veículo', textoBotao: 'Tirar foto do hodômetro' },
  { tipoFoto: 'PLACA', rotulo: 'Placa do veículo', textoBotao: 'Tirar foto da placa' },
]
