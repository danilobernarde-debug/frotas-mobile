import { useState } from 'react'
import { Image, StyleSheet, View, type ImageLoadEventData, type NativeSyntheticEvent } from 'react-native'
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
 * faixa da marca d'água encostada nela de verdade. Antes a moldura era
 * sempre 100%x100% do espaço disponível e a <Image resizeMode="contain">
 * desenhava a foto real menor lá dentro (letterbox, preservando a
 * proporção) -- a faixa (PreviaMarcaDagua, absolute bottom/left/right)
 * ficava presa na moldura inteira, não na foto de verdade, vazando pros
 * dois lados quando a proporção não batia com a tela (achado real,
 * relatado pelo usuário). onLoad devolve a proporção de verdade da
 * imagem; a moldura passa a ter essa MESMA proporção (aspectRatio),
 * então a faixa fica exatamente do tamanho da foto.
 *
 * Compartilhado entre nova-solicitacao.tsx e checklists/novo.tsx -- os
 * dois tinham essa composição repetida.
 */
export function FotoAmpliada({ uri, ...marcaDagua }: FotoAmpliadaProps) {
  const [aspecto, setAspecto] = useState<number | null>(null)

  return (
    <View style={styles.container}>
      <View style={[styles.moldura, aspecto ? { aspectRatio: aspecto } : styles.molduraSemAspecto]}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          onLoad={(evento: NativeSyntheticEvent<ImageLoadEventData>) => {
            const { width, height } = evento.nativeEvent.source
            if (width && height) setAspecto(width / height)
          }}
        />
        <PreviaMarcaDagua {...marcaDagua} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { width: '100%', height: '85%', alignItems: 'center', justifyContent: 'center' },
  // maxWidth/maxHeight (não width/height fixos): combinado com aspectRatio,
  // é isso que faz a moldura encolher pra caber no espaço disponível sem
  // esticar além da proporção real da foto -- mesmo efeito de "contain",
  // só que aplicado à moldura (que a faixa acompanha), não só à imagem.
  moldura: { maxWidth: '100%', maxHeight: '100%' },
  // Antes do onLoad resolver a proporção -- ocupa o espaço todo por
  // enquanto (mesmo comportamento de antes), corrige assim que souber.
  molduraSemAspecto: { width: '100%', height: '100%' },
})
