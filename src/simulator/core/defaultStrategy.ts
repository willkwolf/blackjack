// Matriz de Estrategia Básica Estándar (semilla de optimización y benchmark)
// Acciones: 'H' (Hit), 'S' (Stand), 'D' (Double/Hit), 'SP' (Split), 'SU' (Surrender/Hit)
// Columnas corresponden al valor expuesto del Dealer: [2, 3, 4, 5, 6, 7, 8, 9, 10, 'A']

export interface StrategyMatrix {
  [key: string]: string[];
}

export const DEFAULT_HARD_HANDS: StrategyMatrix = {
  5:  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  6:  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  7:  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  8:  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  9:  ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'],
  10: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  11: ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D'],
  12: ['H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  13: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  14: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'],
  15: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'SU', 'SU'],
  16: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'SU', 'SU', 'SU'],
  17: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  18: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  19: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  20: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  21: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S']
};

export const DEFAULT_SOFT_HANDS: StrategyMatrix = {
  13: ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,2
  14: ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,3
  15: ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,4
  16: ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,5
  17: ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'], // A,6
  18: ['S', 'D', 'D', 'D', 'D', 'S', 'S', 'H', 'H', 'H'], // A,7 (doblado o stand/hit)
  19: ['S', 'S', 'S', 'S', 'D', 'S', 'S', 'S', 'S', 'S'], // A,8
  20: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'], // A,9
  21: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S']  // A,10
};

export const DEFAULT_PAIRS: StrategyMatrix = {
  'A':  ['SP', 'SP', 'SP', 'SP', 'SP', 'SP', 'SP', 'SP', 'SP', 'SP'],
  '2':  ['SP', 'SP', 'SP', 'SP', 'SP', 'SP', 'H', 'H', 'H', 'H'],
  '3':  ['SP', 'SP', 'SP', 'SP', 'SP', 'SP', 'H', 'H', 'H', 'H'],
  '4':  ['H', 'H', 'H', 'SP', 'SP', 'H', 'H', 'H', 'H', 'H'],
  '5':  ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'],
  '6':  ['SP', 'SP', 'SP', 'SP', 'SP', 'H', 'H', 'H', 'H', 'H'],
  '7':  ['SP', 'SP', 'SP', 'SP', 'SP', 'SP', 'H', 'H', 'H', 'H'],
  '8':  ['SP', 'SP', 'SP', 'SP', 'SP', 'SP', 'SP', 'SP', 'SP', 'SP'],
  '9':  ['SP', 'SP', 'SP', 'SP', 'SP', 'S', 'SP', 'SP', 'S', 'S'],
  '10': ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S']
};

export interface BettingProgressionConfig {
  type: 'FLAT' | 'PAROLI' | 'DSP' | 'KELLY';
  baseBet: number;
  maxProgressions?: number; // Para Paroli
  stopLossPercent?: number;
  takeProfitPercent?: number;
  kellyFraction?: number;  // Multiplicador Kelly para sizing dinámico
}

export interface RulesConfig {
  decks: number;
  blackjackPayout: number; // 1.5 (3:2) o 1.2 (6:5)
  dealerHitSoft17: boolean;
  surrenderAllowed: boolean;
  dasAllowed: boolean; // Double after Split
  maxSplits: number;
}

export const DEFAULT_RULES: RulesConfig = {
  decks: 6,
  blackjackPayout: 1.5,
  dealerHitSoft17: false,
  surrenderAllowed: true,
  dasAllowed: true,
  maxSplits: 3 // Permite hasta 4 manos totales
};
