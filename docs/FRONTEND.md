# Contrato do front · Nexus One

Leia inteiro antes de escrever uma linha. Vale para toda tela.

## Stack e regras duras

- TanStack Start (modo SPA, `ssr: false` no root), React 19, TanStack Router (rotas por arquivo em `src/routes`),
  TanStack Query, Tailwind v4, shadcn/ui em `src/components/ui`, lucide-react, sonner (toast), date-fns pt-BR,
  `@tanstack/react-table`, `@tanstack/react-virtual`, `@dnd-kit/*`, `motion`, recharts.
- **tsconfig estrito**: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `noPropertyAccessFromIndexSignature`. Prop opcional recebe `undefined` só se o tipo disser `| undefined`.
  Acesso a array/record devolve `T | undefined`. Zero `any`, zero `@ts-ignore`.
- `bunx tsc --noEmit` e `bun run build` precisam passar. Não edite `src/routeTree.gen.ts` (o build gera).
- Não edite arquivos fora da sua área sem necessidade. Os compartilhados abaixo são de leitura.
- Sem dado fictício. Toda lista lê do banco; vazio vira estado vazio que ensina o próximo passo.
- Toda ação tem estado de carregando, sucesso (toast curto) e erro (toast com a mensagem real, via `errorMessage`).
- Texto em português do Brasil, frases curtas, sem jargão técnico para o usuário final.
- Acessibilidade: botões com `aria-label` quando só têm ícone, foco visível, cor nunca sozinha.

## Onde fica cada coisa

| Caminho                                   | O que é                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/integrations/supabase/client.ts`     | `supabase` (tipado com `Database`)                                                                                    |
| `src/integrations/supabase/types.ts`      | Tipos das tabelas e RPCs. `Tables<"contacts">` etc.                                                                   |
| `src/lib/auth.tsx`                        | `useAuth()` → `{ user, session, signOut }`                                                                            |
| `src/lib/account.tsx`                     | `useAccount()` → `{ current, memberships, isManager, isAdmin, switchAccount }`; `useAccountId()`                      |
| `src/lib/functions.ts`                    | `callFunction<T>(name, body)` chama edge function com erro real; `errorMessage(err)`                                  |
| `src/lib/format.ts`                       | `formatMoney`, `formatListTime`, `formatRelative`, `formatDateTime`, `formatDayLabel`, `initials`, `formatPhone`      |
| `src/lib/media.ts`                        | `useSignedMediaUrl(path)`, `uploadOutgoingMedia(accountId, conversationId, file)`                                     |
| `src/components/brand/ChannelIcon.tsx`    | Logo oficial da rede: `<ChannelIcon platform="instagram" size={16} variant="color\|badge\|mono" />`; `PLATFORM_LABEL` |
| `src/components/common/ContactAvatar.tsx` | Avatar com selo do canal: `<ContactAvatar name src platform isGroup size />`                                          |
| `src/components/common/TempChip.tsx`      | Chip de temperatura: `<TempChip level="hot" score={92} />`; `TEMPERATURE_LABEL`                                       |
| `src/components/common/EmptyState.tsx`    | Estado vazio com ícone, título, descrição e ação                                                                      |
| `src/components/common/PageHeader.tsx`    | Cabeçalho padrão de página (`title`, `description`, `actions`)                                                        |
| `src/features/<area>/`                    | Código da sua área: `api.ts` (hooks de query/mutation), componentes em PascalCase                                     |

Padrão de dados: componentes de tela chamam hooks de `src/features/<area>/api.ts`; ninguém chama
`supabase.from` dentro de componente de apresentação. Chaves de query começam pelo domínio e incluem o
`accountId` (`["deals", accountId, pipelineId]`). Toda query filtra por `account_id` explicitamente,
mesmo com RLS.

## Sistema visual (tokens em `src/styles.css`)

Direção: **design system da Viver de IA** (https://viver-de-ia-ds.vercel.app). Regras que não se negociam:

1. Paleta restrita: navy `#0A1F3B` domina, cinzas estruturam, branco respira. Proibido acento quente
   (âmbar, laranja, amarelo), roxo "IA", cyan, magenta e neon. Coral (`danger`) só para erro e destrutivo;
   verde (`success`) só para status ao vivo e check. Cor de terceiro só no ícone da própria rede.
2. Pill canônica: `rounded-full`, 11px, peso 500, sem caixa alta, sem bolinha decorativa. Bolinha só
   para status ao vivo real (canal conectado, conectando).
3. Temperatura do lead é rampa de navy: quente = navy cheio, morno = azul-aço, frio = cinza. Sempre com rótulo.
4. Sombra pela tinta (`--ink-*`: navy no claro, preta no escuro), nunca branca.
5. Voz de operador: português direto, com número. Sem exclamação, sem emoji, sem "revolucione".

- Superfícies: `bg-background` (off-white `#F7F8FA`), `bg-surface` (card branco), `bg-surface-2`, `bg-surface-3`.
  No escuro: `#0B1220` / `#131C30` / `#1B273F`.
- Texto: `text-foreground` (navy), `text-muted-foreground`, `text-subtle`.
- Marca: `bg-primary` (navy no claro; no escuro vira superfície branca com texto navy, o botão "onnavy" do DS).
- Temperatura: `hot` / `warm` / `cold` com `-soft`, `-line`, `-fg`. Nota interna: `bg-note` (papel cinza).
- Gráficos: `chart-1..5`, rampa navy → azul-aço → névoa.
- Tipografia: só Geist (`font-sans` e `font-display`); `font-display` aplica tracking -0.025em. Contraste por
  peso (semibold) e cor, não por família. `tabular-nums` em números e horários.
