// LiveKit sem SDK: tokens JWT (HS256) e chamadas Twirp do RoomService/Egress.
import { createHash, createHmac } from "node:crypto";

import { publicFetch } from "@/backend/net-guard.server";

export interface LiveKitCreds {
  url: string; // wss://...
  apiKey: string;
  apiSecret: string;
}

export interface VideoGrant {
  room?: string;
  roomJoin?: boolean;
  roomCreate?: boolean;
  roomList?: boolean;
  roomAdmin?: boolean;
  roomRecord?: boolean;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
  canPublishSources?: string[];
  hidden?: boolean;
  agent?: boolean;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function livekitToken(
  creds: LiveKitCreds,
  opts: {
    identity: string;
    name?: string;
    ttlSeconds?: number;
    video: VideoGrant;
    metadata?: string;
    attributes?: Record<string, string>;
  },
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: creds.apiKey,
    sub: opts.identity,
    nbf: now - 10,
    exp: now + (opts.ttlSeconds ?? 3600),
    jti: `${opts.identity}-${now}`,
    ...(opts.name ? { name: opts.name } : {}),
    ...(opts.metadata ? { metadata: opts.metadata } : {}),
    ...(opts.attributes ? { attributes: opts.attributes } : {}),
    video: opts.video,
  };
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", creds.apiSecret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

export function httpUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/$/, "");
}

async function twirp<T>(
  creds: LiveKitCreds,
  service: string,
  method: string,
  body: unknown,
  grant: VideoGrant,
): Promise<T> {
  const token = livekitToken(creds, { identity: "nexus-server", ttlSeconds: 120, video: grant });
  // o endereço do LiveKit é cadastrado pelo admin: só host público, sem redirecionamento (R8)
  const res = await publicFetch(`${httpUrl(creds.url)}/twirp/livekit.${service}/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LiveKit ${method} ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export function listRooms(creds: LiveKitCreds) {
  return twirp<{ rooms?: { name: string; num_participants?: number }[] }>(
    creds,
    "RoomService",
    "ListRooms",
    {},
    { roomList: true },
  );
}

export function createRoom(
  creds: LiveKitCreds,
  name: string,
  metadata: string,
  emptyTimeout = 600,
) {
  return twirp(
    creds,
    "RoomService",
    "CreateRoom",
    { name, metadata, empty_timeout: emptyTimeout, max_participants: 30 },
    { roomCreate: true },
  );
}

export function sendData(
  creds: LiveKitCreds,
  room: string,
  data: string,
  destinationIdentities: string[],
  topic: string,
) {
  return twirp(
    creds,
    "RoomService",
    "SendData",
    {
      room,
      data: Buffer.from(data).toString("base64"),
      kind: "RELIABLE",
      destination_identities: destinationIdentities,
      topic,
    },
    { roomAdmin: true, room },
  );
}

export type RecordMode = "audio" | "video";

/** Gravação da sala: "audio" sai em OGG; "video" sai em MP4 no layout de quem está falando. */
export function startRoomEgress(
  creds: LiveKitCreds,
  room: string,
  filepathBase: string,
  mode: RecordMode,
  s3: Record<string, string> | null,
) {
  const video = mode === "video";
  return twirp<{ egress_id: string }>(
    creds,
    "Egress",
    "StartRoomCompositeEgress",
    {
      room_name: room,
      ...(video ? { layout: "speaker" } : { audio_only: true }),
      file_outputs: [
        {
          file_type: video ? "MP4" : "OGG",
          filepath: `${filepathBase}.${video ? "mp4" : "ogg"}`,
          ...(s3 ? { s3 } : {}),
        },
      ],
    },
    { roomRecord: true, room },
  );
}

/** Libera (ou tira) publicação de quem está na sala de espera. */
export function updateParticipantPermission(
  creds: LiveKitCreds,
  room: string,
  identity: string,
  allow: boolean,
) {
  return twirp(
    creds,
    "RoomService",
    "UpdateParticipant",
    {
      room,
      identity,
      permission: {
        can_subscribe: allow,
        can_publish: allow,
        can_publish_data: allow,
      },
    },
    { roomAdmin: true, room },
  );
}

export function removeParticipant(creds: LiveKitCreds, room: string, identity: string) {
  return twirp(
    creds,
    "RoomService",
    "RemoveParticipant",
    { room, identity },
    { roomAdmin: true, room },
  );
}

export function deleteRoom(creds: LiveKitCreds, room: string) {
  return twirp(creds, "RoomService", "DeleteRoom", { room }, { roomCreate: true, room });
}

export async function livekitTest(creds: LiveKitCreds): Promise<string> {
  const r = await listRooms(creds);
  return `Servidor respondeu. Salas ativas agora: ${r.rooms?.length ?? 0}`;
}

// Webhook do LiveKit: Authorization é um JWT assinado com o api_secret contendo sha256 do corpo.
export function verifyLivekitWebhook(
  creds: LiveKitCreds,
  authHeader: string | null,
  rawBody: string,
): boolean {
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return false;
  const expected = b64url(createHmac("sha256", creds.apiSecret).update(`${h}.${p}`).digest());
  if (expected !== s) return false;
  try {
    const payload = JSON.parse(Buffer.from(p, "base64").toString()) as {
      sha256?: string;
      iss?: string;
      exp?: number;
    };
    if (payload.iss !== creds.apiKey) return false;
    // webhook sem expiração poderia ser reenviado para sempre
    if (!payload.exp || payload.exp < Date.now() / 1000) return false;
    const digest = createHash("sha256").update(rawBody).digest("base64");
    return payload.sha256 === digest;
  } catch {
    return false;
  }
}
