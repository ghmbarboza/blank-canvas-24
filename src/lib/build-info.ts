// Injetado no build; o SHA não contém credencial nem configuração de ambiente.
declare const __NEXUS_BUILD_SHA__: string;
export const BUILD_SHA = typeof __NEXUS_BUILD_SHA__ === "string" ? __NEXUS_BUILD_SHA__ : "unknown";
