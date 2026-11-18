import { describe, expect, it } from "vitest";

import { isPrivateHost, parseIPv6 } from "./net-address";

describe("isPrivateHost: regra única de endereço interno (R8)", () => {
  it.each([
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "100.127.255.255",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.10",
    "224.0.0.1",
    "255.255.255.255",
    "localhost",
    "LOCALHOST.",
    "api.localhost",
    "metadata.google.internal",
    "impressora.local",
    "::1",
    "[::1]",
    "::",
    "[::]",
    "0:0:0:0:0:0:0:1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%eth0",
    "febf::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "[::ffff:10.0.0.1]",
    "::ffff:7f00:1",
    "[::ffff:a9fe:a9fe]",
    "::127.0.0.1",
    "64:ff9b::a9fe:a9fe",
    "2002:7f00:1::",
    "::ffff:0:127.0.0.1",
    "[::ffff:0:a9fe:a9fe]",
    "64:ff9b:1::808:808",
    "2001:db8::1",
    "[2001:db8:85a3::8a2e:370:7334]",
    "192.88.99.1",
    "2130706433",
    "0x7f.1",
    "0177.0.0.1",
    "nao:e:ipv6:valido",
    "",
  ])("bloqueia %s", (h) => {
    expect(isPrivateHost(h)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "172.32.0.1",
    "100.128.0.1",
    "sorriso.com.br",
    "fdroid.org",
    "fcbarcelona.com",
    "fe80.example.com",
    "0xide.com",
    "2001:4860:4860::8888",
    "::ffff:0:8.8.8.8",
    "64:ff9b::808:808",
    "192.88.100.1",
    "[2606:4700::1111]",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
  ])("libera %s", (h) => {
    expect(isPrivateHost(h)).toBe(false);
  });

  it("lê IPv6 com IPv4 no fim e com ::", () => {
    expect(parseIPv6("::ffff:1.2.3.4")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x102, 0x304]);
    expect(parseIPv6("1::")).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIPv6("1:2:3:4:5:6:7:8:9")).toBeNull();
    expect(parseIPv6("1::2::3")).toBeNull();
  });

  it("a URL normaliza [::ffff:127.0.0.1] para hexa e continua bloqueado", () => {
    const host = new URL("https://[::ffff:127.0.0.1]/").hostname;
    expect(host).toBe("[::ffff:7f00:1]");
    expect(isPrivateHost(host)).toBe(true);
    expect(isPrivateHost(new URL("http://2130706433/").hostname)).toBe(true);
  });
});
