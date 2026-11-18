import { toast } from "sonner";

export function copyText(text: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success("Copiado"));
}
