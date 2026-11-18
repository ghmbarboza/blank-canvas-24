-- Telefonia só pela Zadarma (decisão de 04/11/2026): a Twilio saiu do código.
-- Nada é apagado: o canal SMS e o número antigos ficam desligados, com o aviso na tela,
-- e o histórico de conversas e ligações continua onde está.
update public.channels
   set status = 'error',
       status_detail = 'A Twilio saiu do Nexus: este SMS foi desligado. Conecte o SMS pela Zadarma em Canais › Outras formas de conectar e remova este canal.'
 where provider = 'twilio_sms'
   and (status is distinct from 'error' or status_detail is null);

update public.phone_numbers
   set is_active = false
 where provider = 'twilio'
   and is_active;
