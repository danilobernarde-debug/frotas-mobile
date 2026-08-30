import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PreviaMarcaDagua } from './PreviaMarcaDagua'

export interface ContextoMarcaDagua {
  nomeMotorista?: string | null
  placa?: string | null
  latitude?: number
  longitude?: number
  localizacaoRotulo?: string
}

interface PedidoAberto {
  marcaDagua?: ContextoMarcaDagua
  resolver: (uri: string | null) => void
}

// Registrado pelo host (montado 1x em app/_layout.tsx) -- ver comentário
// em CameraCustomizadaHost sobre o porquê deste sistema ser imperativo.
let abrirRef: ((marcaDagua?: ContextoMarcaDagua) => Promise<string | null>) | null = null

/**
 * Chamado de fora da árvore React (capturarFoto.ts) -- imperativo de
 * propósito, pra não precisar mudar a assinatura de quem já chama
 * capturarFoto() hoje (useCapturaComLocal, useFormularioSolicitacao,
 * checklists/novo.tsx). Se o host ainda não montou por algum motivo,
 * devolve null (mesmo "cancelou" que capturarFoto() já tratava antes).
 */
export function abrirCameraCustomizada(marcaDagua?: ContextoMarcaDagua): Promise<string | null> {
  if (!abrirRef) return Promise.resolve(null)
  return abrirRef(marcaDagua)
}

/**
 * Monta 1x no layout raiz -- o modal em si só aparece quando alguma tela
 * chama abrirCameraCustomizada(). Substitui a antiga
 * ImagePicker.launchCameraAsync() (câmera do sistema operacional) porque
 * só uma câmera dentro do próprio app permite desenhar a marca d'água por
 * cima do visor ao vivo e controlar o flash programaticamente (os dois
 * pedidos do usuário) -- nenhum dos dois é possível sobre a UI da câmera
 * do sistema.
 */
export function CameraCustomizadaHost() {
  const [pedido, setPedido] = useState<PedidoAberto | null>(null)
  // 'off' por padrão sempre que abre -- pedido do usuário (antes a câmera
  // do sistema decidia sozinha, geralmente 'auto').
  const [flash, setFlash] = useState<FlashMode>('off')
  const [facing] = useState<CameraType>('back')
  const [capturando, setCapturando] = useState(false)
  const [permissao, pedirPermissao] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)
  // Evita pedir a permissão de novo a cada re-render enquanto o diálogo
  // ainda não respondeu -- mesmo cuidado já tomado em obterLocalizacaoAtual
  // (src/lib/localizacao.ts) depois de um bug real visto em teste
  // (diálogo do sistema empilhando/travando).
  const pedindoPermissao = useRef(false)

  useEffect(() => {
    abrirRef = (marcaDagua) =>
      new Promise((resolve) => {
        setFlash('off')
        setPedido({ marcaDagua, resolver: resolve })
      })
    return () => {
      abrirRef = null
    }
  }, [])

  function fechar(uri: string | null) {
    setPedido((atual) => {
      atual?.resolver(uri)
      return null
    })
    pedindoPermissao.current = false
  }

  useEffect(() => {
    if (!pedido || permissao?.granted || pedindoPermissao.current) return
    if (permissao?.canAskAgain === false) {
      fechar(null)
      return
    }
    pedindoPermissao.current = true
    pedirPermissao().then((r) => {
      pedindoPermissao.current = false
      if (!r.granted) fechar(null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, permissao?.granted])

  async function tirarFoto() {
    if (!cameraRef.current || capturando) return
    setCapturando(true)
    try {
      const foto = await cameraRef.current.takePictureAsync({ quality: 1 })
      fechar(foto?.uri ?? null)
    } catch {
      fechar(null)
    } finally {
      setCapturando(false)
    }
  }

  if (!pedido) return null

  // Pedido de permissão em si fica no useEffect acima -- aqui só decide o
  // que renderizar enquanto ainda não veio resposta.
  if (!permissao?.granted) {
    return (
      <Modal visible animationType="fade">
        <View style={styles.carregando}>
          <ActivityIndicator color="#0d9488" />
        </View>
      </Modal>
    )
  }

  return (
    <Modal visible animationType="slide" onRequestClose={() => fechar(null)}>
      <View style={styles.tela}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash} />

        {pedido.marcaDagua && (
          <View style={styles.marcaDaguaPosicao} pointerEvents="none">
            <PreviaMarcaDagua
              capturadaEm={new Date().toISOString()}
              nomeMotorista={pedido.marcaDagua.nomeMotorista}
              placa={pedido.marcaDagua.placa}
              latitude={pedido.marcaDagua.latitude}
              longitude={pedido.marcaDagua.longitude}
              localizacaoRotulo={pedido.marcaDagua.localizacaoRotulo}
            />
          </View>
        )}

        <SafeAreaView style={styles.topo} edges={['top']}>
          <Pressable onPress={() => fechar(null)} style={styles.botaoTopo} hitSlop={10}>
            <Text style={styles.botaoTopoTexto}>✕ Fechar</Text>
          </Pressable>
          <Pressable
            onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))}
            style={styles.botaoTopo}
            hitSlop={10}
          >
            <Text style={styles.botaoTopoTexto}>{flash === 'off' ? '⚡️ Flash desligado' : '⚡️ Flash ligado'}</Text>
          </Pressable>
        </SafeAreaView>

        <SafeAreaView style={styles.rodape} edges={['bottom']}>
          <Pressable onPress={tirarFoto} disabled={capturando} style={styles.botaoCapturar}>
            {capturando && <ActivityIndicator color="#0f172a" />}
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  carregando: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  tela: { flex: 1, backgroundColor: '#000' },
  // 96 (altura aproximada do rodape) + folga -- fica acima do botão de
  // capturar em vez de disputar o mesmo espaço (PreviaMarcaDagua já se
  // posiciona sozinha em bottom:0 dentro deste container).
  marcaDaguaPosicao: { position: 'absolute', left: 0, right: 0, bottom: 110 },
  topo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  botaoTopo: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  botaoTopoTexto: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rodape: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 24,
  },
  botaoCapturar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
