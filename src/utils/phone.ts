/**
 * Utilitários para manipulação de números de telefone WhatsApp
 */

/**
 * Formata número para o padrão JID do WhatsApp
 * Ex: "11999999999" -> "5511999999999@s.whatsapp.net"
 */
export function toJid(phone: string): string {
  // Remove tudo que não for dígito
  const digits = phone.replace(/\D/g, '')

  // Se já é um JID completo, retorna como está
  if (phone.includes('@')) return phone

  // Adiciona código do Brasil se não tiver
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`

  return `${withCountry}@s.whatsapp.net`
}

/**
 * Extrai o número limpo de um JID
 */
export function fromJid(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', '')
}

/**
 * Verifica se é um JID de grupo
 */
export function isGroup(jid: string): boolean {
  return jid.endsWith('@g.us')
}

/**
 * Verifica se é um número válido para WhatsApp
 */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15
}

/**
 * Formata número brasileiro adicionando 9 no celular se necessário
 */
export function formatBrazilianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`

  // DDD + número
  if (withCountry.length === 12) {
    // Celular sem 9: 5511 + 8 dígitos -> adiciona 9
    const ddd = withCountry.slice(2, 4)
    const number = withCountry.slice(4)
    return `55${ddd}9${number}`
  }

  return withCountry
}
