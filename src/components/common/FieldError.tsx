/** Erro de um campo de formulário, junto do campo (ligado por aria-describedby). */
export function FieldError({ id, message }: { id: string; message?: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-[13px] text-destructive">
      {message}
    </p>
  );
}
