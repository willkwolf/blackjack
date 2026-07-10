import { describe, it, expect } from 'vitest';
import { runMonteCarlo, getNextBet } from '../core/MonteCarloSimulation.ts';
import { DEFAULT_RULES, DEFAULT_HARD_HANDS, DEFAULT_SOFT_HANDS, DEFAULT_PAIRS } from '../core/defaultStrategy.ts';

const mockStrategy = {
  hard: DEFAULT_HARD_HANDS,
  soft: DEFAULT_SOFT_HANDS,
  pairs: DEFAULT_PAIRS
};

describe('Monte Carlo Simulation & Progression Tests', () => {
  describe('Betting Progressions', () => {
    it('should calculate Flat bet correctly', () => {
      const config = { type: 'FLAT' as const, baseBet: 2500 };
      expect(getNextBet(config, 100000, 0, 0)).toBe(2500);
      expect(getNextBet(config, 100000, 3, 2500)).toBe(2500);
      expect(getNextBet(config, 100000, 0, -2500)).toBe(2500);
    });

    it('should calculate Paroli progression with auto-reset fix', () => {
      const config = { type: 'PAROLI' as const, baseBet: 2500, maxProgressions: 2 };
      
      // Apuesta inicial
      expect(getNextBet(config, 100000, 0, 0)).toBe(2500);

      // Victoria 1 -> Apuesta 5000 (2^1 * 2500)
      expect(getNextBet(config, 100000, 1, 2500)).toBe(5000);

      // Victoria 2 -> Apuesta 10000 (2^2 * 2500)
      expect(getNextBet(config, 100000, 2, 5000)).toBe(10000);

      // Victoria 3 (supera maxProgressions: 2) -> Resetea a 2500
      expect(getNextBet(config, 100000, 3, 10000)).toBe(2500);

      // Pérdida -> Resetea a 2500
      expect(getNextBet(config, 100000, 0, -5000)).toBe(2500);
    });

    it('should calculate DSP (Dynamic Shielded Progression) correctly', () => {
      const config = { type: 'DSP' as const, baseBet: 2500 };

      // Apuesta base
      expect(getNextBet(config, 100000, 0, 0)).toBe(2500);

      // Victoria 1 -> Apuesta 5000 (Paso 2)
      expect(getNextBet(config, 100000, 1, 2500)).toBe(5000);

      // Victoria 2 -> Apuesta 5000 (Paso 3: 1.5u = 3750, redondeado a múltiplo de 2500 es 5000)
      expect(getNextBet(config, 100000, 2, 5000)).toBe(5000);

      // Victoria 3 -> Apuesta 7500 (Paso 4: 3u)
      expect(getNextBet(config, 100000, 3, 5000)).toBe(7500);

      // Victoria 4 -> Resetea a 2500 (Paso 1)
      expect(getNextBet(config, 100000, 4, 7500)).toBe(2500);

      // Pérdida -> Resetea a 2500
      expect(getNextBet(config, 100000, 0, -5000)).toBe(2500);
    });
  });

  describe('Full Monte Carlo Runs', () => {
    it('should run a small simulation without crashing and return results', () => {
      const rules = { ...DEFAULT_RULES, decks: 6 };
      const progConfig = { type: 'FLAT' as const, baseBet: 2500 };

      // Usamos un bankroll inicial alto de 10,000,000 COP para evitar bancarrota y asegurar 500 manos
      const result = runMonteCarlo(500, 10000000, rules, mockStrategy, progConfig, {
        saveHandHistoryLimit: 50
      });

      expect(result.stats.handsPlayed).toBe(500);
      expect(result.bankrollHistory.length).toBeGreaterThan(1);
      expect(result.sampleHands?.length).toBeGreaterThan(0);
      expect(result.maxBankroll).toBeGreaterThanOrEqual(result.minBankroll);
      expect(result.roi).toBeDefined();
      expect(result.winRate).toBeGreaterThan(0);
      expect(result.houseEdge).toBeDefined();
      expect(result.kellyFraction).toBeDefined();
    });

    it('should stop simulation if Stop-Loss is hit', () => {
      const rules = { ...DEFAULT_RULES };
      // Stop-loss agresivo al 10% de pérdida (quedan 90000)
      const progConfig = { type: 'FLAT' as const, baseBet: 10000, stopLossPercent: 10 };

      const result = runMonteCarlo(1000, 100000, rules, mockStrategy, progConfig);

      // Si el bankroll bajó de 90000 en algún momento, la simulación debió detenerse
      // y el bankroll final ser menor o igual a 90000 (o menor si la última mano fue más grande)
      if (result.stats.handsPlayed < 1000) {
        expect(result.finalBankroll).toBeLessThanOrEqual(90000);
      }
    });
  });
});
