import { RulesConfig, StrategyMatrix } from './defaultStrategy.ts';

export class Card {
  constructor(public rank: string, public suit: string) {}

  get value(): number {
    if (this.rank === 'A') return 11;
    if (['K', 'Q', 'J'].includes(this.rank)) return 10;
    return parseInt(this.rank, 10);
  }
}

export class Deck {
  public cards: Card[] = [];
  public cardsDealt = 0;

  constructor(public numDecks: number = 6) {
    this.reset();
  }

  public reset() {
    this.cards = [];
    this.cardsDealt = 0;
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits = ['♠', '♥', '♦', '♣'];

    for (let d = 0; d < this.numDecks; d++) {
      for (const suit of suits) {
        for (const rank of ranks) {
          this.cards.push(new Card(rank, suit));
        }
      }
    }
    this.shuffle();
  }

  public shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  public deal(): Card {
    if (this.cards.length === 0) {
      this.reset();
    }
    this.cardsDealt++;
    return this.cards.pop()!;
  }

  public needsReshuffle(penetrationPercent: number): boolean {
    const totalCards = this.numDecks * 52;
    return (this.cardsDealt / totalCards) >= (penetrationPercent / 100);
  }
}

export class Hand {
  public cards: Card[] = [];
  public decisionSequence: string[] = [];
  public isSplitHand = false;
  public isStood = false;
  public isDouble = false;
  public isSurrendered = false;

  constructor(public bet: number) {}

  public addCard(card: Card) {
    this.cards.push(card);
  }

  public getValue(): number {
    let value = 0;
    let aces = 0;

    for (const card of this.cards) {
      if (card.rank === 'A') {
        aces++;
        value += 11;
      } else {
        value += card.value;
      }
    }

    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }

    return value;
  }

  public isSoft(): boolean {
    let value = 0;
    let aces = 0;

    for (const card of this.cards) {
      if (card.rank === 'A') aces++;
      value += card.value;
    }

    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }

    return aces > 0 && value <= 21;
  }

  public isPair(): boolean {
    return this.cards.length === 2 && this.cards[0].rank === this.cards[1].rank;
  }

  public isBlackjack(): boolean {
    return this.cards.length === 2 && !this.isSplitHand && this.getValue() === 21;
  }

  public isBusted(): boolean {
    return this.getValue() > 21;
  }

  public canDouble(): boolean {
    return this.cards.length === 2 && !this.isStood && !this.isSurrendered;
  }
}

// Mapea la carta expuesta del dealer al índice (0-9) en las tablas de estrategia
export function getDealerCardIndex(dealerCard: Card): number {
  if (dealerCard.rank === 'A') return 9;
  if (['K', 'Q', 'J', '10'].includes(dealerCard.rank)) return 8;
  return dealerCard.value - 2;
}

