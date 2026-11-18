import { PLATFORM_LABEL } from "@/components/brand/platform-label";
import { formatPhone } from "@/lib/format";
import type { Channel } from "../types";

export function channelHandle(channel: Channel | undefined): string | null {
  if (!channel?.handle) return null;
  return channel.platform === "whatsapp" ? formatPhone(channel.handle) : channel.handle;
}

export function platformLabel(platform: string): string {
  return PLATFORM_LABEL[platform] ?? platform;
}
