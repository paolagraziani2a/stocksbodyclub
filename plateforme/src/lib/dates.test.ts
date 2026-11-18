import { describe, expect, it } from "vitest";
import { addDays, firstOfMonth, formatTime, isValidDay, lastOfMonth, mondayOf, parisDay, parisTime } from "./dates";

describe("dates du studio", () => {
  it("lundi de la semaine", () => {
    expect(mondayOf("2026-11-18")).toBe("2026-11-16"); // mercredi
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
    expect(mondayOf("2026-11-22")).toBe("2026-11-16"); // dimanche
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
  });
  it("arithmétique des jours et des mois", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(firstOfMonth("2026-02-17")).toBe("2026-02-01");
    expect(lastOfMonth("2028-02-10")).toBe("2028-02-29");
  });
  it("jour et heure de Paris, été comme hiver", () => {
    expect(parisDay(new Date("2026-11-18T23:30:00Z"))).toBe("2026-11-19");
    expect(parisTime("2026-07-01T07:00:00Z")).toBe("09:00");
    expect(formatTime("2026-12-01T08:00:00Z")).toBe("09h00");
  });
  it("valide les jours", () => {
    expect(isValidDay("2026-11-18")).toBe(true);
    expect(isValidDay("18/11/2026")).toBe(false);
    expect(isValidDay(undefined)).toBe(false);
  });
});
