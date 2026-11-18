export function dayLabel(date: string, tz: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" })
      .format(d)
      .replace(".", ""),
    day: new Intl.DateTimeFormat("pt-BR", { day: "numeric", timeZone: "UTC" }).format(d),
    month: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
      .format(d)
      .replace(".", ""),
    full: new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(d),
    tz,
  };
}
