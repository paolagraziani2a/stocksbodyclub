import { describe, expect, it } from "vitest";
import { sessionCancelledSms, toGsm } from "./messages";
import { formatPhone, isMobile, normalizePhone } from "./phone";

describe("téléphones", () => {
  it("normalise les saisies françaises au format international", () => {
    expect(normalizePhone("06 12 34 56 78")).toBe("+33612345678");
    expect(normalizePhone("06.12.34.56.78")).toBe("+33612345678");
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(normalizePhone("0033612345678")).toBe("+33612345678");
    expect(normalizePhone("04 95 70 00 00")).toBe("+33495700000"); // fixe en Corse
  });
  it("accepte les numéros étrangers, refuse le reste", () => {
    expect(normalizePhone("+39 333 123 4567")).toBe("+393331234567");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("06 12 34")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
  it("affiche et reconnaît les mobiles", () => {
    expect(formatPhone("+33612345678")).toBe("06 12 34 56 78");
    expect(isMobile("+33712345678")).toBe(true);
    expect(isMobile("+33495700000")).toBe(false);
  });
});

describe("SMS d'annulation", () => {
  it("tient en un seul SMS et n'utilise que l'alphabet standard", () => {
    const sms = sessionCancelledSms({ firstName: "Clémentine", title: "Lagree", startsAt: "2026-11-20T18:00:00Z", studio: "The Body Club" });
    expect(sms).toContain("ven 20/11 a 19h00");
    expect(sms).toContain("annule");
    expect(sms.length).toBeLessThanOrEqual(160);
    // é est dans l'alphabet GSM, ê ne l'est pas
    expect(toGsm("prêt à être")).toBe("pret à etre");
  });
  it("raccourcit le message si le titre est long", () => {
    const sms = sessionCancelledSms({ firstName: "Marie-Charlotte", title: "Lagree Sculpt avancé spécial week-end", startsAt: "2026-11-21T09:00:00Z", studio: "The Body Club" });
    expect(sms.length).toBeLessThanOrEqual(160);
  });
});
