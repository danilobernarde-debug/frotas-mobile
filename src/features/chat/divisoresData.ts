import { diaRelativo } from '../../lib/formato'
import type { EntradaChat, EntradaChatReal } from './types'

/** Chave só de ano/mês/dia (fuso local), pra saber se duas entradas caem
 *  no mesmo dia sem se importar com hora/minuto. */
function chaveDia(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/**
 * Insere um separador de data ("Hoje", "Ontem", "21 de agosto de 2026")
 * antes da 1ª entrada de cada dia -- sem isso, como cada bolha só mostra
 * o horário, não dá pra saber em qual dia uma mensagem foi enviada numa
 * conversa que passa de um dia pro outro. Roda antes de
 * useDivisorNaoLidas() (que insere o divisor de "não lidas" por cima
 * deste resultado).
 */
export function inserirDivisoresData(entradas: EntradaChatReal[]): EntradaChat[] {
  const resultado: EntradaChat[] = []
  let ultimaChave: string | null = null

  for (const entrada of entradas) {
    const chave = chaveDia(entrada.criadoEm)
    if (chave !== ultimaChave) {
      resultado.push({ tipo: 'divisor', id: `divisor-data-${chave}`, rotulo: diaRelativo(entrada.criadoEm) })
      ultimaChave = chave
    }
    resultado.push(entrada)
  }

  return resultado
}
