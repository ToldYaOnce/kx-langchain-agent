import { computeTiming, estimateTokenCount } from "../src/composeAndSchedule";
import { PERSONAS } from "../src/personaTimings";

describe("composeAndSchedule", () => {
  describe("computeTiming", () => {
    test("respects caps and ranges for Carlos", () => {
      const t = computeTiming("test-seed", PERSONAS.Carlos, 120, 40, 400);
      
      expect(t.read_ms).toBeGreaterThanOrEqual(700);
      expect(t.total_ms).toBeLessThanOrEqual(45000);
      expect(t.type_ms).toBeGreaterThan(0);
      expect(t.comprehension_ms).toBeGreaterThan(0);
      expect(t.write_ms).toBeGreaterThan(0);
      expect(t.jitter_ms).toBeGreaterThan(0);
    });

    test("respects caps and ranges for Alex", () => {
      const t = computeTiming("test-seed", PERSONAS.Alex, 80, 25, 200);
      
      expect(t.read_ms).toBeGreaterThanOrEqual(700);
      expect(t.total_ms).toBeLessThanOrEqual(45000);
      expect(t.type_ms).toBeGreaterThan(0);
    });

    test("produces consistent results for same seed", () => {
      const seed = "consistent-seed";
      const t1 = computeTiming(seed, PERSONAS.Carlos, 100, 30, 300);
      const t2 = computeTiming(seed, PERSONAS.Carlos, 100, 30, 300);
      
      expect(t1).toEqual(t2);
    });

    test("produces different results for different seeds", () => {
      const t1 = computeTiming("seed1", PERSONAS.Carlos, 100, 30, 300);
      const t2 = computeTiming("seed2", PERSONAS.Carlos, 100, 30, 300);
      
      expect(t1).not.toEqual(t2);
    });

    test("scales with input length", () => {
      const shortInput = computeTiming("test", PERSONAS.Carlos, 50, 15, 100);
      const longInput = computeTiming("test", PERSONAS.Carlos, 200, 60, 400);
      
      // Longer input should generally take more time to read and process
      expect(longInput.total_ms).toBeGreaterThan(shortInput.total_ms);
    });

    test("handles edge cases", () => {
      // Very short input
      const t1 = computeTiming("test", PERSONAS.Carlos, 1, 1, 1);
      expect(t1.read_ms).toBeGreaterThanOrEqual(700); // Minimum read time
      
      // Very long input (should be capped)
      const t2 = computeTiming("test", PERSONAS.Carlos, 10000, 3000, 5000);
      expect(t2.total_ms).toBeLessThanOrEqual(45000); // Maximum total time
    });
  });

  describe("estimateTokenCount", () => {
    test("estimates token count correctly", () => {
      expect(estimateTokenCount("")).toBe(0);
      expect(estimateTokenCount("hello")).toBe(2); // 5 chars / 4 = 1.25 -> 2
      expect(estimateTokenCount("hello world")).toBe(3); // 11 chars / 4 = 2.75 -> 3
      expect(estimateTokenCount("this is a longer sentence")).toBe(7); // 25 chars / 4 = 6.25 -> 7
    });
  });

  describe("persona configurations", () => {
    test("all personas have valid configurations", () => {
      Object.entries(PERSONAS).forEach(([name, persona]) => {
        expect(persona.read_cps[0]).toBeLessThanOrEqual(persona.read_cps[1]);
        expect(persona.type_cps[0]).toBeLessThanOrEqual(persona.type_cps[1]);
        expect(persona.comp_base_ms[0]).toBeLessThanOrEqual(persona.comp_base_ms[1]);
        expect(persona.comp_ms_per_token[0]).toBeLessThanOrEqual(persona.comp_ms_per_token[1]);
        expect(persona.write_ms_per_char[0]).toBeLessThanOrEqual(persona.write_ms_per_char[1]);
        expect(persona.jitter_ms[0]).toBeLessThanOrEqual(persona.jitter_ms[1]);
        
        if (persona.pauses) {
          expect(persona.pauses.prob).toBeGreaterThanOrEqual(0);
          expect(persona.pauses.prob).toBeLessThanOrEqual(1);
          expect(persona.pauses.each_ms[0]).toBeLessThanOrEqual(persona.pauses.each_ms[1]);
          expect(persona.pauses.max).toBeGreaterThan(0);
        }
      });
    });

    test("Carlos is configured as expected", () => {
      const carlos = PERSONAS.Carlos;
      expect(carlos.read_cps).toEqual([9, 12]);
      expect(carlos.type_cps).toEqual([3, 6]);
      expect(carlos.pauses?.prob).toBe(0.35);
    });
  });
});
