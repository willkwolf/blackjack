// Agente de Aprendizaje por Refuerzo (Reinforcement Learning) usando Q-Learning
// Espacio de Estados: (playerValue, dealerUpcardValue, isSoft) -> 360 estados posibles
// Espacio de Acciones: 0 = 'H' (Hit), 1 = 'S' (Stand), 2 = 'D' (Double), 3 = 'SU' (Surrender)

export class QLearningAgent {
  public qTable: { [stateKey: string]: number[] } = {};
  public alpha: number; // Tasa de aprendizaje
  public gamma: number; // Factor de descuento
  public epsilon: number; // Probabilidad de exploración
  public epsilonDecay: number;
  public epsilonMin: number;

  private actions = ['H', 'S', 'D', 'SU'];

  constructor(
    options: {
      alpha?: number;
      gamma?: number;
      epsilon?: number;
      epsilonDecay?: number;
      epsilonMin?: number;
    } = {}
  ) {
    this.alpha = options.alpha ?? 0.1;
    this.gamma = options.gamma ?? 0.9; // En blackjack gamma suele ser menor porque las manos son cortas
    this.epsilon = options.epsilon ?? 1.0;
    this.epsilonDecay = options.epsilonDecay ?? 0.9995;
    this.epsilonMin = options.epsilonMin ?? 0.05;
  }

  // Genera la clave string para el estado
  public getStateKey(playerValue: number, dealerUpcardValue: number, isSoft: boolean): string {
    return `${playerValue}-${dealerUpcardValue}-${isSoft}`;
  }

  // Obtiene los valores Q para un estado, inicializando si no existe
  public getQValues(stateKey: string): number[] {
    if (!this.qTable[stateKey]) {
      // Inicializar con 0.0 para todas las acciones
      this.qTable[stateKey] = [0.0, 0.0, 0.0, 0.0];
    }
    return this.qTable[stateKey];
  }

  // Selecciona una acción usando una política epsilon-greedy
  public selectAction(
    playerValue: number,
    dealerUpcardValue: number,
    isSoft: boolean,
    canDouble: boolean,
    canSurrender: boolean
  ): string {
    const stateKey = this.getStateKey(playerValue, dealerUpcardValue, isSoft);
    const qValues = this.getQValues(stateKey);

    // Lista de índices de acciones válidas en este momento
    const validActionIndices = [0, 1]; // Hit y Stand siempre son válidas
    if (canDouble) validActionIndices.push(2);
    if (canSurrender) validActionIndices.push(3);

    // Epsilon-Greedy: Exploración aleatoria
    if (Math.random() < this.epsilon) {
      const randomIdx = validActionIndices[Math.floor(Math.random() * validActionIndices.length)];
      return this.actions[randomIdx];
    }

    // Explotación: elegir la mejor acción según la Q-Table
    let bestActionIdx = validActionIndices[0];
    let maxValue = qValues[bestActionIdx];

    for (const idx of validActionIndices) {
      if (qValues[idx] > maxValue) {
        maxValue = qValues[idx];
        bestActionIdx = idx;
      }
    }

    return this.actions[bestActionIdx];
  }

  // Actualiza la tabla Q tras un paso no terminal (ej. pedir carta y no pasarse)
  public updateQValue(
    stateKey: string,
    action: string,
    reward: number,
    nextStateKey: string
  ) {
    const actionIdx = this.actions.indexOf(action);
    if (actionIdx === -1) return;

    const qValues = this.getQValues(stateKey);
    const nextQValues = this.getQValues(nextStateKey);
    const maxNextQ = Math.max(...nextQValues);

    // Ecuación de Bellman clásica para Q-Learning:
    // Q(s, a) = Q(s, a) + alpha * (reward + gamma * max(Q(s', a')) - Q(s, a))
    qValues[actionIdx] += this.alpha * (reward + this.gamma * maxNextQ - qValues[actionIdx]);
  }

  // Actualiza la tabla Q tras un paso terminal (ej. plantarse, doblar, rendirse o pasarse)
  public updateTerminalQValue(stateKey: string, action: string, reward: number) {
    const actionIdx = this.actions.indexOf(action);
    if (actionIdx === -1) return;

    const qValues = this.getQValues(stateKey);
    // En estado terminal no hay s' futuro, por lo que el max(Q(s', a')) es 0
    qValues[actionIdx] += this.alpha * (reward - qValues[actionIdx]);
  }

  // Reduce el parámetro de exploración epsilon
  public decayEpsilon() {
    this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
  }

  // Exporta la política aprendida en forma de matrices compatibles con el simulador
  public exportToStrategyMatrices(): {
    hard: { [key: string]: string[] };
    soft: { [key: string]: string[] };
    pairs: { [key: string]: string[] };
  } {
    const hard: { [key: string]: string[] } = {};
    const soft: { [key: string]: string[] } = {};
    const pairs: { [key: string]: string[] } = {};

    // Rellenar con estructuras por defecto vacías
    for (let player = 5; player <= 21; player++) {
      hard[player] = Array(10).fill('H');
    }
    for (let player = 13; player <= 21; player++) {
      soft[player] = Array(10).fill('H');
    }
    // Para pares, el agente Q-learning estándar no modela las divisiones directamente
    // a menos que expandamos el espacio de estados. En su lugar, copiamos los pares por defecto.
    const defaultPairs = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    for (const p of defaultPairs) {
      pairs[p] = Array(10).fill('H');
    }

    // Traducir las mejores acciones de la Q-table a las matrices
    for (const stateKey of Object.keys(this.qTable)) {
      const [playerStr, dealerStr, isSoftStr] = stateKey.split('-');
      const playerVal = parseInt(playerStr, 10);
      const dealerVal = parseInt(dealerStr, 10);
      const isSoft = isSoftStr === 'true';

      const qValues = this.qTable[stateKey];
      // Encontrar la mejor acción
      let bestActionIdx = 0;
      let maxQ = qValues[0];
      for (let j = 1; j < qValues.length; j++) {
        if (qValues[j] > maxQ) {
          maxQ = qValues[j];
          bestActionIdx = j;
        }
      }
      const bestAction = this.actions[bestActionIdx];

      // Mapear dealerVal (2-11) a índice de columna (0-9)
      const colIdx = dealerVal === 11 ? 9 : dealerVal - 2;

      if (isSoft) {
        if (playerVal >= 13 && playerVal <= 21) {
          soft[playerVal][colIdx] = bestAction;
        }
      } else {
        if (playerVal >= 5 && playerVal <= 21) {
          hard[playerVal][colIdx] = bestAction;
        }
      }
    }

    return { hard, soft, pairs };
  }
}
