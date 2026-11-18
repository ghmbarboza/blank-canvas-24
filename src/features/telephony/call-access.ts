/** Espelha calls_select: um vendedor vê ligação própria ou de contato acessível. */
export function canReadCall(
  role: string,
  userId: string,
  callUserId: string | null,
  contact: { owner_user_id: string | null } | null,
): boolean {
  return (
    role !== "seller" ||
    callUserId === userId ||
    (contact !== null && (contact.owner_user_id === null || contact.owner_user_id === userId))
  );
}
