-- A IA nascia desligada em todo canal (channels.ai_enabled default false) e só o chat do site a
-- ligava: WhatsApp, Instagram, Messenger, SMS, Telegram e e-mail nunca chamavam o agente.
-- Agora nasce ligada; quem decide quem atende é o agente ativo do canal (sem agente ativo,
-- nada responde). Grupo e e-mail automático o orquestrador já barra. Desligar: tela de Canais.
alter table public.channels alter column ai_enabled set default true;
update public.channels set ai_enabled = true where not ai_enabled;
