import { afterEach, describe, expect, it, vi } from "vitest";

import { toolLabel } from "@/features/agent/milestones";
import { asKey } from "@/features/contact/schemas";

import en from "./catalogs/en-IN.json";
import te from "./catalogs/te-IN.json";
import {
  isMessageKey,
  lookup,
  resolveLocale,
  translate,
  translatePlural,
  useLocaleStore,
  SUPPORTED,
  LANGS,
} from "./index";

describe("resolveLocale", () => {
  it("uses a saved choice, and a saved choice we no longer support goes to the default, never the browser", () => {
    expect(resolveLocale("ta-IN", ["hi-IN"])).toBe("ta-IN");
    expect(resolveLocale("ta", ["hi-IN"])).toBe("ta-IN");
    expect(resolveLocale("fr-FR", ["hi-IN"])).toBe("en-IN");
  });

  it("without a saved choice, walks the browser languages: exact, then language, then the default", () => {
    expect(resolveLocale(null, ["kn-IN"])).toBe("kn-IN");
    expect(resolveLocale(null, ["fr-FR", "hi"])).toBe("hi-IN");
    expect(resolveLocale(null, ["bn_BD"])).toBe("bn-IN");
    expect(resolveLocale(null, ["en-US"])).toBe("en-IN");
    expect(resolveLocale(null, ["fr-FR", "de"])).toBe("en-IN");
    expect(resolveLocale(null, [])).toBe("en-IN");
  });

  it("declares exactly the languages the app offers", () => {
    expect([...SUPPORTED].sort()).toEqual(LANGS.map((l) => l.code).sort());
  });
});

describe("lookup and translate", () => {
  it("a key not yet translated in a catalog shows the English text, never the key or a blank", () => {
    const partial = { ...te } as Partial<typeof te>;
    delete partial["composer.send"];
    expect(lookup(partial, "composer.send")).toBe(en["composer.send"]);
    expect(lookup(te, "composer.send")).toBe("పంపు");
  });

  it("fills placeholders and leaves unknown ones visible for the check to catch", () => {
    expect(translate("en-IN", "studio.managing", { name: "Lakshmi" })).toBe("Managing Lakshmi");
    expect(translate("te-IN", "studio.managing", { name: "Lakshmi" })).toBe("Lakshmi నిర్వహణ");
    expect(translate("en-IN", "studio.managing")).toBe("Managing {name}");
    expect(translate("en-IN", "studio.managing", {})).toBe("Managing {name}");
  });

  it("picks the plural category for the language", () => {
    expect(translatePlural("en-IN", "milestone.products", 1)).toBe("1 product, bilingual");
    expect(translatePlural("en-IN", "milestone.products", 3)).toBe("3 products, bilingual");
    expect(translatePlural("te-IN", "milestone.products", 1)).toBe("1 ఉత్పత్తి, రెండు భాషల్లో");
    expect(translatePlural("te-IN", "milestone.products", 4)).toBe("4 ఉత్పత్తులు, రెండు భాషల్లో");
  });

  it("only treats real catalog keys as keys", () => {
    expect(isMessageKey("tool.save_draft")).toBe(true);
    expect(isMessageKey("tool.launch_rocket")).toBe(false);
    expect(toolLabel("save_draft", "hi-IN")).toBe("आपका स्टोर बना रहा है");
    expect(toolLabel("launch_rocket")).toBe("Working on your store");
    expect(asKey(undefined)).toBeUndefined();
    expect(asKey("contact.error.name")).toBe("contact.error.name");
    expect(asKey("Too long")).toBe("error.generic");
  });
});

describe("the saved language", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("saves the choice on this device and sets the document language", () => {
    useLocaleStore.getState().setLocale("ml-IN");
    expect(useLocaleStore.getState().locale).toBe("ml-IN");
    expect(localStorage.getItem("vl_lang")).toBe("ml-IN");
    expect(document.documentElement.lang).toBe("ml-IN");
  });

  it("starts from the saved choice on the next visit", async () => {
    localStorage.setItem("vl_lang", "gu-IN");
    vi.resetModules();
    const fresh = await import("./index");
    expect(fresh.useLocaleStore.getState().locale).toBe("gu-IN");
    expect(document.documentElement.lang).toBe("gu-IN");
  });

  it("keeps working when storage is blocked (private mode)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.resetModules();
    const fresh = await import("./index");
    expect(fresh.useLocaleStore.getState().locale).toBe("en-IN");
    fresh.useLocaleStore.getState().setLocale("mr-IN");
    expect(fresh.useLocaleStore.getState().locale).toBe("mr-IN");
  });
});
