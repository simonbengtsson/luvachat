import type { Member } from "luvabase/runtime"

export type CloudflareAccessSession = {
  id: string
  name: string
  imageUrl: string | null
}

export type CloudflareAccessEnv = Cloudflare.Env & {
  CF_ACCESS_AUD?: string
  CF_ACCESS_TEAM_DOMAIN?: string
  MEMBERS_JSON?: string
}

type CloudflareAccessJwtHeader = {
  alg?: string
  kid?: string
}

type CloudflareAccessJwtPayload = {
  aud?: string | string[]
  email?: string
  exp?: number
  iat?: number
  iss?: string
  name?: string
  nbf?: number
  picture?: string
  sub?: string
}

type CloudflareAccessMemberInput = {
  id?: string
  type?: Member["type"]
  role?: string
  name?: string
  imageUrl?: string | null
}

type CloudflareAccessJwk = JsonWebKey & {
  kid?: string
}

type Jwks = {
  keys?: CloudflareAccessJwk[]
}

const jwksCache = new Map<string, Promise<Jwks>>()

export function hasCloudflareAccessConfig(
  request: Request,
  env: CloudflareAccessEnv | undefined,
): boolean {
  return Boolean(
    request.headers.get("cf-access-jwt-assertion") &&
      env?.CF_ACCESS_AUD &&
      env.CF_ACCESS_TEAM_DOMAIN &&
      env.MEMBERS_JSON,
  )
}

export async function getCloudflareAccessSession(
  request: Request,
  env: CloudflareAccessEnv,
): Promise<CloudflareAccessSession> {
  const token = request.headers.get("cf-access-jwt-assertion")
  if (!token) {
    throw new Error("Missing Luvabase user headers or Cloudflare Access JWT")
  }

  const payload = await verifyCloudflareAccessJwt(token, env)
  const members = getCloudflareAccessMembers(env)
  const matchingMember = members.find(
    (member) => member.id === payload.email || member.id === payload.sub,
  )

  if (!matchingMember) {
    throw new Error("Cloudflare Access user is not listed in MEMBERS_JSON")
  }

  return {
    id: matchingMember.id,
    name: matchingMember.name || payload.name || matchingMember.id,
    imageUrl: matchingMember.imageUrl || payload.picture || null,
  }
}

export function getCloudflareAccessMembers(env: CloudflareAccessEnv): Member[] {
  const membersJson = env.MEMBERS_JSON
  if (!membersJson) {
    throw new Error("Missing MEMBERS_JSON")
  }

  const parsed = JSON.parse(membersJson) as CloudflareAccessMemberInput[]
  if (!Array.isArray(parsed)) {
    throw new Error("MEMBERS_JSON must be an array")
  }

  return parsed
    .filter((member): member is CloudflareAccessMemberInput & { id: string } =>
      Boolean(member?.id),
    )
    .map((member) => ({
      id: member.id,
      type: member.type ?? "user",
      role: member.role ?? "member",
      name: member.name ?? member.id,
      imageUrl: member.imageUrl ?? null,
    }))
}

async function verifyCloudflareAccessJwt(
  token: string,
  env: CloudflareAccessEnv,
): Promise<CloudflareAccessJwtPayload> {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".")
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Invalid Cloudflare Access JWT")
  }

  const header = decodeJwtPart<CloudflareAccessJwtHeader>(encodedHeader)
  const payload = decodeJwtPart<CloudflareAccessJwtPayload>(encodedPayload)
  const issuer = getCloudflareAccessIssuer(env)
  const audience = env.CF_ACCESS_AUD

  if (!audience) {
    throw new Error("Missing CF_ACCESS_AUD")
  }

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported Cloudflare Access JWT")
  }

  if (payload.iss !== issuer || !hasAudience(payload.aud, audience)) {
    throw new Error("Invalid Cloudflare Access JWT claims")
  }

  const now = Math.floor(Date.now() / 1000)
  if (
    (typeof payload.nbf === "number" && payload.nbf > now) ||
    (typeof payload.exp === "number" && payload.exp <= now)
  ) {
    throw new Error("Expired Cloudflare Access JWT")
  }

  const jwks = await getCloudflareAccessJwks(issuer)
  const jwk = jwks.keys?.find((key) => key.kid === header.kid)
  if (!jwk) {
    throw new Error("Unknown Cloudflare Access JWT key")
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  )
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(encodedSignature),
    encodeUtf8(`${encodedHeader}.${encodedPayload}`),
  )

  if (!verified) {
    throw new Error("Invalid Cloudflare Access JWT signature")
  }

  if (!payload.email && !payload.sub) {
    throw new Error("Cloudflare Access JWT is missing user identity")
  }

  return payload
}

function getCloudflareAccessJwks(issuer: string): Promise<Jwks> {
  const existing = jwksCache.get(issuer)
  if (existing) {
    return existing
  }

  const request = fetch(new URL("/cdn-cgi/access/certs", issuer)).then(
    (response) => {
      if (!response.ok) {
        throw new Error("Failed to load Cloudflare Access keys")
      }

      return response.json() as Promise<Jwks>
    },
  )
  jwksCache.set(issuer, request)
  return request
}

function getCloudflareAccessIssuer(env: CloudflareAccessEnv): string {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN
  if (!teamDomain) {
    throw new Error("Missing CF_ACCESS_TEAM_DOMAIN")
  }

  const withProtocol = teamDomain.startsWith("https://")
    ? teamDomain
    : `https://${teamDomain}`
  return new URL(withProtocol).origin
}

function hasAudience(
  tokenAudience: CloudflareAccessJwtPayload["aud"],
  expectedAudience: string,
): boolean {
  return Array.isArray(tokenAudience)
    ? tokenAudience.includes(expectedAudience)
    : tokenAudience === expectedAudience
}

function decodeJwtPart<T>(part: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(part))) as T
}

function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  )
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index)
  }
  return toArrayBuffer(bytes)
}

function encodeUtf8(value: string): ArrayBuffer {
  return toArrayBuffer(new TextEncoder().encode(value))
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}
