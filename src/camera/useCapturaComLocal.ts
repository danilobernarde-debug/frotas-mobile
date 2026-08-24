import { useEffect, useRef, useState } from 'react'
import { obterLocalizacaoAtual, type LocalCapturado } from '../lib/localizacao'
import { capturarFoto } from './capturarFoto'

export interface FotoComLocal {
  uriLocal: string
  capturadaEm: string
  latitude?: number
  longitude?: number
  localizacaoRotulo?: string
}

/**
 * Dispara a busca de localização assim que o componente monta -- antes
 * até do resto da tela ser preenchido. Duas razões: (1) dá tempo de
 * sobra pra já estar resolvido quando chegar na 1ª foto; (2)
 * principalmente, evita pedir permissão de localização logo depois que a
 * câmera fecha -- no Expo Go isso trava o diálogo do sistema pra sempre
 * (bug real visto em teste, tanto Android quanto iOS). Uma chamada só,
 * reaproveitada por todas as fotos da tela: é o mesmo local no mesmo
 * minuto, não faz sentido buscar de novo a cada uma. `iniciada` (não só
 * o dependency array) evita disparar de novo no duplo-mount que o modo
 * de desenvolvimento do React faz de propósito (confirmado em teste: sem
 * essa guarda, obterLocalizacaoAtual() rodava 2x em paralelo).
 *
 * Usado por qualquer tela que tira foto em campo (abastecimento/
 * manutenção via useFormularioSolicitacao, itens do checklist) -- é o
 * que alimenta a marca d'água aplicada depois no servidor.
 */
export function useCapturaComLocal() {
  const [capturando, setCapturando] = useState(false)
  const localizacaoPromise = useRef<Promise<LocalCapturado | null> | null>(null)
  const localizacaoIniciada = useRef(false)

  useEffect(() => {
    if (!localizacaoIniciada.current) {
      localizacaoIniciada.current = true
      localizacaoPromise.current = obterLocalizacaoAtual()
    }
  }, [])

  /** Tira uma foto e já resolve a localização (aqui só espera o que já
   *  estava em andamento, nunca inicia um pedido novo logo depois da
   *  câmera fechar). Carimba no momento da captura, não do envio --
   *  importa num app offline-first, onde a foto pode subir horas depois.
   *  Null se o usuário cancelar a captura. */
  async function capturar(): Promise<FotoComLocal | null> {
    setCapturando(true)
    const uri = await capturarFoto()
    if (!uri) {
      setCapturando(false)
      return null
    }
    const capturadaEm = new Date().toISOString()
    const local = await (localizacaoPromise.current ?? Promise.resolve(null))
    setCapturando(false)
    return {
      uriLocal: uri,
      capturadaEm,
      latitude: local?.latitude,
      longitude: local?.longitude,
      localizacaoRotulo: local?.rotulo ?? undefined,
    }
  }

  return { capturando, capturar }
}
