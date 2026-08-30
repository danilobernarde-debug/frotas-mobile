import { useState } from 'react'
import {
  Image,
  StyleSheet,
  View,
  type ImageLoadEventData,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { PreviaMarcaDagua } from './PreviaMarcaDagua'

interface FotoAmpliadaProps {
  uri: string
  capturadaEm?: string
  nomeMotorista?: string | null
  placa?: string | null
  latitude?: number
  longitude?: number
  localizacaoRotulo?: string
}

/**
 * Foto em tela cheia (revisão pós-captura, dentro do Modal de zoom) com a
 * faixa da marca d'água encostada nela de verdade.
 *
 * Precisa do tamanho do CONTAINER (onLayout, em pixels de verdade) E da
 * proporção da imagem (onLoad) pra calcular a moldura -- só `aspectRatio`
 * sem largura/altura explícita não basta: sem nenhuma das duas, o Yoga
 * (motor de layout do RN) pode simplesmente colapsar a moldura pra
 * tamanho zero dentro de um pai centralizado (alignItems/justifyContent
 * 'center', sem 'stretch' nenhum pra forçar um tamanho) -- foi
 * exatamente isso que aconteceu numa 1ª tentativa só com aspectRatio:
 * moldura sumia, sobrava só o fundo escuro do Modal por trás (achado
 * real, relatado pelo usuário: "só abre uma sombra preta"). Com os dois
 * valores em mãos, o cálculo abaixo é o mesmo de sempre pra encaixar uma
 * proporção dentro de uma caixa ("contain"), só que em JS.
 */
export function FotoAmpliada({ uri, ...marcaDagua }: FotoAmpliadaProps) {
  const [caixa, setCaixa] = useState<{ largura: number; altura: number } | null>(null)
  const [aspecto, setAspecto] = useState<number | null>(null)
  // Sem NENHUM dado de marca d'água (caso do chat, que só passa a uri --
  // ali a faixa não faz sentido, mostraria tudo "—") -- só desenha a
  // faixa quando quem chama de fato tem algo pra mostrar (abastecimento/
  // checklist sempre têm ao menos nomeMotorista).
  const temMarcaDagua = Object.values(marcaDagua).some((v) => v !== undefined)

  let moldura: { width: number; height: number } | null = null
  if (caixa && aspecto) {
    const aspectoCaixa = caixa.largura / caixa.altura
    moldura =
      aspectoCaixa > aspecto
        ? { height: caixa.altura, width: caixa.altura * aspecto }
        : { width: caixa.largura, height: caixa.largura / aspecto }
  }

  return (
    <View
      style={styles.container}
      onLayout={(evento: LayoutChangeEvent) => {
        const { width, height } = evento.nativeEvent.layout
        setCaixa({ largura: width, altura: height })
      }}
    >
      {/* Enquanto a caixa/proporção ainda não resolveram (1ª pintura),
          ocupa o espaço todo -- assim que os dois valores chegam, o
          próximo render já usa o tamanho calculado certo. */}
      <View style={moldura ?? styles.molduraProvisoria}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          onLoad={(evento: NativeSyntheticEvent<ImageLoadEventData>) => {
            const { width, height } = evento.nativeEvent.source
            if (width && height) setAspecto(width / height)
          }}
        />
        {temMarcaDagua && <PreviaMarcaDagua {...marcaDagua} />}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { width: '100%', height: '85%', alignItems: 'center', justifyContent: 'center' },
  molduraProvisoria: { width: '100%', height: '100%' },
})
