export interface PrivacySettings {
  recording_notice: string;
  retention_recordings_days: number;
  retention_transcripts_days: number;
  email_double_opt_in: boolean;
  whatsapp_marketing_requires_consent: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

export const DEFAULT_PRIVACY: PrivacySettings = {
  recording_notice:
    "Esta conversa pode ser gravada e transcrita para fins de qualidade e para registrar o que combinamos.",
  retention_recordings_days: 180,
  retention_transcripts_days: 365,
  email_double_opt_in: false,
  whatsapp_marketing_requires_consent: true,
  quiet_hours_start: "21:00",
  quiet_hours_end: "08:00",
};
