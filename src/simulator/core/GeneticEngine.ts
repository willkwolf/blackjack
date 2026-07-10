import { DEFAULT_HARD_HANDS, DEFAULT_SOFT_HANDS, DEFAULT_PAIRS, StrategyMatrix, RulesConfig, BettingProgressionConfig } from './defaultStrategy.ts';
import { runMonteCarlo } from './MonteCarloSimulation.ts';

export interface Chromosome {
  hard: StrategyMatrix;
  soft: StrategyMatrix;
  pairs: StrategyMatrix;
  betting: BettingProgressionConfig;
}

export interface Individual {
  chromosome: Chromosome;
  fitness: number;
  roi: number;
  drawdown: number;
  winRate: number;
  bankruptcies: number;
}

// Genera una copia profunda de un cromosoma
export function cloneChromosome(chrom: Chromosome): Chromosome {
  return {
    hard: JSON.parse(JSON.stringify(chrom.hard)),
    soft: JSON.parse(JSON.stringify(chrom.soft)),
    pairs: JSON.parse(JSON.stringify(chrom.pairs)),
    betting: JSON.parse(JSON.stringify(chrom.betting))
  };
}

// Crea un cromosoma por defecto
export function createDefaultChromosome(baseBet: number = 2500): Chromosome {
  return {
    hard: JSON.parse(JSON.stringify(DEFAULT_HARD_HANDS)),
    soft: JSON.parse(JSON.stringify(DEFAULT_SOFT_HANDS)),
    pairs: JSON.parse(JSON.stringify(DEFAULT_PAIRS)),
    betting: {
      type: 'DSP', // DSP por defecto por ser robusta
      baseBet,
      maxProgressions: 2,
      kellyFraction: 0.5,
      stopLossPercent: 20
    }
  };
}

// Evalúa la aptitud de un individuo mediante una simulación Monte Carlo
export function evaluateFitness(
  chrom: Chromosome,
  rules: RulesConfig,
  initialBankroll: number,
  handsToSimulate: number
): Omit<Individual, 'chromosome'> {
  const simResult = runMonteCarlo(handsToSimulate, initialBankroll, rules, chrom, chrom.betting);
  
  const roi = simResult.roi;
  const drawdown = simResult.maxDrawdown;
  const bankruptcies = simResult.stats.bankruptcies;
  const winRate = simResult.winRate;

  // Ponytail: La función de aptitud está específicamente ajustada para penalizar el drawdown (varianza)
  // y las bancarrotas, además de premiar el retorno. Esto busca el balance de apuestas óptimo.
  const fitness = roi - (drawdown * 0.75) - (bankruptcies * 150);

  return {
    fitness,
    roi,
    drawdown,
    winRate,
    bankruptcies
  };
}

// Inicializa la población sembrando con el cromosoma base y aplicando mutaciones
export function initializePopulation(
  popSize: number,
  baseChrom: Chromosome,
  mutationRate: number
): Individual[] {
  const population: Individual[] = [];
  
  // El primer individuo es el original sin mutar (elitismo inicial)
  population.push({
    chromosome: cloneChromosome(baseChrom),
    fitness: -Infinity,
    roi: 0,
    drawdown: 0,
    winRate: 0,
    bankruptcies: 0
  });

  for (let i = 1; i < popSize; i++) {
    const mutatedChrom = cloneChromosome(baseChrom);
    mutateChromosome(mutatedChrom, mutationRate);
    population.push({
      chromosome: mutatedChrom,
      fitness: -Infinity,
      roi: 0,
      drawdown: 0,
      winRate: 0,
      bankruptcies: 0
    });
  }

  return population;
}

// Mutación de un cromosoma respetando las reglas de Blackjack
export function mutateChromosome(chrom: Chromosome, mutationRate: number) {
  // Mutar manos duras
  for (const val of Object.keys(chrom.hard)) {
    const valNum = parseInt(val, 10);
    let allowedActions = ['H', 'S', 'D', 'SU'];
    if (valNum >= 12 && valNum < 17) {
      allowedActions = ['H', 'S', 'SU'];
    } else if (valNum >= 17) {
      allowedActions = ['H', 'S'];
    }

    chrom.hard[val] = chrom.hard[val].map(action => {
      if (Math.random() < mutationRate) {
        return allowedActions[Math.floor(Math.random() * allowedActions.length)];
      }
      return action;
    });
  }

  // Mutar manos suaves
  for (const val of Object.keys(chrom.soft)) {
    const valNum = parseInt(val, 10);
    let allowedActions = ['H', 'S', 'D'];
    if (valNum >= 20) {
      allowedActions = ['H', 'S'];
    }

    chrom.soft[val] = chrom.soft[val].map(action => {
      if (Math.random() < mutationRate) {
        return allowedActions[Math.floor(Math.random() * allowedActions.length)];
      }
      return action;
    });
  }

  // Mutar pares
  const pairActionsList = ['SP', 'H', 'S', 'D', 'SU'];
  for (const rank of Object.keys(chrom.pairs)) {
    chrom.pairs[rank] = chrom.pairs[rank].map(action => {
      if (Math.random() < mutationRate) {
        return pairActionsList[Math.floor(Math.random() * pairActionsList.length)];
      }
      return action;
    });
  }

  // Mutar parámetros de apuestas
  if (Math.random() < mutationRate) {
    const types: ('FLAT' | 'PAROLI' | 'DSP' | 'KELLY')[] = ['FLAT', 'PAROLI', 'DSP', 'KELLY'];
    chrom.betting.type = types[Math.floor(Math.random() * types.length)];
  }

  if (Math.random() < mutationRate && chrom.betting.maxProgressions !== undefined) {
    chrom.betting.maxProgressions = Math.floor(Math.random() * 3) + 2; // 2, 3 o 4
  }

  if (Math.random() < mutationRate && chrom.betting.kellyFraction !== undefined) {
    chrom.betting.kellyFraction = Math.max(0.1, Math.min(1.0, chrom.betting.kellyFraction + (Math.random() * 0.4 - 0.2)));
  }
}

