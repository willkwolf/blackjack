import { describe, it, expect } from 'vitest';
import { Card, Hand, getDealerCardIndex, getActionFromStrategy, playRound, Deck } from '../core/BlackjackEngine.ts';
import { DEFAULT_HARD_HANDS, DEFAULT_SOFT_HANDS, DEFAULT_PAIRS, DEFAULT_RULES } from '../core/defaultStrategy.ts';

// Helper para crear una estrategia simulada
const mockStrategy = {
  hard: DEFAULT_HARD_HANDS,
  soft: DEFAULT_SOFT_HANDS,
  pairs: DEFAULT_PAIRS
};

describe('Blackjack Engine Tests', () => {
  describe('Card & Hand calculations', () => {
    it('should calculate card values correctly', () => {
      const ace = new Card('A', '♠');
      const king = new Card('K', '♥');
      const five = new Card('5', '♦');

      expect(ace.value).toBe(11);
      expect(king.value).toBe(10);
      expect(five.value).toBe(5);
    });

    it('should calculate hand values with Aces dynamically', () => {
      const hand = new Hand(2500);
      hand.addCard(new Card('A', '♠'));
      hand.addCard(new Card('A', '♥'));
      expect(hand.getValue()).toBe(12); // Uno es 11 y el otro es 1

      hand.addCard(new Card('9', '♦'));
      expect(hand.getValue()).toBe(21); // Ambos ases valen 1 ahora: 1+1+9 = 11? Wait, A (11) + A (1) + 9 = 21. Si, correcto!

      hand.addCard(new Card('2', '♣'));
      expect(hand.getValue()).toBe(13); // Ambos ases valen 1: 1+1+9+2 = 13. Correcto.
    });

    it('should detect soft hands and pairs', () => {
      const hand = new Hand(2500);
      hand.addCard(new Card('A', '♠'));
      hand.addCard(new Card('7', '♥'));
      expect(hand.isSoft()).toBe(true);
      expect(hand.getValue()).toBe(18);

      const pairHand = new Hand(2500);
      pairHand.addCard(new Card('8', '♠'));
      pairHand.addCard(new Card('8', '♥'));
      expect(pairHand.isPair()).toBe(true);
      expect(pairHand.isSoft()).toBe(false);
    });
  });

  describe('Strategy actions lookup', () => {
    it('should map dealer cards to correct table columns', () => {
      expect(getDealerCardIndex(new Card('2', '♠'))).toBe(0);
      expect(getDealerCardIndex(new Card('6', '♠'))).toBe(4);
      expect(getDealerCardIndex(new Card('10', '♠'))).toBe(8);
      expect(getDealerCardIndex(new Card('A', '♠'))).toBe(9);
    });

    it('should suggest split for pairs when appropriate', () => {
      const hand = new Hand(2500);
      hand.addCard(new Card('A', '♠'));
      hand.addCard(new Card('A', '♥'));
      const action = getActionFromStrategy(hand, new Card('10', '♦'), mockStrategy, DEFAULT_RULES);
      expect(action).toBe('SP'); // Siempre dividir ases
    });

    it('should suggest surrender or hit for hard 16', () => {
      const hand = new Hand(2500);
      hand.addCard(new Card('10', '♠'));
      hand.addCard(new Card('6', '♥'));
      
      const actionVs10 = getActionFromStrategy(hand, new Card('10', '♦'), mockStrategy, DEFAULT_RULES);
      expect(actionVs10).toBe('SU'); // Rendirse vs 10

      const actionVs7 = getActionFromStrategy(hand, new Card('7', '♦'), mockStrategy, DEFAULT_RULES);
      expect(actionVs7).toBe('H'); // Pedir vs 7
    });

    it('should fall back to Hit when Surrender is suggested by strategy but disabled in rules', () => {
      const hand = new Hand(2500);
      hand.addCard(new Card('10', '♠'));
      hand.addCard(new Card('6', '♥'));

      const rulesNoSurrender = { ...DEFAULT_RULES, surrenderAllowed: false };
      const action = getActionFromStrategy(hand, new Card('10', '♦'), mockStrategy, rulesNoSurrender);
      expect(action).toBe('H'); // Fallback de SU a H en 16 vs 10
    });

    it('should fall back to Hit when Surrender is suggested but hand has more than 2 cards', () => {
      const hand = new Hand(2500);
      hand.addCard(new Card('5', '♠'));
      hand.addCard(new Card('5', '♥'));
      hand.addCard(new Card('6', '♦')); // total 16, 3 cartas
      
      const action = getActionFromStrategy(hand, new Card('10', '♦'), mockStrategy, DEFAULT_RULES);
      expect(action).toBe('H'); // Fallback a H
    });
  });

  describe('playRound simulations', () => {
    it('should simulate a basic hand win/lose deterministically with a mocked deck', () => {
      const deck = new Deck(1);
      // Vamos a inyectar cartas específicas para una ronda determinista:
      // Reparto inicial: 
      // Jugador: 10, 10 (20)
      // Dealer: 10, 7 (17)
      deck.cards = [
        new Card('7', '♣'),  // Dealer tapada (segunda dealer)
        new Card('10', '♣'), // Jugador segunda
        new Card('10', '♦'), // Dealer expuesta (primera dealer)
        new Card('10', '♠'), // Jugador primera
      ];

      const result = playRound(DEFAULT_RULES, mockStrategy, 2500, deck);
      expect(result.hands.length).toBe(1);
      expect(result.hands[0].finalValue).toBe(20);
      expect(result.dealerValue).toBe(17);
      expect(result.hands[0].outcome).toBe('WIN');
      expect(result.totalReward).toBe(2500);
    });

    it('should simulate split hands and DAS correctly', () => {
      const deck = new Deck(1);
      // Mock de cartas:
      // Jugador: 8, 8 (se dividirá)
      // Dealer: 6 (expuesta), 10 (tapada) => 16. El dealer pedirá en 16 y se pasará con un 10.
      // Cartas a repartir en splits:
      // Mano 1 recibe 3 (total 11, se dobla si hay DAS). Recibe 10 (final 21).
      // Mano 2 recibe 10 (total 18, stand).
      // Dealer recibe 10 (se pasa, total 26).
      //
      // Orden en deck.cards (pop saca del final, así que metemos en orden inverso a como se sacarán):
      // Dealer pide carta: 10 (Busts)
      // Jugador Mano 2 (segunda carta del split): 10 (Stand en 18)
      // Jugador Mano 1 (carta doble): 10 (Stand en 21)
      // Cartas del reparto inicial y cartas del split:
      // Para el split se pide carta para Mano 1 y Mano 2.
      // Reparto inicial:
      // J1: 8
      // D1: 6 (expuesta)
      // J2: 8
      // D2: 10 (tapada)
      // Split se activa:
      // J1 recibe carta: 3 (total 11). Decisión: Doblar. Recibe carta: 10 (final 21, doble).
      // J2 recibe carta: 10 (total 18). Decisión: Stand.
      // Dealer juega: tiene 16. Pide: 10. Total 26 (Bust).
      //
      // Deck en orden inverso de pop:
      // [Dealer BUST card, J2 split card, J1 double card, J1 split card, D2, J2, D1, J1]
      deck.cards = [
        new Card('10', '♣'), // Dealer hit (10) -> se pasa
        new Card('10', '♦'), // Mano 2 segunda carta (10) -> se planta en 18
        new Card('10', '♠'), // Mano 1 doble carta (10) -> finaliza en 21
        new Card('3', '♥'),  // Mano 1 primera carta tras split (3) -> total 11 (dobla)
        new Card('10', '♥'), // D2 tapada (10)
        new Card('8', '♣'),  // J2 segunda (8)
        new Card('6', '♦'),  // D1 expuesta (6)
        new Card('8', '♦')   // J1 primera (8)
      ];

      const rules = { ...DEFAULT_RULES, dasAllowed: true };
      const result = playRound(rules, mockStrategy, 2500, deck);

      expect(result.hands.length).toBe(2);
      
      // Mano 1: 8 + 3 + 10 = 21. Dobló apuesta de 2500 a 5000. Ganó (+5000)
      expect(result.hands[0].bet).toBe(5000);
      expect(result.hands[0].finalValue).toBe(21);
      expect(result.hands[0].outcome).toBe('WIN');
      expect(result.hands[0].reward).toBe(5000);
      expect(result.hands[0].decisionSequence).toContain('D');

      // Mano 2: 8 + 10 = 18. Apuesta de 2500. Ganó (+2500)
      expect(result.hands[1].bet).toBe(2500);
      expect(result.hands[1].finalValue).toBe(18);
      expect(result.hands[1].outcome).toBe('WIN');
      expect(result.hands[1].reward).toBe(2500);

      expect(result.dealerValue).toBe(26);
      expect(result.dealerBusted).toBe(true);
      expect(result.totalBet).toBe(7500);
      expect(result.totalReward).toBe(7500);
    });
  });

  describe('Robustness and Edge Cases (Hand 19 vs Dealer 9)', () => {
    it('should recommend STAND for player hard 19 vs dealer 9', () => {
      const hand = new Hand(2500);
      hand.addCard(new Card('10', '♠'));
      hand.addCard(new Card('9', '♦'));
      expect(hand.getValue()).toBe(19);
      expect(hand.isSoft()).toBe(false);

      const action = getActionFromStrategy(hand, new Card('9', '♥'), mockStrategy, DEFAULT_RULES);
      expect(action).toBe('S'); // Stand, never Double
    });

    it('should recommend STAND for player soft 19 (A,8) vs dealer 9', () => {
      const hand = new Hand(2500);
      hand.addCard(new Card('A', '♠'));
      hand.addCard(new Card('8', '♦'));
      expect(hand.getValue()).toBe(19);
      expect(hand.isSoft()).toBe(true);

      const action = getActionFromStrategy(hand, new Card('9', '♥'), mockStrategy, DEFAULT_RULES);
      expect(action).toBe('S'); // Stand, never Double
    });

    it('should fallback from surrender (SU) to hit or stand when surrender is not allowed', () => {
      // 1. Surrender rules disabled
      const hand = new Hand(2500);
      hand.addCard(new Card('10', '♠'));
      hand.addCard(new Card('6', '♦')); // total 16
      
      const customStrategy = {
        ...mockStrategy,
        hard: {
          ...mockStrategy.hard,
          16: Array(10).fill('SU') // Recomienda surrender en todos los casos
        }
      };

      const rulesNoSurrender = { ...DEFAULT_RULES, surrenderAllowed: false };
      const action1 = getActionFromStrategy(hand, new Card('10', '♥'), customStrategy, rulesNoSurrender);
      expect(action1).toBe('H'); // Debe caer en HIT porque surrender está deshabilitado en reglas

      // 2. Surrender en mano con 3 cartas
      const hand3Cards = new Hand(2500);
      hand3Cards.addCard(new Card('8', '♠'));
      hand3Cards.addCard(new Card('5', '♦'));
      hand3Cards.addCard(new Card('3', '♣')); // total 16 con 3 cartas
      
      const action2 = getActionFromStrategy(hand3Cards, new Card('10', '♥'), customStrategy, DEFAULT_RULES);
      expect(action2).toBe('H'); // Debe caer en HIT porque tiene 3 cartas

      // 3. Surrender en mano dividida (split)
      const splitHand = new Hand(2500);
      splitHand.isSplitHand = true;
      splitHand.addCard(new Card('10', '♠'));
      splitHand.addCard(new Card('6', '♦')); // total 16 en split
      
      const action3 = getActionFromStrategy(splitHand, new Card('10', '♥'), customStrategy, DEFAULT_RULES);
      expect(action3).toBe('H'); // Debe caer en HIT porque es mano split
    });
  });
});
