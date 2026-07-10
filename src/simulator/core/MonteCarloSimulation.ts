import { Deck, playRound, RoundResult } from './BlackjackEngine.ts';
import { StrategyMatrix, RulesConfig, BettingProgressionConfig } from './defaultStrategy.ts';

export interface SimulationStats {
  handsPlayed: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  surrenders: number;
  doubles: number;
  splits: number;
  busts: number;
  totalWagered: number;
  totalWon: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  bankruptcies: number;
}

export interface SimulationResult {
  stats: SimulationStats;
  bankrollHistory: { hand: number; bankroll: number }[];
  finalBankroll: number;
  maxBankroll: number;
  minBankroll: number;
  maxDrawdown: number;
  roi: number;
  winRate: number;
  houseEdge: number;
  kellyFraction: number;
  sampleHands?: any[]; // Muestra para guardar en base de datos
}

// Función que calcula la apuesta para la siguiente mano basada en la progresión y el resultado de la anterior
export function getNextBet(
  progConfig: BettingProgressionConfig,
  currentBankroll: number,
  consecutiveWins: number,
  lastResult: number // >0 ganancia, <0 pérdida, 0 push
): number {
  const baseBet = progConfig.baseBet;
  let bet = baseBet;

  if (progConfig.type === 'FLAT') {
    bet = baseBet;
  } else if (progConfig.type === 'PAROLI') {
    const maxSteps = progConfig.maxProgressions || 2;
    if (lastResult < 0) {
      bet = baseBet;
    } else if (lastResult > 0) {
      if (consecutiveWins <= maxSteps) {
        bet = baseBet * Math.pow(2, consecutiveWins);
      } else {
        bet = baseBet;
      }
    } else {
      bet = baseBet;
    }
  } else if (progConfig.type === 'DSP') {
    if (lastResult < 0) {
      bet = baseBet;
    } else if (lastResult > 0) {
      if (consecutiveWins === 1) {
        bet = baseBet * 2;
      } else if (consecutiveWins === 2) {
        bet = baseBet * 1.5;
      } else if (consecutiveWins === 3) {
        bet = baseBet * 3;
      } else {
        bet = baseBet;
      }
    } else {
      bet = baseBet;
    }
  } else {
    // Kelly fraccional para sizing dinámico basado en ventaja teórica
    // Supone ventaja del jugador de 1% (u optimizada por GA)
    // Bet = Bankroll * Advantage * KellyFraction
    const estimatedAdvantage = 0.01; // 1%
    const fraction = progConfig.kellyFraction || 0.5; // Half-Kelly por defecto
    const kellyBet = currentBankroll * estimatedAdvantage * fraction;
    bet = Math.max(baseBet, kellyBet);
  }

  // Asegurar que la apuesta sea un múltiplo entero de la apuesta base (unidad mínima)
  const multiplier = Math.round(bet / baseBet);
  return Math.max(1, multiplier) * baseBet;
}