// Cruce (Crossover) entre dos cromosomas
export function crossoverChromosomes(parentA: Chromosome, parentB: Chromosome): Chromosome {
  const child = createDefaultChromosome(parentA.betting.baseBet);

  // Cruce de manos duras
  for (const val of Object.keys(child.hard)) {
    child.hard[val] = Math.random() < 0.5 
      ? [...parentA.hard[val]] 
      : [...parentB.hard[val]];
  }

  // Cruce de manos suaves
  for (const val of Object.keys(child.soft)) {
    child.soft[val] = Math.random() < 0.5 
      ? [...parentA.soft[val]] 
      : [...parentB.soft[val]];
  }

  // Cruce de pares
  for (const rank of Object.keys(child.pairs)) {
    child.pairs[rank] = Math.random() < 0.5 
      ? [...parentA.pairs[rank]] 
      : [...parentB.pairs[rank]];
  }

  // Cruce de apuestas
  child.betting = {
    type: Math.random() < 0.5 ? parentA.betting.type : parentB.betting.type,
    baseBet: parentA.betting.baseBet,
    maxProgressions: Math.random() < 0.5 ? parentA.betting.maxProgressions : parentB.betting.maxProgressions,
    kellyFraction: Math.random() < 0.5 ? parentA.betting.kellyFraction : parentB.betting.kellyFraction,
    stopLossPercent: Math.random() < 0.5 ? parentA.betting.stopLossPercent : parentB.betting.stopLossPercent
  };

  return child;
}

// Selección por torneo para elegir un progenitor
function selectParentTournament(population: Individual[], k: number = 3): Individual {
  let best = population[Math.floor(Math.random() * population.length)];
  for (let i = 1; i < k; i++) {
    const ind = population[Math.floor(Math.random() * population.length)];
    if (ind.fitness > best.fitness) {
      best = ind;
    }
  }
  return best;
}

// Ejecuta una generación completa del algoritmo genético
export function runGeneticGeneration(
  population: Individual[],
  rules: RulesConfig,
  initialBankroll: number,
  handsToSimulate: number,
  mutationRate: number
): Individual[] {
  const popSize = population.length;

  // 1. Evaluar aptitud (Fitness) para individuos no evaluados aún
  for (const ind of population) {
    if (ind.fitness === -Infinity) {
      const evaluation = evaluateFitness(ind.chromosome, rules, initialBankroll, handsToSimulate);
      Object.assign(ind, evaluation);
    }
  }

  // Ordenar población por fitness de mayor a menor
  population.sort((a, b) => b.fitness - a.fitness);

  const nextPopulation: Individual[] = [];

  // Elitismo: preservamos los mejores individuos intactos (ej: top 15%)
  const eliteSize = Math.max(1, Math.floor(popSize * 0.15));
  for (let i = 0; i < eliteSize; i++) {
    nextPopulation.push({
      chromosome: cloneChromosome(population[i].chromosome),
      fitness: population[i].fitness,
      roi: population[i].roi,
      drawdown: population[i].drawdown,
      winRate: population[i].winRate,
      bankruptcies: population[i].bankruptcies
    });
  }

  // Rellenar el resto de la población con descendientes creados mediante Cruce y Mutación
  while (nextPopulation.length < popSize) {
    const parentA = selectParentTournament(population);
    const parentB = selectParentTournament(population);
    
    let childChromosome = crossoverChromosomes(parentA.chromosome, parentB.chromosome);
    mutateChromosome(childChromosome, mutationRate);

    nextPopulation.push({
      chromosome: childChromosome,
      fitness: -Infinity, // Se evaluará en la siguiente generación
      roi: 0,
      drawdown: 0,
      winRate: 0,
      bankruptcies: 0
    });
  }

  return nextPopulation;
}
