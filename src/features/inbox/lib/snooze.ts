import { addDays, addHours, nextMonday, setHours, startOfHour } from "date-fns";

export interface SnoozeOption {
  id: string;
  label: string;
  at: () => Date;
}

function atNine(d: Date): Date {
  return startOfHour(setHours(d, 9));
}

export const SNOOZE_OPTIONS: SnoozeOption[] = [
  { id: "1h", label: "Daqui a 1 hora", at: () => addHours(new Date(), 1) },
  { id: "tomorrow", label: "Amanhã às 9h", at: () => atNine(addDays(new Date(), 1)) },
  { id: "next-week", label: "Próxima semana (seg, 9h)", at: () => atNine(nextMonday(new Date())) },
];
