import type { BookingPage } from "./api";

/** Quem atende pelo link: o dono, ou cada pessoa do rodízio. */
export function memberIds(page: BookingPage): string[] {
  if (page.mode === "round_robin" && Array.isArray(page.members)) {
    return page.members
      .map((m) =>
        m && typeof m === "object" && !Array.isArray(m) && typeof m["user_id"] === "string"
          ? m["user_id"]
          : "",
      )
      .filter(Boolean);
  }
  return page.owner_user_id ? [page.owner_user_id] : [];
}
