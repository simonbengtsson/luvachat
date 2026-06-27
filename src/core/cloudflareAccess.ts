import type { Member } from "luvabase/runtime"

export type CloudflareAccessSession = {
  id: string
  name: string
  imageUrl: string | null
}

export type CloudflareAccessEnv = Cloudflare.Env & {
  CF_ACCESS_AUD?: string
  CF_ACCESS_JWKS_URL?: string
  CF_MEMBERS_JSON?: string
}

const MISSING_CF_MEMBERS_JSON_MESSAGE =
  "Cloudflare Access is configured, but CF_MEMBERS_JSON is missing."
const MISSING_CF_ACCESS_AUD_MESSAGE =
  "Cloudflare Access is configured, but CF_ACCESS_AUD is missing."
const MISSING_CF_ACCESS_JWKS_URL_MESSAGE =
  "Cloudflare Access is configured, but CF_ACCESS_JWKS_URL is missing."
const MISSING_CF_ACCESS_JWT_MESSAGE =
  "Cloudflare Access is configured, but the request is missing the cf-access-jwt-assertion header."

export class CloudflareAccessConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CloudflareAccessConfigError"
  }
}

export function isCloudflareAccessConfigError(error: unknown): boolean {
  return (
    error instanceof CloudflareAccessConfigError ||
    (error instanceof Error &&
      (error.name === "CloudflareAccessConfigError"))
  )
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
  email: string
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
  return Boolean(request.headers.get("cf-access-jwt-assertion"))
}

export async function getCloudflareAccessSession(
  request: Request,
  env: CloudflareAccessEnv,
): Promise<CloudflareAccessSession> {
  validateCloudflareAccessSettings(env)
  const members = getCloudflareAccessMembers(env)

  const token = request.headers.get("cf-access-jwt-assertion")
  if (!token) {
    throw new CloudflareAccessConfigError(MISSING_CF_ACCESS_JWT_MESSAGE)
  }

  const payload = await verifyCloudflareAccessJwt(token, env)
  if (!payload.email) {
    throw new CloudflareAccessConfigError(
      "Cloudflare Access did not include an email claim.",
    )
  }

  const matchingMember = members.find((member) => member.id === payload.email)

  if (!matchingMember) {
    throw new CloudflareAccessConfigError(
      `You signed in as ${payload.email}, but that email is not listed in CF_MEMBERS_JSON.`,
    )
  }

  return {
    id: matchingMember.id,
    name: matchingMember.name || payload.name || matchingMember.id,
    imageUrl: matchingMember.imageUrl || payload.picture || null,
  }
}

export function getCloudflareAccessMembers(env: CloudflareAccessEnv): Member[] {
  const membersJson = env.CF_MEMBERS_JSON
  if (!membersJson) {
    throw new CloudflareAccessConfigError(MISSING_CF_MEMBERS_JSON_MESSAGE)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(membersJson)
  } catch {
    throw new CloudflareAccessConfigError("CF_MEMBERS_JSON is not valid JSON.")
  }

  if (!Array.isArray(parsed)) {
    throw new CloudflareAccessConfigError("CF_MEMBERS_JSON must be an array.")
  }

  return parsed.map((member) => {
    if (!isCloudflareAccessMemberInput(member)) {
      throw new CloudflareAccessConfigError(
        "Each CF_MEMBERS_JSON member must include an email.",
      )
    }

    return {
      id: member.email,
      type: member.type ?? "user",
      role: member.role ?? "member",
      name: member.name ?? member.email,
      imageUrl: member.imageUrl ?? null,
    }
  })
}

function isCloudflareAccessMemberInput(
  member: unknown,
): member is CloudflareAccessMemberInput {
  return (
    typeof member === "object" &&
    member !== null &&
    "email" in member &&
    typeof member.email === "string" &&
    Boolean(member.email)
  )
}

function validateCloudflareAccessSettings(env: CloudflareAccessEnv): void {
  if (!env.CF_ACCESS_AUD) {
    throw new CloudflareAccessConfigError(MISSING_CF_ACCESS_AUD_MESSAGE)
  }

  getCloudflareAccessJwksUrl(env)
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
  const jwksUrl = getCloudflareAccessJwksUrl(env)
  const issuer = new URL(jwksUrl).origin
  const audience = env.CF_ACCESS_AUD!

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

  const jwks = await getCloudflareAccessJwks(jwksUrl)
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

function getCloudflareAccessJwks(jwksUrl: string): Promise<Jwks> {
  const existing = jwksCache.get(jwksUrl)
  if (existing) {
    return existing
  }

  const request = fetch(jwksUrl)
    .then(async (response) => {
      if (!response.ok) {
        throw new CloudflareAccessConfigError(
          "CF_ACCESS_JWKS_URL did not return Cloudflare Access keys.",
        )
      }

      const jwks = (await response.json()) as Jwks
      if (!Array.isArray(jwks.keys)) {
        throw new CloudflareAccessConfigError(
          "CF_ACCESS_JWKS_URL did not return Cloudflare Access keys.",
        )
      }

      return jwks
    })
    .catch((error: unknown) => {
      if (error instanceof CloudflareAccessConfigError) {
        throw error
      }

      throw new CloudflareAccessConfigError(
        "CF_ACCESS_JWKS_URL did not return Cloudflare Access keys.",
      )
    })
  jwksCache.set(jwksUrl, request)
  return request
}

function getCloudflareAccessJwksUrl(env: CloudflareAccessEnv): string {
  const jwksUrl = env.CF_ACCESS_JWKS_URL
  if (!jwksUrl) {
    throw new CloudflareAccessConfigError(MISSING_CF_ACCESS_JWKS_URL_MESSAGE)
  }

  try {
    return new URL(jwksUrl).toString()
  } catch {
    throw new CloudflareAccessConfigError(
      "CF_ACCESS_JWKS_URL must be a valid URL.",
    )
  }
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
