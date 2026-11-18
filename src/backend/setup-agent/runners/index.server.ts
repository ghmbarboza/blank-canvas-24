// Ferramentas da assistente por assunto. tools.server.ts junta estas com as antigas: quando o
// mesmo nome aparece nos dois lugares, vale a daqui (versão nova).
import type { Runner } from "../runner-types";

import { AGENT_RUNNERS } from "./agent.server";
import { CATALOG_RUNNERS } from "./catalog.server";
import { CLIENTS_RUNNERS } from "./clients.server";
import { KNOWLEDGE_RUNNERS } from "./knowledge.server";
import { RULES_RUNNERS } from "./rules.server";
import { STATUS_RUNNERS } from "./status.server";
import { TEAM_RUNNERS } from "./team.server";
import { WHATSAPP_RUNNERS } from "./whatsapp.server";

export const EXTRA_RUNNERS: Record<string, Runner> = {
  ...WHATSAPP_RUNNERS,
  ...KNOWLEDGE_RUNNERS,
  ...AGENT_RUNNERS,
  ...RULES_RUNNERS,
  ...TEAM_RUNNERS,
  ...CLIENTS_RUNNERS,
  ...CATALOG_RUNNERS,
  ...STATUS_RUNNERS,
};
