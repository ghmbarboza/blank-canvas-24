import { describe, expect, it } from "vitest";

import {
  channelAcceptsAudio,
  extensionFor,
  formatDuration,
  pickRecordingType,
} from "./voice-format";

describe("gravação de áudio", () => {
  it("prefere OGG/Opus, depois MP4, depois WebM", () => {
    expect(pickRecordingType(() => true)).toBe("audio/ogg;codecs=opus");
    expect(pickRecordingType((t) => t !== "audio/ogg;codecs=opus")).toBe("audio/mp4");
    expect(pickRecordingType((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickRecordingType(() => false)).toBeNull();
  });
  it("extensão do arquivo pelo formato", () => {
    expect(extensionFor("audio/ogg;codecs=opus")).toBe("ogg");
    expect(extensionFor("audio/mp4")).toBe("m4a");
    expect(extensionFor("audio/webm;codecs=opus")).toBe("webm");
  });
  it("só a API direta da Meta recusa WebM", () => {
    expect(channelAcceptsAudio("whatsapp_cloud", "audio/webm;codecs=opus")).toBe(false);
    expect(channelAcceptsAudio("whatsapp_cloud", "audio/ogg;codecs=opus")).toBe(true);
    expect(channelAcceptsAudio("zernio", "audio/webm;codecs=opus")).toBe(true);
  });
  it("duração em m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(75.4)).toBe("1:15");
  });
});
