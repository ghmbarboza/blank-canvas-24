import { createContext, useContext } from "react";

import type { Call } from "../api";

export interface DialTarget {
  contactId?: string | null;
  phone?: string | null;
  name?: string | null;
}

export interface SoftphoneState {
  open: boolean;
  setOpen: (o: boolean) => void;
  widget: "off" | "loading" | "ready" | "error";
  widgetError: string | null;
  loadWidget: () => Promise<void>;
  dial: (t: DialTarget, via?: "softphone" | "mobile") => Promise<void>;
  dialing: boolean;
  target: DialTarget | null;
  activeCall: Call | null;
  accountId: string;
}

export const SoftphoneContext = createContext<SoftphoneState | null>(null);

export function useSoftphone(): SoftphoneState | null {
  return useContext(SoftphoneContext);
}
