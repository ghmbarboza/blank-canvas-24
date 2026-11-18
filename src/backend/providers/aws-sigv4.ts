// Assinatura AWS Signature Version 4 com node:crypto (sem SDK). Usada pelo Amazon SES v2.
// Referência: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
import { createHash, createHmac } from "node:crypto";

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | null;
}

export interface SignInput {
  method: string;
  url: string;
  region: string;
  service: string;
  headers?: Record<string, string>;
  body?: string;
  credentials: AwsCredentials;
  /** Instante da assinatura (testes fixam). */
  date?: Date;
}

export interface Signed {
  headers: Record<string, string>;
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
}

const ALGORITHM = "AWS4-HMAC-SHA256";

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/** Codificação RFC 3986 exigida pela AWS (encodeURIComponent deixa passar !'()*). */
export function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** 20150830T123600Z */
export function amzDate(d: Date): string {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

export function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function canonicalUri(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname
    .split("/")
    .map((seg) => rfc3986(decodeURIComponent(seg)))
    .join("/");
}

function canonicalQuery(search: URLSearchParams): string {
  return [...search.entries()]
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

export function signRequest(input: SignInput): Signed {
  const url = new URL(input.url);
  const date = input.date ?? new Date();
  const stamp = amzDate(date);
  const dateStamp = stamp.slice(0, 8);
  const body = input.body ?? "";

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers ?? {})) headers[k.toLowerCase()] = v;
  headers["host"] = url.host;
  headers["x-amz-date"] = stamp;
  if (input.credentials.sessionToken)
    headers["x-amz-security-token"] = input.credentials.sessionToken;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names
    .map((n) => `${n}:${headers[n]!.trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri(url.pathname),
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    sha256Hex(body),
  ].join("\n");

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [ALGORITHM, stamp, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac(
    "sha256",
    signingKey(input.credentials.secretAccessKey, dateStamp, input.region, input.service),
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  return {
    headers: {
      ...headers,
      authorization: `${ALGORITHM} Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    canonicalRequest,
    stringToSign,
    signature,
  };
}
