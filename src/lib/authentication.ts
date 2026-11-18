import { z } from "zod";

export const credentials = z.object({
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres"),
});

const registration = credentials.extend({
  fullName: z.string().trim().min(1, "Informe seu nome").max(120, "Nome muito longo"),
});

export const resetRequest = z.object({
  email: z.string().trim().email("E-mail inválido"),
});

export const newPassword = z
  .object({
    password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "As duas senhas não são iguais",
    path: ["confirm"],
  });

export type FieldErrors = Partial<
  Record<"email" | "password" | "fullName" | "confirm" | "form", string>
>;

/** Primeiro erro de cada campo, para mostrar junto do campo (não só em toast). */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = (issue.path[0] ?? "form") as keyof FieldErrors;
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Traduz o erro do Supabase Auth para uma frase com próximo passo. */
export function authErrorMessage(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login")) return "E-mail ou senha incorretos. Confira e tente de novo.";
  if (msg.includes("email not confirmed"))
    return "Seu e-mail ainda não foi confirmado. Abra o link que enviamos e tente de novo.";
  if (msg.includes("already registered"))
    return "Já existe conta com esse e-mail. Entre ou use “Esqueci minha senha”.";
  if (msg.includes("rate limit") || msg.includes("too many"))
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  if (msg.includes("same password")) return "A nova senha precisa ser diferente da atual.";
  return "Não foi possível concluir agora. Tente de novo em instantes.";
}

export function parseRegistration(input: unknown) {
  const { fullName, ...login } = registration.parse(input);
  return { ...login, options: { data: { full_name: fullName } } };
}

export function registrationOutcome(session: unknown) {
  return session ? "signed-in" : "confirmation-required";
}

export function safeAuthDestination(destination?: string) {
  if (
    !destination ||
    !destination.startsWith("/") ||
    destination.startsWith("//") ||
    /[\\\s]/.test(destination)
  )
    return "/painel";
  const path = destination.split(/[?#]/)[0] ?? "/";
  if (["/", "/entrar", "/auth", "/reset-password", "/redefinir-senha"].includes(path))
    return "/painel";
  return destination;
}

/**
 * Para onde o link de confirmação do e-mail volta. O destino (ex.: o convite) vai na própria URL,
 * porque a pessoa costuma abrir o e-mail em outra aba ou no celular, onde a sessão da aba de
 * cadastro não existe.
 */
export function confirmationRedirect(origin: string, destination?: string) {
  return `${origin}/entrar?redirect=${encodeURIComponent(safeAuthDestination(destination))}`;
}
