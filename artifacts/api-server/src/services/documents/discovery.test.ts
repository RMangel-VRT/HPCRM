import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, chmod, rm, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverChromium, discoveryIO, type DiscoveryIO } from "./discovery";

function fixture() {
  const files = new Map<string, "SELECTED" | "NOT_FILE" | "NOT_EXECUTABLE">();
  const entries: string[] = [];
  const io: DiscoveryIO = {
    env: { PATH: "/test/bin" },
    manifest: vi.fn(async () => "{}"),
    validate: vi.fn(async path => files.get(path) ?? "NOT_FOUND"),
    nixEntries: async function* () { yield* entries; },
  };
  return { io, files, entries };
}
afterEach(() => vi.useRealTimers());
describe("ordered, bounded executable discovery", () => {
  it.each(["PUPPETEER_EXECUTABLE_PATH", "REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE", "CHROMIUM_PATH"] as const)("selects %s and stops before lower precedence sources", async source => {
    const { io, files } = fixture();
    io.env[source] = "/valid"; files.set("/valid", "SELECTED");
    io.env.CHROMIUM_PATH ||= "/lower";
    const result = await discoverChromium(io);
    expect(result.executableSource).toBe(source);
    expect(result.attempts.at(-1)).toEqual({ source, outcome: "SELECTED" });
    expect(io.manifest).not.toHaveBeenCalled();
  });
  it("skips stale overrides, non-files and non-executable files before the build hint", async () => {
    const { io, files } = fixture();
    Object.assign(io.env, { PUPPETEER_EXECUTABLE_PATH: "/stale", REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE: "/directory", CHROMIUM_PATH: "/denied" });
    files.set("/directory", "NOT_FILE"); files.set("/denied", "NOT_EXECUTABLE"); files.set("/build", "SELECTED");
    io.manifest = async () => JSON.stringify({ executablePath: "/build" });
    expect((await discoverChromium(io)).attempts).toEqual([
      { source: "PUPPETEER_EXECUTABLE_PATH", outcome: "NOT_FOUND" },
      { source: "REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE", outcome: "NOT_FILE" },
      { source: "CHROMIUM_PATH", outcome: "NOT_EXECUTABLE" },
      { source: "BUILD_MANIFEST", outcome: "SELECTED" },
    ]);
  });
  it.each([
    ["chromium", "PATH_CHROMIUM"], ["chromium-browser", "PATH_CHROMIUM_BROWSER"],
    ["google-chrome", "PATH_GOOGLE_CHROME"], ["google-chrome-stable", "PATH_GOOGLE_CHROME_STABLE"],
  ])("recovers from a stale build hint via PATH %s", async (command, source) => {
    const { io, files } = fixture();
    io.manifest = async () => '{"executablePath":"/stale-build"}';
    io.env.PATH = "/missing:/test/bin";
    files.set(`/test/bin/${command}`, "SELECTED");
    const result = await discoverChromium(io);
    expect(result.path).toBe(`/test/bin/${command}`); expect(result.executableSource).toBe("PATH");
    expect(result.attempts[3]).toEqual({ source: "BUILD_MANIFEST", outcome: "NOT_FOUND" });
    expect(result.attempts.at(-1)).toEqual({ source, outcome: "SELECTED" });
  });
  it.each(["null", "{", "{}", '{"executablePath":42}', '{"executablePath":""}'])("tolerates invalid optional manifest %s", async text => {
    const { io, files } = fixture(); io.manifest = async () => text;
    files.set("/test/bin/chromium", "SELECTED");
    expect((await discoverChromium(io)).attempts[3]).toEqual({ source: "BUILD_MANIFEST", outcome: "INVALID_HINT" });
  });
  it("tolerates missing or unreadable manifests", async () => {
    const { io, files } = fixture();
    io.manifest = async () => { throw new Error("private path"); };
    files.set("/test/bin/chromium", "SELECTED");
    expect((await discoverChromium(io)).executableSource).toBe("PATH");
  });
  it("sorts Nix candidates and skips invalid candidates deterministically", async () => {
    const { io, files, entries } = fixture();
    entries.push("z-chromium-140", "ignore", "b-chromium-139", "a-chromium-138");
    files.set("/nix/store/a-chromium-138/bin/chromium", "NOT_EXECUTABLE");
    files.set("/nix/store/b-chromium-139/bin/chromium", "SELECTED");
    files.set("/nix/store/z-chromium-140/bin/chromium", "SELECTED");
    const result = await discoverChromium(io);
    expect(result.executableSource).toBe("NIX_STORE");
    expect(result.path).toBe("/nix/store/b-chromium-139/bin/chromium");
    expect(result.attempts.slice(-2)).toEqual([{ source: "NIX_STORE", outcome: "NOT_EXECUTABLE" }, { source: "NIX_STORE", outcome: "SELECTED" }]);
  });
  it("returns ordered fixed codes on exhausted search without any raw values", async () => {
    const { io } = fixture(); io.env.PUPPETEER_EXECUTABLE_PATH = "/PRIVATE";
    const result = await discoverChromium(io);
    expect(result.path).toBeNull(); expect(result.executableSource).toBeNull();
    expect(result.attempts.map(a => a.source)).toEqual([
      "PUPPETEER_EXECUTABLE_PATH", "REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE", "CHROMIUM_PATH", "BUILD_MANIFEST",
      "PATH_CHROMIUM", "PATH_CHROMIUM_BROWSER", "PATH_GOOGLE_CHROME", "PATH_GOOGLE_CHROME_STABLE", "NIX_STORE",
    ]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("bounds listing work and never selects from a truncated unordered store", async () => {
    const { io } = fixture();
    io.nixEntries = async function* () { for (let i = 0; i < 9000; i++) yield `${i}-chromium-140`; };
    const result = await discoverChromium(io);
    expect(result.attempts.at(-1)?.outcome).toBe("LIMIT_REACHED");
    expect(result.path).toBeNull();
  });
  it("caps sorted Nix validation at 16 and PATH at 64 directories", async () => {
    const { io, entries } = fixture();
    io.env.PATH = Array.from({ length: 100 }, (_, i) => `/dir${i}`).join(":");
    entries.push(...Array.from({ length: 40 }, (_, i) => `${i}-chromium-140`));
    const result = await discoverChromium(io);
    expect(result.attempts).toHaveLength(25);
    expect(result.attempts.at(-1)?.outcome).toBe("LIMIT_REACHED");
    expect(io.validate).toHaveBeenCalledTimes(64 * 4 + 16);
  });
  it("bounds stalled I/O to 1500ms without late diagnostic mutation", async () => {
    vi.useFakeTimers();
    const { io } = fixture();
    io.manifest = () => new Promise(() => {});
    const pending = discoverChromium(io);
    await vi.advanceTimersByTimeAsync(1501);
    const result = await pending;
    expect(result.attempts.at(-1)).toEqual({ source: "BUILD_MANIFEST", outcome: "TIMED_OUT" });
  });
  it("validates real files, permissions and directories, following executable symlinks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chromium-discovery-"));
    try {
      const file = join(dir, "browser"); await writeFile(file, "#!/bin/sh\n");
      expect(await discoveryIO.validate(file)).toBe("NOT_EXECUTABLE");
      await chmod(file, 0o755); expect(await discoveryIO.validate(file)).toBe("SELECTED");
      await symlink(file, join(dir, "linked")); expect(await discoveryIO.validate(join(dir, "linked"))).toBe("SELECTED");
      await mkdir(join(dir, "directory")); expect(await discoveryIO.validate(join(dir, "directory"))).toBe("NOT_FILE");
      expect(await discoveryIO.validate(join(dir, "missing"))).toBe("NOT_FOUND");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
