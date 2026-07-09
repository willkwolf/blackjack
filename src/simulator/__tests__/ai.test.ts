import { describe, it, expect } from 'vitest';
import { QLearningAgent } from '../core/QLearningAgent.ts';
import { 
  createDefaultChromosome, 
  cloneChromosome, 
  crossoverChromosomes, 
  mutateChromosome, 
  evaluateFitness, 
  initializePopulation, 
  runGeneticGeneration 
} from '../core/GeneticEngine.ts';
import { DEFAULT_RULES } from '../core/defaultStrategy.ts';

describe('AI Modules Tests (RL & GA)', () => {
  describe('QLearningAgent', () => {
    it('should initialize state keys and Q-values correctly', () => {
      const agent = new QLearningAgent();
      const stateKey = agent.getStateKey(16, 10, false);
      expect(stateKey).toBe('16-10-false');

      const qValues = agent.getQValues(stateKey);
      expect(qValues).toEqual([0.0, 0.0, 0.0, 0.0]); // 4 acciones
    });

    it('should select actions based on epsilon', () => {
      const agent = new QLearningAgent({ epsilon: 0.0 }); // Sin exploración (greedy)
      const stateKey = agent.getStateKey(16, 10, false);
      
      // Forzar que 'Stand' (índice 1) sea la mejor opción
      agent.getQValues(stateKey)[1] = 5.0;

      const action = agent.selectAction(16, 10, false, false, false);
      expect(action).toBe('S'); // Stand
    });

    it('should update Q-values using Bellman updates', () => {
      const agent = new QLearningAgent({ alpha: 0.1, gamma: 0.9, epsilon: 0.0 });
      const stateKey = agent.getStateKey(16, 10, false);

      // Paso terminal
      agent.updateTerminalQValue(stateKey, 'H', -1.0);
      expect(agent.getQValues(stateKey)[0]).toBe(-0.1); // 0 + 0.1 * (-1.0 - 0) = -0.1

      // Paso intermedio
      const nextStateKey = agent.getStateKey(18, 10, false);
      agent.getQValues(nextStateKey)[1] = 0.5; // Supongamos que S en 18 es +0.5

      agent.updateQValue(stateKey, 'H', 0.0, nextStateKey);
      // Q(16, H) = -0.1 + 0.1 * (0.0 + 0.9 * 0.5 - (-0.1)) = -0.1 + 0.1 * (0.45 + 0.1) = -0.1 + 0.055 = -0.045
      expect(agent.getQValues(stateKey)[0]).toBeCloseTo(-0.045, 4);
    });

    it('should decay epsilon correctly', () => {
      const agent = new QLearningAgent({ epsilon: 1.0, epsilonDecay: 0.9, epsilonMin: 0.2 });
      agent.decayEpsilon();
      expect(agent.epsilon).toBe(0.9);
      for (let i = 0; i < 20; i++) agent.decayEpsilon();
      expect(agent.epsilon).toBe(0.2); // Llegó al mínimo
    });
  });

  describe('Genetic Engine', () => {
    it('should clone chromosome deeply', () => {
      const chrom = createDefaultChromosome();
      const clone = cloneChromosome(chrom);
      expect(clone).toEqual(chrom);
      
      // Modificar clon y validar original intacto
      clone.hard['16'][0] = 'MUTATED';
      expect(chrom.hard['16'][0]).not.toBe('MUTATED');
    });

    it('should crossover chromosomes', () => {
      const parentA = createDefaultChromosome();
      const parentB = createDefaultChromosome();
      
      // Rellenar con marcas únicas
      parentA.hard['16'] = Array(10).fill('A');
      parentB.hard['16'] = Array(10).fill('B');

      const child = crossoverChromosomes(parentA, parentB);
      // El hijo debería tener todo 'A' o todo 'B' en la fila '16' dependiendo de la aleatoriedad del corte
      expect(['A', 'B']).toContain(child.hard['16'][0]);
    });

    it('should mutate chromosomes within parameters', () => {
      const chrom = createDefaultChromosome();
      const originalHard = [...chrom.hard['16']];
      
      // Mutar con 100% de probabilidad
      mutateChromosome(chrom, 1.0);
      
      // Debería cambiar la matriz de jugadas
      const isDifferent = chrom.hard['16'].some((act, idx) => act !== originalHard[idx]);
      expect(isDifferent).toBe(true);
    });

    it('should evaluate fitness and run genetic generation', () => {
      const rules = { ...DEFAULT_RULES };
      const chrom = createDefaultChromosome();
      
      // Evaluar aptitud individual
      const indEval = evaluateFitness(chrom, rules, 100000, 100);
      expect(indEval.fitness).toBeDefined();
      expect(indEval.roi).toBeDefined();

      // Correr generación en una población
      let population = initializePopulation(4, chrom, 0.1);
      expect(population.length).toBe(4);

      // Correr una generación
      population = runGeneticGeneration(population, rules, 100000, 50, 0.2);
      expect(population.length).toBe(4);
      
      // El mejor individuo debe tener su fitness evaluada
      expect(population[0].fitness).not.toBe(-Infinity);
    });
  });
});
