import { describe, expect, it } from "vitest";
import { errText } from "../src/ui/format.js";

describe("errText", () => {
  it("reads an Error, a string, and the plain { code, message } object Paperclip's host rejects with", () => {
    expect(errText(new Error("boom"))).toBe("boom");
    expect(errText("plain")).toBe("plain");
    expect(errText({ code: "WORKER_ERROR", message: "Wrong username or secret key." })).toBe("Wrong username or secret key.");
    expect(errText({ error: "nope" })).toBe("nope");
  });
  it("never prints [object Object]", () => {
    expect(errText({})).not.toContain("[object");
    expect(errText(undefined)).not.toContain("undefined");
  });
});
