import { describe, it, expect, vi, afterEach } from "vitest";
import { log } from "./log";

describe("log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  it("emits info-level JSON to stdout", () => {
    process.env.LOG_LEVEL = "info";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.info("hello", { foo: 1 });
    expect(spy).toHaveBeenCalled();
    const arg = (spy.mock.calls[0]?.[0] ?? "") as string;
    const obj = JSON.parse(arg.trim());
    expect(obj.level).toBe("info");
    expect(obj.msg).toBe("hello");
    expect(obj.foo).toBe(1);
    expect(typeof obj.ts).toBe("string");
  });

  it("routes errors to stderr", () => {
    process.env.LOG_LEVEL = "error";
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log.error("boom");
    expect(stderr).toHaveBeenCalled();
  });

  it("respects LOG_LEVEL threshold (warn drops debug+info)", () => {
    process.env.LOG_LEVEL = "warn";
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log.debug("x");
    log.info("x");
    log.warn("x");
    log.error("x");
    expect(stdout).toHaveBeenCalledTimes(1); // warn
    expect(stderr).toHaveBeenCalledTimes(1); // error
  });

  it("child loggers merge fields", () => {
    process.env.LOG_LEVEL = "info";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const child = log.child({ requestId: "abc" });
    child.info("hi", { a: 1 });
    const arg = (spy.mock.calls[0]?.[0] ?? "") as string;
    const obj = JSON.parse(arg.trim());
    expect(obj.requestId).toBe("abc");
    expect(obj.a).toBe(1);
  });
});
