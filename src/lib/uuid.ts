/**
 * UUID v4 simples, com Math.random(). Serve pra chave de idempotência
 * local (origem_local_id) e id de item da fila -- só precisa ser
 * praticamente único, não imprevisível/criptográfico, então não vale
 * puxar expo-crypto só por isso.
 */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
