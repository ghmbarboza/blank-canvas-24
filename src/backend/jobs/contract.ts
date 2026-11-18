// Contrato entre os módulos da plataforma. Quem produz um job ou evento e quem consome
// seguem estes nomes e formatos. Mudou aqui, muda dos dois lados.

/** Tipos de job (tabela public.jobs, coluna kind) e o payload de cada um. */
export interface JobPayloads {
  /** Notificação no app (já implementado em handlers/notifications.server.ts). */
  "notify.user": {
    user_id: string;
    kind?: string;
    title: string;
    body?: string | null;
    link?: string | null;
  };
  /** Canais extras de uma notificação já gravada (e-mail e push), conforme public.notification_prefs. */
  "notify.deliver": { notification_id: string; email: boolean; push: boolean };
  /** E-mail (módulo de e-mail). category=marketing respeita supressão, consentimento e descadastro. */
  "email.send": {
    to_email: string;
    to_contact_id?: string | null;
    subject: string;
    html: string;
    text?: string | null;
    category: "transactional" | "marketing";
    campaign_id?: string | null;
    automation_run_id?: string | null;
    template_id?: string | null;
    from_user_id?: string | null;
    reply_to?: string | null;
    /** Anexos em base64 (ex.: convite.ics da reunião). Acrescentado pela fase de reuniões. */
    attachments?: { filename: string; content: string; content_type?: string }[];
  };
  /** Lote de campanha de e-mail (módulo de e-mail); reenfileira a si mesmo com o cursor. */
  "email.campaign": { campaign_id: string; cursor: string | null };
  /** WhatsApp (módulo de automação/mensageria). Fora da janela de 24 h exige template. */
  "whatsapp.send": {
    contact_id: string;
    text?: string | null;
    template?: { name: string; language: string; params?: string[] } | null;
    category: "service" | "marketing" | "utility";
    automation_run_id?: string | null;
  };
  /** SMS pela Zadarma (módulo de telefonia). */
  "sms.send": {
    contact_id?: string | null;
    to?: string | null;
    text: string;
    automation_run_id?: string | null;
  };
  /** Ligação da IA de voz (módulo de telefonia). */
  "voice.call": {
    contact_id: string;
    voice_agent_id: string;
    campaign_id?: string | null;
    context?: Record<string, unknown>;
    automation_run_id?: string | null;
  };
  /** Tarefa para um vendedor (módulo de automação). */
  "task.create": {
    contact_id?: string | null;
    deal_id?: string | null;
    user_id?: string | null;
    title: string;
    type: "task" | "call" | "email" | "whatsapp" | "meeting";
    due_in_minutes?: number;
  };
  /** Reuniões (módulo de reuniões). */
  "meeting.invite": { meeting_id: string; rescheduled?: boolean };
  /** start = horário para o qual o lembrete foi agendado; se a reunião mudou, o lembrete é ignorado. */
  "meeting.reminder": { meeting_id: string; kind: "24h" | "1h"; start?: string };
  /** Briefing da IA para o anfitrião, 30 min antes. */
  "meeting.briefing": { meeting_id: string };
  /** Contato não apareceu: manda o link para remarcar. */
  "meeting.no_show": { meeting_id: string };
  "meeting.minutes": { meeting_id: string };
  /** Executa o próximo passo de uma automação (módulo de automação). */
  "automation.step": { run_id: string; seq?: number; wake?: boolean };
  /** Varredura periódica dos gatilhos por segmento, "sem resposta" e data (módulo de automação). */
  "automation.scan": Record<string, never>;
  /** Pós-chamada: baixar gravação, transcrever, resumir (módulo de telefonia). */
  "call.process": { call_id: string };
  /** Ligação da Zernio: traz gravação e transcrição e agenda call.process. */
  "zernio.call_sync": { call_id: string; zernio_call_id: string };
  /** Aviso da Zernio gravado em inbound_events, processado fora da requisição do webhook. */
  "zernio.event": { event_id: number };
  /** Pós-atendimento pela IA (resumo, tabulação, próxima ação) de um item da fila única. */
  "workitem.wrapup": { work_item_id: string; force?: boolean };
  /** Relatório salvo enviado por e-mail no agendamento (módulo de relatórios). */
  "report.send": { saved_report_id: string };
  /** Classificação do lead pela IA (score, interesse no catálogo, negócio). */
  "ai.classify": { contact_id: string };
  /** Transcrever áudio recebido no WhatsApp (issue #1). */
  "audio.transcribe": { message_id: string };
  /** Agente de IA responde na conversa (issue #3); dedupe "ai.reply:<conversa>" junta mensagens seguidas. */
  "ai.reply": { conversation_id: string; message_id?: string | null };
  /** Resposta automática fora do horário (#65); dedupe "away:<conversa>". */
  "inbox.away": { conversation_id: string };
  /** Descadastro por palavra-chave no WhatsApp/SMS (#67); dedupe "optout:<mensagem>". */
  "inbox.optout": { message_id: string };
  /** Pesquisa de satisfação ao fechar a conversa (#68), enfileirada pelo gatilho do banco. */
  "conversation.csat": { conversation_id: string };
  /** Campanha de WhatsApp (#67): um lote por rodada, reagenda até acabar. */
  "whatsapp.campaign": { campaign_id: string };
  "whatsapp.campaign_start": { campaign_id: string; at: string };
  /** Pesquisa de satisfação (CSAT) depois de resolver um chamado. */
  "support.csat": { ticket_id: string };
  /** Recalcula o embedding de um artigo da base de conhecimento. */
  "kb.embed": { article_id: string };
  /** Alerta de termo monitorado na transcrição (depois da ata ou do pós-chamada). */
  "terms.alert": { source: "meeting" | "call"; source_id: string };
  /** Grava, atualiza ou apaga o evento da reunião na agenda pessoal do anfitrião (Google/Outlook). */
  "calendar.push": { meeting_id: string };
  /** Lê as mudanças de uma agenda conectada e reflete nas reuniões nossas (periódica, 10 min). */
  "calendar.pull": { connection_id: string };
  /** Qualidade: avalia uma interação terminada (conversa ou ligação) pelo formulário do canal. */
  "quality.evaluate": {
    source: "conversation" | "call";
    source_id: string;
    interaction_start: string | null;
    interaction_end: string;
  };
  /** Chamado resolvido sem artigo vira rascunho sugerido pela IA na base de conhecimento. */
  "kb.draft": { ticket_id: string };
  /** Lead novo sem dono: roteamento por território, segmento e rodízio. */
  "lead.route": { contact_id: string };
  /** Flow CRM (Integrações): contato novo vira lead lá; venda ganha/perdida vira anotação. */
  "flowcrm.push": { event: "contact.created" | "deal.won" | "deal.lost"; entity_id: string };
  /** Retreina a pontuação preditiva e o horário ideal por contato (diário). */
  "sdr.train": Record<string, never>;
  /** Equipe de IA: um lote da suíte de avaliação; reenfileira até acabar. activate liga se passar. */
  "agents.eval": { run_id: string; activate?: boolean };
  "agents.suite": { agent_id: string; user_id?: string | null };
}
export type JobKind = keyof JobPayloads;