// Obtiene la acción recomendada por la estrategia para una mano y la carta del dealer
export function getActionFromStrategy(
  playerHand: Hand,
  dealerUpcard: Card,
  strategy: { hard: StrategyMatrix; soft: StrategyMatrix; pairs: StrategyMatrix },
  rules: RulesConfig
): string {
  const dealerIdx = getDealerCardIndex(dealerUpcard);
  const playerValue = playerHand.getValue();

  // 1. Verificar si se puede dividir (Split)
  if (playerHand.isPair()) {
    const pairRank = playerHand.cards[0].rank;
    const action = strategy.pairs[pairRank]?.[dealerIdx];
    if (action === 'SP') return 'SP';
  }

  // 2. Verificar si es mano suave (Soft Hand)
  if (playerHand.isSoft() && playerValue >= 13 && playerValue <= 21) {
    const action = strategy.soft[playerValue]?.[dealerIdx];
    // Si la acción es Doblar (D) pero no se puede, resolver como Hit (H) o Stand (S)
    if (action === 'D') {
      if (!playerHand.canDouble() || (playerHand.isSplitHand && !rules.dasAllowed)) {
        // En manos suaves, si no se puede doblar, por lo general se pide (H) excepto en A,7 (18) que se planta (S)
        return playerValue >= 18 ? 'S' : 'H';
      }
    }
    return action || (playerValue >= 17 ? 'S' : 'H');
  }

  // 3. Manos duras (Hard Hand)
  if (playerValue >= 5 && playerValue <= 21) {
    const action = strategy.hard[playerValue]?.[dealerIdx];
    if (action === 'D') {
      if (!playerHand.canDouble() || (playerHand.isSplitHand && !rules.dasAllowed)) {
        return 'H';
      }
    }
    if (action === 'SU') {
      if (!rules.surrenderAllowed || !playerHand.canDouble() || playerHand.isSplitHand) {
        // Si no se permite rendición, cae en pedir (H) excepto en 17+ que se planta (S)
        return playerValue >= 17 ? 'S' : 'H';
      }
    }
    return action || (playerValue >= 17 ? 'S' : 'H');
  }

  return playerValue >= 17 ? 'S' : 'H';
}

export interface RoundResult {
  dealerCards: Card[];
  dealerValue: number;
  dealerBusted: boolean;
  dealerBJ: boolean;
  hands: {
    handId: number;
    initialCards: string[];
    finalCards: string[];
    finalValue: number;
    bet: number;
    reward: number;
    outcome: 'WIN' | 'LOSE' | 'PUSH' | 'BLACKJACK' | 'SURRENDER';
    decisionSequence: string[];
  }[];
  totalBet: number;
  totalReward: number;
}

