import { describe, expect, it } from "vitest";
import { errorMessage, GENERIC_ERROR } from "./errors";
import { formatEuros, htFromTtc, pricePerClass, vatFromTtc } from "./money";

describe("errorMessage", () => {
  it("traduit les codes levés par la base", () => {
    expect(errorMessage({ message: "SESSION_FULL" })).toMatch(/complet/);
    expect(errorMessage(new Error("NO_CREDITS"))).toMatch(/crédit/);
    expect(errorMessage("LEDGER_IMMUTABLE: credit_ledger is append-only")).toBe(GENERIC_ERROR);
  });
  it("ne divulgue jamais un message technique", () => {
    expect(errorMessage({ message: 'relation "x" does not exist' })).toBe(GENERIC_ERROR);
    expect(errorMessage(null)).toBe(GENERIC_ERROR);
  });
});

describe("money", () => {
  it("formate en euros", () => {
    expect(formatEuros(25000).replace(/\s/g, " ")).toBe("250,00 €");
  });
  it("calcule HT et TVA à partir du TTC (20 %)", () => {
    expect(htFromTtc(3500, 20)).toBeCloseTo(2916.67, 2);
    expect(vatFromTtc(3500, 20)).toBeCloseTo(583.33, 2);
  });
  it("prix par cours des cartes actuelles", () => {
    expect(pricePerClass(9900, 3)).toBe(3300);
    expect(pricePerClass(15000, 5)).toBe(3000);
    expect(pricePerClass(25000, 10)).toBe(2500);
  });
});
