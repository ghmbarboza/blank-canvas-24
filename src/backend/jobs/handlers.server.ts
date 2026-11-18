// Carrega os handlers de todas as fases. O package.json declara "sideEffects": false, então um
// `import "./x"` solto é descartado no build: cada módulo entra referenciado nesta lista.
import * as agents from "./handlers/agents.server";
import * as ai from "./handlers/ai.server";
import * as automations from "./handlers/automations.server";
import * as calendar from "./handlers/calendar.server";
import * as campaigns from "./handlers/campaigns.server";
import * as callcenter from "./handlers/callcenter.server";
import * as email from "./handlers/email.server";
import * as flowcrm from "./handlers/flowcrm.server";
import * as gestao from "./handlers/gestao.server";
import * as library from "./handlers/library.server";
import * as meetingBriefing from "./handlers/meeting-briefing.server";
import * as meetings from "./handlers/meetings.server";
import * as notifications from "./handlers/notifications.server";
import * as privacy from "./handlers/privacy.server";
import * as quality from "./handlers/quality.server";
import * as reports from "./handlers/reports.server";
import * as sacSdr from "./handlers/sac-sdr.server";
import * as support from "./handlers/support.server";
import * as telephony from "./handlers/telephony.server";
import * as zernio from "./handlers/zernio.server";

const MODULES = [
  ai,
  notifications,
  email,
  telephony,
  support,
  automations,
  meetings,
  meetingBriefing,
  reports,
  library,
  calendar,
  privacy,
  zernio,
  quality,
  sacSdr,
  callcenter,
  gestao,
  agents,
  flowcrm,
  campaigns,
].filter((m) => m.registered);

export function loadAllHandlers(): number {
  return MODULES.length;
}
