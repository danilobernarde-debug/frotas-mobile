import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import type { EntradaChat, EntradaChatReal } from './types'

const CHAVE_ULTIMA_VISUALIZACAO = 'chat:ultima_visualizacao'

/**
 * Insere um divisor "Mensagens não lidas" antes da 1ª mensagem da gestão
 * chegada depois da última vez que o encarregado abriu este chat -- só
 * local (AsyncStorage), sem confirmação de leitura pro lado da gestão
 * (decisão já tomada na Fase F: sem read receipts no v1, isto não muda
 * isso -- é só um marcador pessoal, ninguém mais enxerga).
 *
 * Lê o valor guardado UMA vez por abertura da tela e já grava o instante
 * atual como novo marcador -- mensagens que chegarem com o chat já
 * aberto não empurram o divisor pra baixo.
 */
export function useDivisorNaoLidas(entradas: EntradaChatReal[]): EntradaChat[] {
  const { perfil } = useAuth()
  const [marca, setMarca] = useState<string | null | undefined>(undefined)
  const jaLeu = useRef(false)

  useEffect(() => {
    if (jaLeu.current) return
    jaLeu.current = true
    AsyncStorage.getItem(CHAVE_ULTIMA_VISUALIZACAO).then((valor) => {
      setMarca(valor)
      AsyncStorage.setItem(CHAVE_ULTIMA_VISUALIZACAO, new Date().toISOString()).catch(() => {})
    })
  }, [])

  // undefined = ainda não leu o AsyncStorage; null = primeira vez que
  // abre o chat (nunca tinha marca salva) -- nos dois casos, sem divisor.
  if (!marca || !perfil) return entradas

  const indice = entradas.findIndex(
    (e) => e.tipo === 'mensagem' && e.fonte === 'servidor' && e.mensagem.autor_id !== perfil.id && e.criadoEm > marca,
  )
  if (indice === -1) return entradas

  const divisor: EntradaChat = { tipo: 'divisor', id: 'divisor-nao-lidas' }
  return [...entradas.slice(0, indice), divisor, ...entradas.slice(indice)]
}