// Ejecuta la simulación Monte Carlo
export function runMonteCarlo(
  numRounds: number,
  initialBankroll: number,
  rules: RulesConfig,
  strategy: { hard: StrategyMatrix; soft: StrategyMatrix; pairs: StrategyMatrix },
  progConfig: BettingProgressionConfig,
  options: {
    saveHandHistoryLimit?: number; // Límite de manos a guardar
    onProgress?: (progress: number, bankroll: number) => void;
  } = {}
): SimulationResult {
  const deck = new Deck(rules.decks);
  let bankroll = initialBankroll;
  let currentBet = progConfig.baseBet;

  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  let maxBankroll = bankroll;
  let minBankroll = bankroll;
  let maxDrawdown = 0;
  let peakBankroll = bankroll;

  const stats: SimulationStats = {
    handsPlayed: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    blackjacks: 0,
    surrenders: 0,
    doubles: 0,
    splits: 0,
    busts: 0,
    totalWagered: 0,
    totalWon: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    bankruptcies: 0
  };

  const bankrollHistory: { hand: number; bankroll: number }[] = [];
  const sampleHands: any[] = [];
  const saveLimit = options.saveHandHistoryLimit || 0;

  // Intervalo de muestreo para el gráfico (máximo 500 puntos)
  const sampleInterval = Math.max(1, Math.floor(numRounds / 500));
  bankrollHistory.push({ hand: 0, bankroll });

  // Límites de Stop-Loss y Take-Profit
  const stopLossValue = progConfig.stopLossPercent 
    ? initialBankroll * (1 - progConfig.stopLossPercent / 100) 
    : 0;
  const takeProfitValue = progConfig.takeProfitPercent 
    ? initialBankroll * (1 + progConfig.takeProfitPercent / 100) 
    : Infinity;

  let stopSimulation = false;

  for (let i = 0; i < numRounds && !stopSimulation; i++) {
    // Si no alcanza para la apuesta mínima, declaramos bancarrota
    if (bankroll < currentBet) {
      stats.bankruptcies++;
      bankroll = initialBankroll; // Recarga de bankroll para continuar experimento
      currentBet = progConfig.baseBet;
      consecutiveWins = 0;
      consecutiveLosses = 0;
      peakBankroll = bankroll;
      continue;
    }

    // Ejecutar ronda
    const round: RoundResult = playRound(rules, strategy, currentBet, deck);
    
    bankroll += round.totalReward;
    stats.handsPlayed++;
    stats.totalWagered += round.totalBet;
    stats.totalWon += round.totalReward;

    // Actualizar estadísticas basadas en las manos de esta ronda
    for (const h of round.hands) {
      if (h.outcome === 'WIN' || h.outcome === 'BLACKJACK') {
        stats.wins++;
      } else if (h.outcome === 'LOSE') {
        stats.losses++;
      } else if (h.outcome === 'PUSH') {
        stats.pushes++;
      } else if (h.outcome === 'SURRENDER') {
        stats.surrenders++;
      }

      if (h.outcome === 'BLACKJACK') stats.blackjacks++;
      if (h.decisionSequence.includes('D')) stats.doubles++;
      if (round.hands.length > 1) stats.splits++; // Hubo split
      if (h.finalValue > 21) stats.busts++;
    }

    // Registrar racha y calcular la siguiente apuesta
    if (round.totalReward > 0) {
      consecutiveWins++;
      consecutiveLosses = 0;
      stats.maxConsecutiveWins = Math.max(stats.maxConsecutiveWins, consecutiveWins);
      currentBet = getNextBet(progConfig, bankroll, consecutiveWins, round.totalReward);
    } else if (round.totalReward < 0) {
      consecutiveLosses++;
      consecutiveWins = 0;
      stats.maxConsecutiveLosses = Math.max(stats.maxConsecutiveLosses, consecutiveLosses);
      currentBet = getNextBet(progConfig, bankroll, 0, round.totalReward);
    } else {
      // Push: mantenemos la apuesta anterior y no reseteamos rachas
      consecutiveWins = 0;
      consecutiveLosses = 0;
    }

    // Tracking de drawdown y extremos
    maxBankroll = Math.max(maxBankroll, bankroll);
    minBankroll = Math.min(minBankroll, bankroll);

    if (bankroll > peakBankroll) {
      peakBankroll = bankroll;
    } else {
      const drawdown = ((peakBankroll - bankroll) / peakBankroll) * 100;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    // Guardar muestra para base de datos
    if (stats.handsPlayed <= saveLimit) {
      for (const h of round.hands) {
        sampleHands.push({
          handNumber: stats.handsPlayed,
          playerCards: h.finalCards,
          dealerUpcard: round.dealerCards[0].rank,
          playerFinalValue: h.finalValue,
          dealerFinalValue: round.dealerValue,
          playerDecisionSequence: h.decisionSequence,
          betSize: h.bet,
          reward: h.reward,
          outcome: h.outcome
        });
      }
    }

    // Guardar historial de bankroll para gráfico
    if (i % sampleInterval === 0) {
      bankrollHistory.push({ hand: stats.handsPlayed, bankroll });
    }

    // Notificar progreso
    if (options.onProgress && i % 10000 === 0) {
      options.onProgress((i / numRounds) * 100, bankroll);
    }

    // Verificar Stop-Loss y Take-Profit de la sesión
    if (bankroll <= stopLossValue) {
      stopSimulation = true;
    } else if (bankroll >= takeProfitValue) {
      stopSimulation = true;
    }

    // Barajar mazo si supera la penetración (ej: 75%)
    if (deck.needsReshuffle(75)) {
      deck.reset();
    }
  }

  // Asegurar punto final en historial
  if (bankrollHistory[bankrollHistory.length - 1].hand !== stats.handsPlayed) {
    bankrollHistory.push({ hand: stats.handsPlayed, bankroll });
  }

  const roi = ((bankroll - initialBankroll) / initialBankroll) * 100;
  const winRate = stats.handsPlayed > 0 ? (stats.wins / stats.handsPlayed) * 100 : 0;
  const houseEdge = stats.totalWagered > 0 ? (-stats.totalWon / stats.totalWagered) * 100 : 0;

  // Criterio de Kelly sugerido: (p * b - q) / b
  // Para blackjack b = 1.0. Kelly = p - q.
  const p = stats.wins / stats.handsPlayed || 0;
  const q = stats.losses / stats.handsPlayed || 0;
  const kelly = p - q;

  return {
    stats,
    bankrollHistory,
    finalBankroll: bankroll,
    maxBankroll,
    minBankroll,
    maxDrawdown,
    roi,
    winRate,
    houseEdge,
    kellyFraction: kelly,
    sampleHands
  };
}
