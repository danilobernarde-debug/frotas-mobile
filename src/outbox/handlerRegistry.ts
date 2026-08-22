import type { OutboxHandler } from './types'

const registro = new Map<string, OutboxHandler>()

/** Cada módulo (nova solicitação, checklist, o que vier depois) chama
 *  isto uma vez, na inicialização do app (app/_layout.tsx) -- o motor de
 *  sync nunca importa um handler diretamente, só despacha por `tipo`. */
export function registrarHandler(handler: OutboxHandler) {
  registro.set(handler.tipo, handler)
}

export function buscarHandler(tipo: string): OutboxHandler | undefined {
  return registro.get(tipo)
}
