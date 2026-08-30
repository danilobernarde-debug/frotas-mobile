import { useEffect, useRef, useState } from 'react'
import { obterLocalizacaoAtual, type LocalCapturado } from '../lib/localizacao'
import { capturarFoto } from './capturarFoto'
import type { ContextoMarcaDagua } from './CameraCustomizada'

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
  // Espelha o resultado da MESMA promise em estado -- é o que permite
  // mostrar a localização já resolvida na faixa AO VIVO da câmera
  // (marcaDagua abaixo), não só depois da foto tirada. Fica null
  // enquanto o GPS ainda não respondeu (a faixa mostra "Localização não
  // disponível" nesse meio tempo, e não atualiza sozinha depois -- só a
  // PRÓXIMA foto já pega o valor resolvido).
  const [localAtual, setLocalAtual] = useState<LocalCapturado | null>(null)

  useEffect(() => {
    if (!localizacaoIniciada.current) {
      localizacaoIniciada.current = true
      const promessa = obterLocalizacaoAtual()
      localizacaoPromise.current = promessa
      promessa.then(setLocalAtual)
    }
  }, [])

  /**
   * Tira a foto e devolve na hora -- NÃO espera a localização resolver.
   * Antes, capturar() ficava parado até o GPS terminar (podia levar vários
   * segundos, às vezes o tempo limite inteiro de obterLocalizacaoAtual())
   * antes de sequer devolver a foto pra tela mostrar, deixando "tirar
   * foto" bem mais lento que precisava (reportado pelo usuário, sentido
   * na prática comparando com o fluxo de manutenção antes deste ajuste
   * cobrir os dois igual).
   *
   * `aoLocalizar` (opcional) é chamado depois, só quando a localização
   * realmente resolver -- quem chama usa isso pra completar os campos de
   * local na MESMA foto já exibida na tela (por isso o retorno inclui o
   * uri: é a chave pra saber qual foto atualizar, já que outras podem ter
   * sido tiradas nesse meio tempo). Se a localização já tiver terminado
   * antes da foto (comum, já que o pedido começa no mount do hook), o
   * callback roda quase na hora mesmo assim -- não muda nada pra quem
   * chama, sempre o mesmo caminho.
   */
  async function capturar(
    aoLocalizar?: (uri: string, local: LocalCapturado | null) => void,
    marcaDagua?: ContextoMarcaDagua,
  ): Promise<FotoComLocal | null> {
    setCapturando(true)
    // Localização entra aqui, não em quem chama -- localAtual já é o
    // resultado da MESMA busca (iniciada no mount deste hook) que
    // completarLocal() usa depois da foto; se já resolveu a tempo (comum,
    // já que começa cedo), a faixa ao vivo já mostra local de verdade em
    // vez de "não disponível".
    const marcaDaguaCompleta: ContextoMarcaDagua | undefined = marcaDagua && {
      ...marcaDagua,
      latitude: localAtual?.latitude,
      longitude: localAtual?.longitude,
      localizacaoRotulo: localAtual?.rotulo ?? undefined,
    }
    const uri = await capturarFoto(marcaDaguaCompleta)
    setCapturando(false)
    if (!uri) return null

    const capturadaEm = new Date().toISOString()

    if (aoLocalizar) {
      const promessa = localizacaoPromise.current ?? Promise.resolve(null)
      promessa.then((local) => aoLocalizar(uri, local))
    }

    // localAtual (não só o callback aoLocalizar) -- se o GPS já tinha
    // resolvido a tempo de aparecer na faixa AO VIVO da câmera (comum, é
    // a mesma busca), a foto já nasce com local preenchido, sem depender
    // do callback assíncrono rodar antes de alguém abrir a prévia. Achado
    // real: usuário via a localização certa no visor, mas "não
    // disponível" na revisão pós-captura -- o retorno aqui nunca levava
    // o que já estava disponível, só o callback levava (e só quando
    // rodava a tempo).
    return {
      uriLocal: uri,
      capturadaEm,
      latitude: localAtual?.latitude,
      longitude: localAtual?.longitude,
      localizacaoRotulo: localAtual?.rotulo ?? undefined,
    }
  }

  return { capturando, capturar }
}