// Simula una ronda completa de Blackjack
export function playRound(
  rules: RulesConfig,
  strategy: { hard: StrategyMatrix; soft: StrategyMatrix; pairs: StrategyMatrix },
  baseBet: number,
  deck: Deck
): RoundResult {
  // 1. Inicializar manos del jugador y del dealer
  const dealerHand = new Hand(0);
  const initialPlayerHand = new Hand(baseBet);
  
  initialPlayerHand.addCard(deck.deal());
  dealerHand.addCard(deck.deal());
  initialPlayerHand.addCard(deck.deal());
  dealerHand.addCard(deck.deal());

  const dealerUpcard = dealerHand.cards[0];
  const dealerBJ = dealerHand.isBlackjack();
  const playerBJ = initialPlayerHand.isBlackjack();

  // Si hay Blackjacks naturales
  if (dealerBJ || playerBJ) {
    let outcome: 'PUSH' | 'BLACKJACK' | 'LOSE';
    let reward = 0;

    if (playerBJ && dealerBJ) {
      outcome = 'PUSH';
      reward = 0;
    } else if (playerBJ) {
      outcome = 'BLACKJACK';
      reward = baseBet * rules.blackjackPayout;
    } else {
      outcome = 'LOSE';
      reward = -baseBet;
    }

    return {
      dealerCards: dealerHand.cards,
      dealerValue: dealerHand.getValue(),
      dealerBusted: false,
      dealerBJ,
      hands: [{
        handId: 1,
        initialCards: initialPlayerHand.cards.map(c => c.rank),
        finalCards: initialPlayerHand.cards.map(c => c.rank),
        finalValue: initialPlayerHand.getValue(),
        bet: baseBet,
        reward,
        outcome,
        decisionSequence: []
      }],
      totalBet: baseBet,
      totalReward: reward
    };
  }

  // Cola de manos del jugador para procesar (admite splits)
  const playerHands: Hand[] = [initialPlayerHand];
  let splitsCount = 0;

  for (let i = 0; i < playerHands.length; i++) {
    const hand = playerHands[i];
    
    // Si dividimos ases, por regla general sólo reciben 1 carta cada uno y se plantan automáticamente
    const isSplitAces = hand.isSplitHand && hand.cards.length === 2 && hand.cards[0].rank === 'A';
    if (isSplitAces) {
      hand.isStood = true;
      continue;
    }

    while (!hand.isStood && !hand.isBusted() && !hand.isSurrendered && hand.getValue() < 21) {
      const action = getActionFromStrategy(hand, dealerUpcard, strategy, rules);
      hand.decisionSequence.push(action);

      if (action === 'SP' && hand.isPair()) {
        if (splitsCount < rules.maxSplits) {
          splitsCount++;
          // Crear nueva mano para el split
          const splitCard = hand.cards.pop()!;
          const newHand = new Hand(baseBet);
          newHand.isSplitHand = true;
          newHand.addCard(splitCard);

          // Completar cada mano con una carta
          hand.addCard(deck.deal());
          newHand.addCard(deck.deal());

          // Insertar la nueva mano después de la actual en la cola
          playerHands.splice(i + 1, 0, newHand);

          // Si dividimos ases, forzar que standea en el siguiente ciclo
          if (hand.cards[0].rank === 'A') {
            hand.isStood = true;
            newHand.isStood = true;
            break;
          }
          // Continuar jugando la mano actual con su nueva carta
          continue;
        } else {
          // Límite de splits alcanzado, jugar como Hit
          hand.addCard(deck.deal());
        }
      } else if (action === 'SU' && hand.canDouble() && rules.surrenderAllowed && !hand.isSplitHand) {
        hand.isSurrendered = true;
        break;
      } else if (action === 'D' && hand.canDouble() && (rules.dasAllowed || !hand.isSplitHand)) {
        hand.isDouble = true;
        hand.bet *= 2;
        hand.addCard(deck.deal());
        hand.isStood = true;
      } else if (action === 'H') {
        hand.addCard(deck.deal());
      } else {
        // Stand (S)
        hand.isStood = true;
      }
    }
  }

  // 3. Jugar mano del Dealer si alguna mano del jugador está activa
  const anyHandActive = playerHands.some(h => !h.isBusted() && !h.isSurrendered);
  if (anyHandActive) {
    while (
      dealerHand.getValue() < 17 ||
      (rules.dealerHitSoft17 && dealerHand.getValue() === 17 && dealerHand.isSoft())
    ) {
      dealerHand.addCard(deck.deal());
    }
  }

  const dealerValue = dealerHand.getValue();
  const dealerBusted = dealerHand.isBusted();

  // 4. Evaluar resultados de cada mano del jugador
  let totalBet = 0;
  let totalReward = 0;

  const handsResult = playerHands.map((hand, idx) => {
    let outcome: 'WIN' | 'LOSE' | 'PUSH' | 'SURRENDER';
    let reward = 0;
    const handValue = hand.getValue();

    totalBet += hand.bet;

    if (hand.isSurrendered) {
      outcome = 'SURRENDER';
      reward = -hand.bet * 0.5;
    } else if (hand.isBusted()) {
      outcome = 'LOSE';
      reward = -hand.bet;
    } else if (dealerBusted) {
      outcome = 'WIN';
      reward = hand.bet;
    } else if (handValue > dealerValue) {
      outcome = 'WIN';
      reward = hand.bet;
    } else if (handValue < dealerValue) {
      outcome = 'LOSE';
      reward = -hand.bet;
    } else {
      outcome = 'PUSH';
      reward = 0;
    }

    totalReward += reward;

    return {
      handId: idx + 1,
      initialCards: [hand.cards[0]?.rank || '', hand.cards[1]?.rank || ''],
      finalCards: hand.cards.map(c => c.rank),
      finalValue: handValue,
      bet: hand.bet,
      reward,
      outcome,
      decisionSequence: hand.decisionSequence
    };
  });

  return {
    dealerCards: dealerHand.cards,
    dealerValue,
    dealerBusted,
    dealerBJ: false,
    hands: handsResult,
    totalBet,
    totalReward
  };
}
