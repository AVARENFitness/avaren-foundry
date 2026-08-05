import { generateKeyPairSync } from 'node:crypto'

const base64url = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
})

const publicJwk = publicKey.export({ format: 'jwk' })
const privateJwk = privateKey.export({ format: 'jwk' })

const x = Buffer.from(publicJwk.x, 'base64url')
const y = Buffer.from(publicJwk.y, 'base64url')
const uncompressedPublicKey = Buffer.concat([
  Buffer.from([0x04]),
  x,
  y,
])

console.log('')
console.log('AVAREN VAPID KEYS')
console.log('==================')
console.log(`Public Key:  ${base64url(uncompressedPublicKey)}`)
console.log(`Private Key: ${privateJwk.d}`)
console.log('')
console.log('Keep the private key secret. Do not commit it to GitHub.')
