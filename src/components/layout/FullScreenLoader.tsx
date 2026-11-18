import { Logo } from "./Logo";

export function FullScreenLoader() {
  return (
    <div
      className="grid min-h-screen place-items-center bg-background"
      role="status"
      aria-label="Carregando"
    >
      <div className="flex flex-col items-center gap-4">
        <Logo className="size-10 animate-pulse" />
        <span className="sr-only">Carregando</span>
      </div>
    </div>
  );
}
