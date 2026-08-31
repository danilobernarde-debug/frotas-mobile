import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useAuth } from '../../src/auth/useAuth'

export default function TelaEntrar() {
  const { entrar } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar() {
    if (!email || !senha) {
      setErro('Informe e-mail e senha.')
      return
    }
    setErro(null)
    setCarregando(true)
    const { erro: erroLogin } = await entrar(email.trim(), senha)
    setCarregando(false)
    if (erroLogin) setErro('E-mail ou senha incorretos.')
    // Sucesso: o AuthProvider atualiza a sessão, e (auth)/_layout.tsx
    // redireciona sozinho pro app -- não precisa navegar manualmente aqui.
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.conteudo}>
        <Text style={styles.titulo}>Gestão de Frotas</Text>

        <View style={styles.campo}>
          <Text style={styles.rotulo}>E-mail</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={!carregando}
          />
        </View>

        <View style={styles.campo}>
          <Text style={styles.rotulo}>Senha</Text>
          <TextInput
            style={styles.input}
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
            autoComplete="password"
            editable={!carregando}
          />
        </View>

        {erro && <Text style={styles.erro}>{erro}</Text>}

        <Pressable
          onPress={enviar}
          disabled={carregando}
          style={({ pressed }) => [styles.botao, (pressed || carregando) && styles.botaoPressionado]}
        >
          {carregando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.botaoTexto}>Entrar</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  conteudo: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  titulo: { fontSize: 24, fontWeight: '700', color: '#0f172a', textAlign: 'center', marginBottom: 32 },
  campo: { marginBottom: 16 },
  rotulo: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  erro: { color: '#be123c', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  botao: {
    backgroundColor: '#0d9488',
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  botaoPressionado: { opacity: 0.8 },
  botaoTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
