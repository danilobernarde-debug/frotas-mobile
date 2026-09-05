import { CORES_ETIQUETA, Etiqueta, type CorEtiqueta } from './Etiqueta'
import type { EntradaChat } from './types'

export function StatusBadge({ entrada }: { entrada: EntradaChat & { tipo: 'solicitacao' } }) {
  let rotulo: string
  let icone: string | undefined
  let cor: CorEtiqueta = CORES_ETIQUETA.local

  if (entrada.fonte === 'servidor') {
    const status = entrada.aprovacao.status
    if (status === 'APROVADO') {
      rotulo = 'Aprovado'
      icone = '✅'
    } else if (status === 'REPROVADO') {
      rotulo = 'Reprovado'
      icone = '❌'
    } else {
      rotulo = 'Pendente'
    }
    cor = CORES_ETIQUETA[status] ?? CORES_ETIQUETA.local
  } else if (entrada.item.permanente) {
    rotulo = 'Não foi possível enviar'
    cor = CORES_ETIQUETA.erro
  } else if (entrada.item.status === 'enviando') {
    rotulo = 'Enviando…'
  } else {
    rotulo = 'Aguardando envio'
  }

  return <Etiqueta icone={icone} texto={rotulo} cor={cor} />
}