- Assinaturas de comportamento (utilitários em `styles.css`): `row-wash` (linha lava de navy no hover;
  `data-selected="true"` pinta mais forte e põe marcador de 2px), `lift` (cartão sobe 3px), `atmosphere`
  (luz radial no canto superior esquerdo), `glass` (vidro do DS para métricas), `eyebrow` (rótulo em caixa alta).
- Marca: `Logo` (monograma VIA, versão branca no escuro) e `Wordmark` (monograma + Nexus One).

| Uso              | Classe                                                          |
| ---------------- | --------------------------------------------------------------- |
| Score grande     | `font-display text-5xl font-semibold tabular-nums`              |
| Título de página | `font-display text-[22px] font-semibold`                        |
| Valor em R$      | `font-display text-[15px] font-semibold tabular-nums`           |
| Corpo            | `text-[14px] leading-relaxed`                                   |
| Meta             | `text-[13px] text-muted-foreground` / `text-[11px] text-subtle` |
| Rótulo de seção  | `eyebrow`                                                       |

Raios: botão `rounded-full` (pill do DS), input `rounded-lg`, chip `rounded-full`, cartão e item `rounded-xl`,
bolha `rounded-2xl`. Movimento 180–260 ms em `cubic-bezier(.2,.7,.2,1)`, só `transform`/`opacity`.

Estados: linha com `row-wash` (hover e selecionada pelo DS); foco `focus-visible:ring-2 focus-visible:ring-ring`; active `active:scale-[0.98]`.

Evite: grade de cards iguais sem hierarquia, gradiente decorativo, cinza sobre branco sem acento, sombras em
tudo. Cada tela tem UM elemento de destaque (ex.: o "Próximo passo" da IA em `bg-primary`).

## Dados (resumo; detalhe em `supabase/migrations`)

- `channels`: `provider` (`whatsapp_cloud|evolution|zernio|zadarma|webchat|email`; `zadarma` com `platform` `sms`), `platform`
  (`whatsapp|instagram|facebook|linkedin|tiktok|telegram|x|...`), `status`, `handle`, `owner_user_id`, `is_shared`.
- `contacts`: dados de cadastro + IA (`score` 0-100, `temperature` hot/warm/cold, `ai_intent`, `ai_summary`,
  `ai_next_step`, `classified_at`), `lifecycle` (lead/opportunity/customer/inactive), `tags[]`, `owner_user_id`.
- `contact_identities`: uma pessoa, várias identidades por plataforma.
- `conversations`: `channel_id`, `contact_id` (null em grupo), `is_group`, `title`, `status`
  (open/pending/snoozed/closed), `assignee_user_id`, `unread_count`, `last_message_at`, `last_message_preview`,
  `last_inbound_at` (janela de 24 h).
- `messages`: `direction` in/out, `sender_type` contact/user/ai/system, `type` (text/image/audio/video/document/
  note/...), `body`, `media_url` (caminho no bucket `media`), `transcript`, `is_private` (nota interna),
  `status` (queued/sent/delivered/read/failed/received), `error`, `sender_name` (autor em grupo).
- `pipelines`, `pipeline_stages` (`kind` open/won/lost, `probability`, `color`), `deals` (`stage_id`, `value`,
  `position` float, `status` acompanha o `kind` da etapa por trigger, `owner_user_id`, `source`).
- `activities` (linha do tempo: note/call/task/meeting/stage_change/ai), `events` (agenda),
  `ai_classifications` (histórico), `memberships` (papéis owner/admin/manager/agent/seller), `invites`.
- Realtime ligado em `messages`, `conversations`, `deals`.
- RPCs: `dashboard_stats(_account, _days)`, `mark_conversation_read(_conversation)`, `bootstrap_account`,
  `accept_invite`, `invite_preview`, `secret_keys(_account, _scope, _scope_id)`.

## Edge functions (via `callFunction`)

- `send-message`: `{ accountId, conversationId, text?, mediaPath?, mediaMime?, mediaName?, template? }`
  → `{ ok, messageId }`. Erro `window_closed` (409) = fora da janela de 24 h no WhatsApp oficial.
  Nota interna NÃO passa aqui: insert direto em `messages` com `is_private: true, type: "note",
direction: "out", sender_type: "user", sender_user_id: user.id`.
- `ai`: `{ accountId, action: "classify", contactId }` → `{ score, temperature, intent, summary, next_step }`;
  `{ accountId, action: "suggest", conversationId }` → `{ suggestions: [{ label, text }] }`.
- `channels` (só admin): `integration.save { provider: evolution|zernio|openai|anthropic, apiKey?, baseUrl?, model? }`,
  `evolution.create { name, ownerUserId?, isShared? }` → `{ channelId, qr, pairingCode }`,
  `evolution.qr|status|logout|delete|sync_groups { channelId }`,
  `zernio.connect_url { platform, redirectUrl }` → `{ url }`, `zernio.sync` → `{ synced }`,
  `meta.connect { name?, phoneNumberId, wabaId, accessToken, appSecret }` → `{ channelId, webhookUrl, verifyToken }`,
  `meta.templates { channelId }`, `channel.webhook_info { channelId }`.