/**
 * Eventos de domínio (public.domain_events, coluna type = "<entidade>.<acao>").
 * Gatilhos de automação e webhooks de saída usam estes nomes.
 */
export const DOMAIN_EVENTS = [
  "contact.created",
  "contact.became_hot",
  "contact.lifecycle_changed",
  "deal.created",
  "deal.stage_changed",
  "deal.won",
  "deal.lost",
  "message.received",
  "form.submitted",
  "meeting.scheduled",
  "meeting.ended",
  "meeting.no_show",
  "meeting.confirmed",
  "meeting.canceled",
  "meeting.rescheduled",
  "call.ended",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.unsubscribed",
  "ticket.created",
  "ticket.resolved",
  "ticket.sla_warning",
  "ticket.sla_breached",
  "proposal.viewed",
  "proposal.accepted",
  "payment.confirmed",
] as const;
export type DomainEventType = (typeof DOMAIN_EVENTS)[number];

/**
 * Linha do tempo 360: cada módulo cria public.timeline_part_<modulo>(_contact uuid)
 * returns table (kind text, ref_id uuid, at timestamptz, title text, body text, meta jsonb),
 * security invoker. public.contact_timeline une todas as partes (refeita na integração).
 * kinds usados: message, activity, event, deal, classification, consent, email, call, meeting,
 * ticket, proposal, payment, form.
 */
export const TIMELINE_KINDS = [
  "message",
  "activity",
  "event",
  "deal",
  "classification",
  "consent",
  "email",
  "call",
  "meeting",
  "ticket",
  "proposal",
  "payment",
  "form",
] as const;
