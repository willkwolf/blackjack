import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, RotateCcw, Info, Plus, Minus, FileText } from 'lucide-react';
import { Hand, Deck, getActionFromStrategy } from '../../simulator/core/BlackjackEngine.ts';
import { Chromosome } from '../../simulator/core/GeneticEngine.ts';
import { RulesConfig } from '../../simulator/core/defaultStrategy.ts';
import { getNextBet } from '../../simulator/core/MonteCarloSimulation.ts';

interface TrainerTableProps {
  db: any;
  strategy: Chromosome;
  rules: RulesConfig;
  strategySource: 'goykhman' | 'buramdoyal' | 'taylor' | 'custom';
}

interface PlayError {
  handDesc: string;
  dealerCard: string;
  userChoice: string;
  correctChoice: string;
  explanation: string;
  timestamp: string;
}

// Desglose de apuesta en fichas reales de casino
const getChipsForBet = (bet: number): number[] => {
  const denominations = [50000, 25000, 10000, 5000, 2500];
  const chips: number[] = [];
  let remaining = bet;
  for (const denom of denominations) {
    while (remaining >= denom) {
      chips.push(denom);
      remaining -= denom;
    }
  }
  return chips;
};

// Componente visual para la pila de fichas apiladas
const ChipStack = ({ bet }: { bet: number }) => {
  const chips = getChipsForBet(bet);
  if (chips.length === 0) return null;

  // Altura dinámica según la cantidad de fichas apiladas
  const stackHeight = 42 + (chips.length - 1) * 6;

  return (
    <div className="table-chip-container" style={{ height: `${stackHeight}px`, width: '100%' }}>
      {chips.map((val, idx) => {
        const displayVal = val >= 1000 ? `${val / 1000}k` : `${val}`;
        return (
          <div
            key={idx}
            className={`table-chip chip-${val}`}
            style={{
              bottom: `${idx * 6}px`,
              zIndex: idx + 1,
            }}
          >
            {displayVal}
          </div>
        );
      })}
    </div>
  );
};

export default function TrainerTable({ strategy, rules, strategySource }: TrainerTableProps) {
  // Configuración del Capital y Apuesta
  const [bankroll, setBankroll] = useState(1000000); // 1,000,000 COP por defecto (bankroll ideal)
  const [betSize, setBetSize] = useState(2500); // Unidad mínima de apuesta
  const [gameState, setGameState] = useState<'betting' | 'playing' | 'dealer_turn' | 'round_end'>('betting');
  
  // Baraja y manos
  const [deck, setDeck] = useState<Deck | null>(null);
  const [playerHands, setPlayerHands] = useState<Hand[]>([]);
  const [activeHandIdx, setActiveHandIdx] = useState(0);
  const [dealerHand, setDealerHand] = useState<Hand | null>(null);
  
  // Historial de rachas
  const [consecutiveWins, setConsecutiveWins] = useState(0);
  const [lastRoundResult, setLastRoundResult] = useState(0);

  // Modos de Práctica: 'ensayo_error' o 'estudio'
  const [practiceMode, setPracticeMode] = useState<'ensayo_error' | 'estudio'>('ensayo_error');

  // Seguros
  const [insuranceOffered, setInsuranceOffered] = useState(false);
  const [boughtInsurance, setBoughtInsurance] = useState(false);

  // Animaciones de Pavlov
  const [flashError, setFlashError] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);

  // Reporte de Sesión y Estadísticas
  const [totalPlays, setTotalPlays] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [errorsList, setErrorsList] = useState<PlayError[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);

  // Registro del tutor de entrenamiento (mensajes inmediatos)
  const [trainerMsg, setTrainerMsg] = useState<{ type: 'success' | 'warning' | 'info'; text: string } | null>({
    type: 'info',
    text: 'Coloca tu apuesta en COP. El tutor verificará si sigues la progresión óptima de mitigación de varianza.'
  });
  const [log, setLog] = useState<string[]>([]);

  // Estados para Gestos Táctiles/Mouse de Casino Real
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [holdProgress, setHoldProgress] = useState(0); // 0 a 100
  const [holdInterval, setHoldInterval] = useState<any>(null);
  
  const [swipeStart, setSwipeStart] = useState(0);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  // Limpieza del intervalo de hold al desmontar
  useEffect(() => {
    return () => {
      if (holdInterval) clearInterval(holdInterval);
    };
  }, [holdInterval]);

  // Doble click en el tapete para Pedir (Hit)
  const handleTableDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (gameState !== 'playing') return;
    if (insuranceOffered) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newRipple = { id: Date.now(), x, y };
    setRipples(prev => [...prev, newRipple]);

    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== newRipple.id));
    }, 500);

    handlePlayerAction('H');
  };

  // Click sostenido arriba de las cartas para Plantarse (Stand)
  const handleHoldStart = () => {
    if (gameState !== 'playing') return;
    if (insuranceOffered) return;

    if (holdInterval) clearInterval(holdInterval);

    let progress = 0;
    setHoldProgress(0);

    const interval = setInterval(() => {
      progress += 8;
      if (progress >= 100) {
        clearInterval(interval);
        setHoldInterval(null);
        setHoldProgress(0);
        handlePlayerAction('S');
      } else {
        setHoldProgress(progress);
      }
    }, 50);

    setHoldInterval(interval);
  };

  const handleHoldEnd = () => {
    if (holdInterval) {
      clearInterval(holdInterval);
      setHoldInterval(null);
    }
    setHoldProgress(0);
  };

  // Arrastre abajo de las cartas para Rendición (Surrender)
  const handleSwipeStart = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (gameState !== 'playing') return;
    if (insuranceOffered) return;
    setIsSwiping(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setSwipeStart(clientX);
  };

  const handleSwipeMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!isSwiping) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const diffX = clientX - swipeStart;
    
    // Solo permitir deslizar hacia la derecha (valores positivos) hasta 90px
    const newX = Math.max(0, Math.min(90, diffX));
    setSwipeX(newX);

    if (newX >= 80) {
      setIsSwiping(false);
      setSwipeX(0);
      handlePlayerAction('SU');
    }
  };

  const handleSwipeEnd = () => {
    setIsSwiping(false);
    setSwipeX(0);
  };

  // Inicializar baraja
  useEffect(() => {
    const d = new Deck(rules.decks);
    setDeck(d);
  }, [rules.decks]);

  // Sintetizador de sonido con Web Audio API (evita assets rotos y CORS)
  const playSound = (type: 'success' | 'error') => {
    if (typeof window === 'undefined') return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        // Arpegio feliz ascendente (notas C5 -> E5 -> G5)
        const now = ctx.currentTime;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else {
        // Zumbador triste descendente (sawtooth áspero de 180Hz bajando a 90Hz)
        const now = ctx.currentTime;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(90, now + 0.3);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (err) {
      console.error('Error playing sound:', err);
    }
  };

  // Motor dinámico de explicación del EV
  const explainDecision = (
    dealerCardVal: number,
    correct: string
  ): string => {
    if (correct === 'SU') {
      return `Rendirse (SU) tiene un EV garantizado de -0.50 (pérdida exacta del 50%). Para un 16 vs 10 del Dealer, el EV de Pedir es -0.53 y el de Plantarse es -0.54. Rendirse minimiza pérdidas a largo plazo.`;
    }
    if (correct === 'SP') {
      return `Dividir (SP) te permite separar tu pareja en dos manos independientes de mayor expectativa matemática. No dividir esta pareja disminuye drásticamente el ROI y incrementa la ventaja de la casa.`;
    }
    if (correct === 'D') {
      return `Doblar (D) aprovecha la debilidad visible del Dealer. Con un EV superior a +0.20, duplicar tu apuesta en esta situación es vital para compensar las rachas de varianza negativa.`;
    }
    if (correct === 'S') {
      if (dealerCardVal <= 6) {
        return `Plantarse (S) es óptimo porque el Dealer muestra carta débil (${dealerCardVal}) y tiene alrededor de 35%-42% de probabilidades de pasarse (busto). No arriesgues tu mano pasándote tú primero.`;
      }
      return `Plantarse (S) con manos duras altas (17+) evita el alto riesgo de pasarte. El Dealer tiene más opciones de pasarse que tú de obtener un 20 o 21 pidiendo carta.`;
    }
    if (correct === 'H') {
      return `Pedir (H) es la única jugada matemática viable. El Dealer tiene carta fuerte (${dealerCardVal === 11 ? 'A' : dealerCardVal}) y es muy probable que alcance una mano ganadora (17-21). Debes tomar el riesgo para intentar superarlo.`;
    }
    return `Esta jugada maximiza el Valor Esperado (EV) y mitiga la ventaja matemática del casino.`;
  };

  // Ejecuta la jugada inicial (Repartir)
  const handleDeal = () => {
    if (!deck) return;

    // Verificar bankroll suficiente
    if (bankroll < betSize) {
      alert('Bankroll insuficiente para colocar esta apuesta.');
      return;
    }

    // 1. Evaluar si la apuesta sigue la progresión óptima (DSP)
    const expectedOptimalBet = getNextBet(strategy.betting, bankroll, consecutiveWins, lastRoundResult);
    if (betSize !== expectedOptimalBet) {
      // Registrar desvío de apuesta
      setTotalPlays(prev => prev + 1);
      setErrorCount(prev => prev + 1);
      
      const playErr: PlayError = {
        handDesc: `Apuesta Inicial: $${betSize.toLocaleString()} COP`,
        dealerCard: 'N/A',
        userChoice: `Apostar $${betSize.toLocaleString()}`,
        correctChoice: `Apostar $${expectedOptimalBet.toLocaleString()}`,
        explanation: `La progresión teórica DSP solicita una apuesta de $${expectedOptimalBet.toLocaleString()} COP para este paso de racha. Desviarse de la progresión expone tu capital a mayor riesgo de ruina.`,
        timestamp: new Date().toLocaleTimeString()
      };
      setErrorsList(prev => [playErr, ...prev]);

      if (practiceMode === 'ensayo_error') {
        playSound('error');
        setFlashError(true);
        setTimeout(() => setFlashError(false), 500);
        setTrainerMsg({
          type: 'warning',
          text: `⚠️ Alerta de Apuesta: Apostaste $${betSize.toLocaleString()} COP, pero el modelo DSP recomendaba $${expectedOptimalBet.toLocaleString()} COP. ¡Controla tu varianza!`
        });
      }
      addLog(`Tutor: Apuesta incorrecta de $${betSize.toLocaleString()} COP. Esperada: $${expectedOptimalBet.toLocaleString()} COP.`);
    } else {
      setTotalPlays(prev => prev + 1);
      if (practiceMode === 'ensayo_error') {
        playSound('success');
        setFlashSuccess(true);
        setTimeout(() => setFlashSuccess(false), 500);
        setTrainerMsg({
          type: 'success',
          text: `✅ Apuesta Correcta: $${betSize.toLocaleString()} COP sigue la progresión teórica óptima.`
        });
      }
    }

    // Cobrar apuesta
    setBankroll(prev => prev - betSize);

    // Inicializar manos
    const newPlayerHand = new Hand(betSize);
    const newDealerHand = new Hand(0);

    newPlayerHand.addCard(deck.deal());
    newDealerHand.addCard(deck.deal()); // Expuesta (0)
    newPlayerHand.addCard(deck.deal());
    newDealerHand.addCard(deck.deal()); // Oculta (1)

    setPlayerHands([newPlayerHand]);
    setActiveHandIdx(0);
    setDealerHand(newDealerHand);
    setBoughtInsurance(false);

    const dealerUpcard = newDealerHand.cards[0];
    const pBJ = newPlayerHand.isBlackjack();

    // Regla de Casino: Si el dealer muestra un As, se ofrece seguro antes de evaluar Blackjacks
    if (dealerUpcard.rank === 'A') {
      setInsuranceOffered(true);
      setGameState('playing');
      if (practiceMode === 'ensayo_error') {
        setTrainerMsg({
          type: 'info',
          text: 'El Dealer muestra un As. ¿Deseas comprar un seguro por el 50% de tu apuesta original?'
        });
      }
    } 
    // Si muestra una carta de valor 10, revisa Blackjack silenciosamente
    else if (['10', 'J', 'Q', 'K'].includes(dealerUpcard.rank)) {
      const dBJ = newDealerHand.isBlackjack();
      if (dBJ || pBJ) {
        setGameState('round_end');
        resolveRound([newPlayerHand], newDealerHand, true, false);
      } else {
        setGameState('playing');
      }
    } 
    // Carta normal (2-9)
    else {
      if (pBJ) {
        setGameState('round_end');
        resolveRound([newPlayerHand], newDealerHand, true, false);
      } else {
        setGameState('playing');
      }
    }
  };

  // Maneja la compra de Seguros
  const handleInsurance = (buy: boolean) => {
    if (!dealerHand || playerHands.length === 0) return;
    const currentHand = playerHands[0];
    const isDealerBJ = dealerHand.isBlackjack();
    const isPlayerBJ = currentHand.isBlackjack();

    setInsuranceOffered(false);
    setBoughtInsurance(buy);

    // Evaluar la decisión del seguro (EV es -7.69% en multibaraja, siempre es error matemático sin conteo)
    setTotalPlays(prev => prev + 1);
    if (buy) {
      setErrorCount(prev => prev + 1);
      const playErr: PlayError = {
        handDesc: `Mano inicial: ${currentHand.cards.map(c=>c.rank).join(', ')}`,
        dealerCard: 'As',
        userChoice: 'Comprar Seguro',
        correctChoice: 'Rechazar Seguro',
        explanation: 'Comprar seguro es una apuesta paralela con un EV negativo del -7.69%. Estadísticamente, los papers confirman que a largo plazo desgasta el bankroll del jugador y beneficia al casino.',
        timestamp: new Date().toLocaleTimeString()
      };
      setErrorsList(prev => [playErr, ...prev]);

      if (practiceMode === 'ensayo_error') {
        playSound('error');
        setFlashError(true);
        setTimeout(() => setFlashError(false), 500);
        setTrainerMsg({
          type: 'warning',
          text: '⚠️ Seguro Incorrecto: El seguro tiene un EV de -7.69% (Expectativa Matemática Negativa). ¡No lo compres!'
        });
      }
      // Cobrar costo de seguro
      setBankroll(prev => prev - betSize * 0.5);
    } else {
      if (practiceMode === 'ensayo_error') {
        playSound('success');
        setFlashSuccess(true);
        setTimeout(() => setFlashSuccess(false), 500);
        setTrainerMsg({
          type: 'success',
          text: '✅ ¡Excelente decisión! Rechazar el seguro es la jugada matemática óptima a largo plazo.'
        });
      }
    }

    // Resolver ronda inmediatamente si el dealer tiene Blackjack
    if (isDealerBJ || isPlayerBJ) {
      setGameState('round_end');
      resolveRound(playerHands, dealerHand, true, buy);
    } else {
      if (buy) {
        addLog(`Jugador compró Seguro por $${(betSize * 0.5).toLocaleString()} COP.`);
      }
      setGameState('playing');
    }
  };

  // Resuelve las apuestas al final de la ronda
  const resolveRound = (hands: Hand[], dealer: Hand, naturalBJ = false, gotInsurance = false) => {
    let roundNetReward = 0;
    
    // Si no hubo blackjack natural, el dealer juega su mano
    if (!naturalBJ) {
      const anyHandActive = hands.some(h => !h.isBusted() && !h.isSurrendered);
      if (anyHandActive && deck) {
        while (
          dealer.getValue() < 17 ||
          (rules.dealerHitSoft17 && dealer.getValue() === 17 && dealer.isSoft())
        ) {
          dealer.addCard(deck.deal());
        }
      }
    }

    const dVal = dealer.getValue();
    const dBusted = dealer.isBusted();
    const dBJ = dealer.isBlackjack();

    const handSummaries = hands.map((hand, idx) => {
      let outcome: 'WIN' | 'LOSE' | 'PUSH' | 'SURRENDER' | 'BLACKJACK';
      let payout = 0;

      if (hand.isSurrendered) {
        outcome = 'SURRENDER';
        payout = hand.bet * 0.5; // Late Surrender devuelve 50%
      } else if (hand.isBusted()) {
        outcome = 'LOSE';
        payout = 0;
      } else if (hand.isBlackjack() && !dBJ) {
        outcome = 'BLACKJACK';
        payout = hand.bet + hand.bet * rules.blackjackPayout; 
      } else if (dBusted) {
        outcome = 'WIN';
        payout = hand.bet * 2;
      } else if (hand.getValue() > dVal) {
        outcome = 'WIN';
        payout = hand.bet * 2;
      } else if (hand.getValue() < dVal) {
        outcome = 'LOSE';
        payout = 0;
      } else {
        outcome = 'PUSH';
        payout = hand.bet;
      }

      const netProfit = payout - hand.bet;
      roundNetReward += netProfit;

      return `Mano ${idx + 1}: ${outcome} (${netProfit >= 0 ? '+' : ''}$${netProfit.toLocaleString()} COP)`;
    });

    // Calcular retorno acumulado de manos principales
    let totalPayout = hands.reduce((sum, h) => {
      if (h.isSurrendered) return sum + h.bet * 0.5;
      if (h.isBusted()) return sum;
      if (h.isBlackjack() && !dBJ) return sum + h.bet * (1 + rules.blackjackPayout);
      if (dBusted || h.getValue() > dVal) return sum + h.bet * 2;
      if (h.getValue() === dVal) return sum + h.bet;
      return sum;
    }, 0);

    // Calcular seguro si se compró
    if (gotInsurance) {
      if (dBJ) {
        // Seguro gana 2:1 -> recupera su apuesta de seguro (0.5 * betSize) + ganancia (2 * 0.5 * betSize = betSize)
        // Payout total del seguro = 1.5 * betSize
        totalPayout += betSize * 1.5;
        roundNetReward += betSize; // Ganancia neta de seguro compensa pérdida de mano principal
        addLog(`Seguro Ganado (+ $${betSize.toLocaleString()} COP)`);
      } else {
        // Seguro perdido (ya fue restado del bankroll en handleInsurance)
        addLog(`Seguro Perdido (- $${(betSize * 0.5).toLocaleString()} COP)`);
      }
    }

    setBankroll(prev => prev + totalPayout);
    setLastRoundResult(roundNetReward);

    // Ajustar racha y registros
    if (roundNetReward > 0) {
      setConsecutiveWins(prev => prev + 1);
      addLog(`Ronda: Victoria Neta (${roundNetReward >= 0 ? '+' : ''}$${roundNetReward.toLocaleString()} COP). Racha: ${consecutiveWins + 1}`);
    } else if (roundNetReward < 0) {
      setConsecutiveWins(0);
      addLog(`Ronda: Pérdida Neta ($${roundNetReward.toLocaleString()} COP). Racha reseteada.`);
    } else {
      addLog(`Ronda: Empate.`);
    }

    addLog(handSummaries.join(' | ') + ` | Dealer finalizó con ${dVal}`);
    setGameState('round_end');
  };

  // Valida e intercepta la acción del jugador en el trainer
  const handlePlayerAction = (action: 'H' | 'S' | 'D' | 'SU' | 'SP') => {
    if (!deck || playerHands.length === 0 || !dealerHand) return;
    
    const currentHand = playerHands[activeHandIdx];
    const dealerUpcard = dealerHand.cards[0];

    // 1. Obtener acción óptima teórica usando RulesConfig completo
    const optimalAction = getActionFromStrategy(currentHand, dealerUpcard, strategy, rules);

    // 2. Dar retroalimentación de entrenamiento
    setTotalPlays(prev => prev + 1);
    if (action !== optimalAction) {
      setErrorCount(prev => prev + 1);
      const explanationText = explainDecision(dealerUpcard.value, optimalAction);
      
      const playErr: PlayError = {
        handDesc: `Mano: ${currentHand.cards.map(c=>c.rank).join(', ')} (${currentHand.isSoft() ? 'Suave' : 'Dura'} ${currentHand.getValue()})`,
        dealerCard: dealerUpcard.rank === 'A' ? 'A' : `${dealerUpcard.value}`,
        userChoice: action === 'H' ? 'HIT' : action === 'S' ? 'STAND' : action === 'D' ? 'DOUBLE' : action === 'SU' ? 'SURRENDER' : 'SPLIT',
        correctChoice: optimalAction === 'H' ? 'HIT' : optimalAction === 'S' ? 'STAND' : optimalAction === 'D' ? 'DOUBLE' : optimalAction === 'SU' ? 'SURRENDER' : 'SPLIT',
        explanation: explanationText,
        timestamp: new Date().toLocaleTimeString()
      };
      setErrorsList(prev => [playErr, ...prev]);

      if (practiceMode === 'ensayo_error') {
        playSound('error');
        setFlashError(true);
        setTimeout(() => setFlashError(false), 500);
        setTrainerMsg({
          type: 'warning',
          text: `❌ Error de Decisión: Elegiste ${playErr.userChoice}. Lo óptimo era ${playErr.correctChoice}.\n${explanationText}`
        });
      }
      addLog(`Tutor: Alerta en Mano ${activeHandIdx + 1}. Decisión: ${action}. Óptimo: ${optimalAction}.`);
    } else {
      if (practiceMode === 'ensayo_error') {
        playSound('success');
        setFlashSuccess(true);
        setTimeout(() => setFlashSuccess(false), 500);
        setTrainerMsg({
          type: 'success',
          text: '✅ ¡Decisión Óptima! Minimizas matemáticamente la ventaja de la casa y controlas la varianza.'
        });
      }
    }

    // 3. Ejecutar la acción en la mesa 2D (incluso con error)
    const updatedHands = [...playerHands];

    if (action === 'H') {
      currentHand.addCard(deck.deal());
      if (currentHand.isBusted()) {
        addLog(`Mano ${activeHandIdx + 1}: Te pasaste con ${currentHand.getValue()}`);
        moveToNextHand(updatedHands);
      }
    } else if (action === 'S') {
      currentHand.isStood = true;
      moveToNextHand(updatedHands);
    } else if (action === 'D') {
      // Restar bankroll por doblar apuesta
      setBankroll(prev => prev - currentHand.bet);
      currentHand.bet *= 2;
      currentHand.addCard(deck.deal());
      currentHand.isStood = true;
      moveToNextHand(updatedHands);
    } else if (action === 'SU') {
      // Rendición Tardía (Late Surrender)
      currentHand.isSurrendered = true;
      moveToNextHand(updatedHands);
    } else if (action === 'SP') {
      // Split (Dividir)
      const splitCard = currentHand.cards.pop()!;
      const newHand = new Hand(currentHand.bet);
      currentHand.isSplitHand = true;
      newHand.isSplitHand = true;
      newHand.addCard(splitCard);

      // Cobrar segunda apuesta
      setBankroll(prev => prev - currentHand.bet);

      // Completar ambas manos
      currentHand.addCard(deck.deal());
      newHand.addCard(deck.deal());

      updatedHands.splice(activeHandIdx + 1, 0, newHand);
      setPlayerHands(updatedHands);

      if (currentHand.cards[0].rank === 'A') {
        currentHand.isStood = true;
        newHand.isStood = true;
        moveToNextHand(updatedHands);
      }
    }

    setPlayerHands(updatedHands);
  };

  const moveToNextHand = (hands: Hand[]) => {
    let nextIdx = activeHandIdx + 1;
    // Buscar la siguiente mano que no esté plantada, pasada o rendida
    while (nextIdx < hands.length && (hands[nextIdx].isStood || hands[nextIdx].isBusted() || hands[nextIdx].isSurrendered)) {
      nextIdx++;
    }

    if (nextIdx < hands.length) {
      setActiveHandIdx(nextIdx);
    } else {
      setGameState('dealer_turn');
      setTimeout(() => {
        resolveRound(hands, dealerHand!, false, boughtInsurance);
      }, 850);
    }
  };

  const addLog = (msg: string) => {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 15)]);
  };

  const handleResetTrainer = () => {
    setBankroll(1000000); // Reset a $1,000,000 COP
    setConsecutiveWins(0);
    setLastRoundResult(0);
    setTotalPlays(0);
    setErrorCount(0);
    setErrorsList([]);
    setGameState('betting');
    setPlayerHands([]);
    setDealerHand(null);
    setTrainerMsg({
      type: 'info',
      text: 'Entrenador reiniciado. Progresión COP de $2,500 lista.'
    });
    setLog([]);
  };

  const activeHand = playerHands[activeHandIdx];

  // Explicación de la validación de la estrategia activa
  const getStrategyExplanation = () => {
    switch (strategySource) {
      case 'goykhman':
        return {
          title: 'Goykhman (2017) - Evolutivo',
          desc: 'Matriz evolucionada mediante Algoritmo Genético sobre 100 generaciones. ROI óptimo teórico: -0.42% COP. Diseñada para aplastar el Drawdown.',
          bankroll: '$1,000,000 COP (400 unidades de $2,500 COP para soportar oscilaciones de varianza).'
        };
      case 'buramdoyal':
        return {
          title: 'Buramdoyal (2023) - Q-Learning IA',
          desc: 'Matriz Q-Table exportada desde tu sesión de entrenamiento interactivo. Evaluada por ensayo y error según recompensa de Bellman.',
          bankroll: '$1,000,000 COP sugeridos como base.'
        };
      case 'taylor':
      default:
        return {
          title: 'Marino & Taylor (2014) - Matemática Exacta',
          desc: 'Matriz clásica calculada analíticamente mediante combinatoria de composición de enteros. Expectativa exacta de retorno del 99.45% COP.',
          bankroll: '$1,000,000 COP (400 unidades de $2,500 COP para riesgo de ruina < 0.8% bajo progresión DSP).'
        };
    }
  };

  const stratInfo = getStrategyExplanation();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '30px' }}>
      
      {/* Mesa 2D de Juego */}
      <section className={`glass-panel ${flashError ? 'shake-panel glow-red' : flashSuccess ? 'glow-green' : ''}`} style={{
        backgroundImage: 'radial-gradient(circle, #0e4c2b 0%, #031b0f 100%)',
        border: '3px solid var(--felt-border)',
        boxShadow: 'inset 0 0 100px rgba(0,0,0,0.8), 0 8px 30px rgba(0,0,0,0.5)',
        minHeight: '560px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        transition: 'border 0.15s ease-in-out'
      }}>
        
        {/* Tutor de Entrenamiento */}
        {trainerMsg && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 18px',
            borderRadius: '8px',
            background: trainerMsg.type === 'success' 
              ? 'rgba(0, 230, 118, 0.15)' 
              : trainerMsg.type === 'warning' 
                ? 'rgba(255, 23, 68, 0.15)' 
                : 'rgba(212,175,55,0.12)',
            border: `1px solid ${
              trainerMsg.type === 'success' 
                ? 'var(--green-neon)' 
                : trainerMsg.type === 'warning' 
                  ? 'var(--red-neon)' 
                  : 'var(--gold)'
            }`,
            fontSize: '0.85rem',
            color: '#fff',
            fontFamily: 'Inter, sans-serif'
          }}>
            {trainerMsg.type === 'success' ? (
              <CheckCircle size={20} style={{ color: 'var(--green-neon)', flexShrink: 0 }} />
            ) : (
              <AlertCircle size={20} style={{ color: trainerMsg.type === 'warning' ? 'var(--red-neon)' : 'var(--gold)', flexShrink: 0 }} />
            )}
            <p style={{ whiteSpace: 'pre-line', lineHeight: '1.4' }}>{trainerMsg.text}</p>
          </div>
        )}

        {/* Modal de Seguros (Superposición Interactiva) */}
        {insuranceOffered && (
          <div className="glass-panel" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10,
            background: 'rgba(5, 20, 12, 0.95)',
            border: '2px solid var(--gold)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
            width: '320px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            padding: '20px'
          }}>
            <h4 style={{ color: 'var(--gold)', fontSize: '1.1rem' }}>🛡️ ¿Comprar Seguro?</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              El dealer muestra un As. El seguro cuesta 50% de tu apuesta ($${(betSize * 0.5).toLocaleString()} COP) y paga 2:1 si el dealer tiene Blackjack.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => handleInsurance(true)} className="casino-btn btn-deal" style={{ flexGrow: 1 }}>Sí, Seguro</button>
              <button onClick={() => handleInsurance(false)} className="casino-btn btn-surrender" style={{ flexGrow: 1 }}>No, Rechazar</button>
            </div>
          </div>
        )}

        {/* Croupier (Dealer) Area */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginTop: '20px' }}>
          <p style={{ color: 'var(--gold)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Dealer
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            {dealerHand?.cards.map((card, idx) => {
              const isHidden = idx === 1 && gameState === 'playing';
              const isRed = ['♥', '♦'].includes(card.suit);
              return (
                <div 
                  key={idx} 
                  className={`playing-card ${isHidden ? 'card-hidden' : ''} ${isRed && !isHidden ? 'red-suit' : ''}`}
                >
                  {!isHidden && (
                    <>
                      <div>{card.rank}</div>
                      <div className="card-suit-center">{card.suit}</div>
                      <div style={{ transform: 'rotate(180deg)', textAlign: 'right' }}>{card.rank}</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Zona de Juego Principal (Cartas Jugador) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '50px', justifyContent: 'center' }}>
            {gameState === 'betting' ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px 40px',
                borderRadius: '16px',
                border: '2px dashed var(--gold)',
                background: 'rgba(212, 175, 55, 0.05)',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.6)',
                minWidth: '140px',
                minHeight: '140px',
                transition: 'all 0.3s ease'
              }}>
                <ChipStack bet={betSize} />
                <span style={{ color: 'var(--gold)', fontSize: '0.85rem', fontWeight: 'bold', marginTop: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Apuesta
                </span>
                <span style={{ color: '#fff', fontSize: '0.8rem', opacity: 0.8, marginTop: '2px' }}>
                  ${betSize.toLocaleString()} COP
                </span>
              </div>
            ) : (
              playerHands.map((hand, idx) => {
                const isActive = idx === activeHandIdx && gameState === 'playing';
                const canSurrender = rules.surrenderAllowed && !hand.isSplitHand && hand.cards.length === 2 && isActive;
                return (
                  <div 
                    key={idx} 
                    onDoubleClick={isActive && !insuranceOffered ? handleTableDoubleClick : undefined}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '10px',
                      padding: isActive ? '15px 25px' : '10px 15px',
                      borderRadius: '12px',
                      border: isActive ? '2px dashed var(--gold)' : '2px solid transparent',
                      background: isActive ? 'rgba(212,175,55,0.05)' : 'none',
                      position: 'relative',
                      minWidth: '180px',
                      cursor: isActive ? 'pointer' : 'default',
                      userSelect: 'none',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    {/* Ripples de doble click */}
                    {isActive && ripples.map(ripple => (
                      <div
                        key={ripple.id}
                        className="felt-tap-ripple"
                        style={{ left: ripple.x, top: ripple.y }}
                      />
                    ))}

                    {/* Overlay de progreso circular al mantener click */}
                    {isActive && holdProgress > 0 && (
                      <div className="gesture-progress-overlay">
                        <svg width="60" height="60">
                          <circle
                            cx="30"
                            cy="30"
                            r="22"
                            stroke="rgba(255,255,255,0.15)"
                            strokeWidth="4"
                            fill="transparent"
                          />
                          <circle
                            cx="30"
                            cy="30"
                            r="22"
                            stroke="var(--gold)"
                            strokeWidth="4"
                            fill="transparent"
                            strokeDasharray={2 * Math.PI * 22}
                            strokeDashoffset={2 * Math.PI * 22 * (1 - holdProgress / 100)}
                            className="progress-ring-circle"
                          />
                        </svg>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--gold)' }}>
                          Plantándose
                        </span>
                      </div>
                    )}

                    {/* Botón de Click Sostenido (Stand) arriba de las cartas */}
                    {isActive && (
                      <div 
                        onMouseDown={handleHoldStart}
                        onMouseUp={handleHoldEnd}
                        onMouseLeave={handleHoldEnd}
                        onTouchStart={handleHoldStart}
                        onTouchEnd={handleHoldEnd}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          background: 'rgba(41, 121, 255, 0.12)',
                          border: '1px solid rgba(41, 121, 255, 0.35)',
                          borderRadius: '8px',
                          fontSize: '0.72rem',
                          color: '#fff',
                          textAlign: 'center',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          marginBottom: '4px',
                          transition: 'all 0.2s ease',
                          userSelect: 'none'
                        }}
                      >
                        🛑 Mantener para Plantar
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                      {hand.cards.map((card, cidx) => {
                        const isRed = ['♥', '♦'].includes(card.suit);
                        return (
                          <div key={cidx} className={`playing-card ${isRed ? 'red-suit' : ''}`}>
                            <div>{card.rank}</div>
                            <div className="card-suit-center">{card.suit}</div>
                            <div style={{ transform: 'rotate(180deg)', textAlign: 'right' }}>{card.rank}</div>
                          </div>
                        );
                      })}
                    </div>
                    <p style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      Mano {idx + 1}
                    </p>
                    <ChipStack bet={hand.bet} />
                    <p style={{ color: 'var(--gold)', fontSize: '0.8rem' }}>
                      Apuesta: ${hand.bet.toLocaleString()} COP
                    </p>

                    {/* Canal deslizante (Surrender) abajo de las cartas */}
                    {canSurrender && (
                      <div 
                        className={`swipe-track-visual ${isSwiping ? 'swipe-track-active' : ''}`}
                        onMouseMove={handleSwipeMove}
                        onMouseUp={handleSwipeEnd}
                        onMouseLeave={handleSwipeEnd}
                        onTouchMove={handleSwipeMove}
                        onTouchEnd={handleSwipeEnd}
                      >
                        <div 
                          className="swipe-handle"
                          onMouseDown={handleSwipeStart}
                          onTouchStart={handleSwipeStart}
                          style={{ left: `${5 + swipeX}px` }}
                        >
                          →
                        </div>
                        <span style={{ fontSize: '0.65rem', pointerEvents: 'none' }}>
                          {isSwiping ? 'Suelte al final...' : 'Deslizar para Rendición'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Controles de Acción de Juego */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '20px', padding: '0 20px' }}>
          {gameState === 'betting' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', width: '100%' }}>
              
              {/* Fichas de apuestas */}
              <div style={{ display: 'flex', gap: '12px' }}>
                {[2500, 5000, 10000, 25000, 50000].map((val) => (
                  <div 
                    key={val}
                    onClick={() => {
                      setBetSize(val);
                    }}
                    className={`chip chip-${val} ${betSize === val ? 'active' : ''}`}
                  >
                    {val >= 1000 ? `${val / 1000}k` : val}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                
                {/* Control unitario */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <button onClick={() => setBetSize(prev => Math.max(2500, prev - 2500))} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <Minus size={14} />
                  </button>
                  <span style={{ fontSize: '0.9rem', color: '#fff', minWidth: '110px', textAlign: 'center', fontWeight: 'bold' }}>
                    ${betSize.toLocaleString()} COP
                  </span>
                  <button onClick={() => setBetSize(prev => prev + 2500)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <Plus size={14} />
                  </button>
                </div>

                <button onClick={handleDeal} className="casino-btn btn-deal">
                  Repartir Mano
                </button>
              </div>
            </div>
          )}

          {gameState === 'playing' && activeHand && !insuranceOffered && (
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
              <button 
                onClick={() => handlePlayerAction('D')} 
                disabled={!activeHand.canDouble() || (activeHand.isSplitHand && !rules.dasAllowed)} 
                className="casino-btn btn-double"
              >
                Doblar (Double)
              </button>
              <button 
                onClick={() => handlePlayerAction('SP')} 
                disabled={!activeHand.isPair() || playerHands.length > rules.maxSplits}
                className="casino-btn btn-split"
              >
                Dividir (Split)
              </button>
            </div>
          )}

          {gameState === 'round_end' && (
            <button 
              onClick={() => {
                setGameState('betting');
                setPlayerHands([]);
                setDealerHand(null);
                setTrainerMsg(practiceMode === 'ensayo_error' ? {
                  type: 'info',
                  text: 'Coloca tu apuesta para iniciar la siguiente ronda. ¡Racha y reporte de errores activos!'
                } : null);
              }} 
              className="casino-btn btn-deal"
            >
              Siguiente Mano
            </button>
          )}
        </div>

        {/* Estilo CSS inyectado para la animación Shake del panel */}
        <style>{`
          .shake-panel {
            animation: shakeAnim 0.3s ease-in-out;
          }
          .glow-red {
            border: 3px solid var(--red-neon) !important;
            box-shadow: 0 0 15px rgba(255, 23, 68, 0.4) !important;
          }
          .glow-green {
            border: 3px solid var(--green-neon) !important;
            box-shadow: 0 0 15px rgba(0, 230, 118, 0.4) !important;
          }
          @keyframes shakeAnim {
            0% { transform: translateX(0); }
            25% { transform: translateX(-8px); }
            50% { transform: translateX(8px); }
            75% { transform: translateX(-8px); }
            100% { transform: translateX(0); }
          }
        `}</style>
      </section>

      {/* Panel de Estadísticas, Modos e Información Científica */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Leyenda de Gestos de Casino */}
        <div className="gesture-legend-panel">
          <div className="gesture-legend-header" onClick={() => setIsLegendOpen(!isLegendOpen)}>
            <span>❓ Guía de Gestos de Casino</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{isLegendOpen ? '▲ Contraer' : '▼ Expandir'}</span>
          </div>
          {isLegendOpen && (
            <div className="gesture-legend-items">
              <div className="gesture-legend-item">
                <span className="gesture-icon-badge">Doble Click</span>
                <span className="gesture-desc">Pedir (Hit) en tapete</span>
              </div>
              <div className="gesture-legend-item">
                <span className="gesture-icon-badge">Mantener Presionado</span>
                <span className="gesture-desc">Plantarse (Stand)</span>
              </div>
              <div className="gesture-legend-item">
                <span className="gesture-icon-badge">Deslizar Barra</span>
                <span className="gesture-desc">Rendirse (Surrender)</span>
              </div>
            </div>
          )}
        </div>

        {/* Selector de Modo de Práctica */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ color: 'var(--gold)', fontSize: '1.1rem' }}>🎮 Modo de Práctica</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
            <button 
              onClick={() => {
                setPracticeMode('ensayo_error');
                setTrainerMsg({ type: 'info', text: 'Modo Ensayo y Error activado. Recibe correcciones de Pavlov inmediatas.' });
              }}
              className={`casino-btn ${practiceMode === 'ensayo_error' ? 'btn-deal' : ''}`}
              style={practiceMode !== 'ensayo_error' ? { background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '0.75rem' } : { fontSize: '0.75rem' }}
            >
              Ensayo & Error
            </button>
            <button 
              onClick={() => {
                setPracticeMode('estudio');
                setTrainerMsg(null);
              }}
              className={`casino-btn ${practiceMode === 'estudio' ? 'btn-deal' : ''}`}
              style={practiceMode !== 'estudio' ? { background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '0.75rem' } : { fontSize: '0.75rem' }}
            >
              Modo Estudio
            </button>
          </div>
        </div>

        {/* Panel de Estrategia Activa y Capital */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: 'var(--gold)', fontSize: '1.1rem' }}>📈 Estrategia Activa</h3>
            <button onClick={handleResetTrainer} title="Reiniciar capital y errores" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <RotateCcw size={15} />
            </button>
          </div>
          
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
            <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.9rem' }}>{stratInfo.title}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{stratInfo.desc}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Capital Total:</span>
              <span style={{ color: '#fff', fontWeight: 'bold' }}>${bankroll.toLocaleString()} COP</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Última Ronda:</span>
              <span style={{ color: lastRoundResult >= 0 ? 'var(--green-neon)' : 'var(--red-neon)', fontWeight: 'bold' }}>
                ${lastRoundResult >= 0 ? '+' : ''}{lastRoundResult.toLocaleString()} COP
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Racha de victorias:</span>
              <span style={{ color: 'var(--green-neon)', fontWeight: 'bold' }}>{consecutiveWins} victorias</span>
            </div>
          </div>

          {/* Información del Bankroll Recomendado */}
          <div style={{ 
            fontSize: '0.75rem', 
            color: 'var(--text-secondary)', 
            padding: '10px', 
            background: 'rgba(0,0,0,0.3)', 
            borderRadius: '6px', 
            borderLeft: '2px solid var(--gold)',
            marginTop: '5px' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--gold)', fontWeight: 'bold', marginBottom: '2px' }}>
              <Info size={12} /> Bankroll Ideal Recomendado:
            </div>
            Para apostar con unidad base de $2,500 COP, debes iniciar con <strong>{stratInfo.bankroll}</strong>. Esto absorbe el drawdown teórico bajo el peor escenario evolutivo de Monte Carlo.
          </div>
        </div>

        {/* Panel de Errores y Reporte de Sesión */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1, minHeight: '180px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: 'var(--gold)', fontSize: '1.1rem' }}>📊 Rendimiento</h3>
            <button 
              onClick={() => setShowReportModal(true)} 
              disabled={totalPlays === 0}
              className="casino-btn"
              style={{ padding: '4px 8px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px', opacity: totalPlays === 0 ? 0.4 : 1 }}
            >
              <FileText size={12} /> Ver Reporte
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Decisiones Evaluadas:</span>
              <span style={{ color: '#fff', fontWeight: 'bold' }}>{totalPlays}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Errores Cometidos:</span>
              <span style={{ color: errorCount > 0 ? 'var(--red-neon)' : 'var(--green-neon)', fontWeight: 'bold' }}>{errorCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Precisión de Juego:</span>
              <span style={{ color: totalPlays === 0 ? '#5a7062' : (totalPlays - errorCount) / totalPlays >= 0.9 ? 'var(--green-neon)' : 'var(--gold)', fontWeight: 'bold' }}>
                {totalPlays === 0 ? '0.0%' : `${((totalPlays - errorCount) / totalPlays * 100).toFixed(1)}%`}
              </span>
            </div>
          </div>

          {/* Historial de logs del tutor */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.05)',
            paddingTop: '8px',
            overflowY: 'auto',
            maxHeight: '120px',
            fontSize: '0.7rem',
            fontFamily: 'JetBrains Mono, monospace',
            color: '#5a7062'
          }}>
            {log.length === 0 ? 'Esperando jugadas...' : log.map((item, idx) => <div key={idx} style={{ paddingBottom: '2px' }}>{item}</div>)}
          </div>
        </div>

      </aside>

      {/* Modal Reporte de Estudio de Sesión */}
      {showReportModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99
        }}>
          <div className="glass-panel" style={{
            width: '650px',
            maxHeight: '85vh',
            overflowY: 'auto',
            border: '2px solid var(--gold)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.9)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            padding: '25px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ color: 'var(--gold)', fontSize: '1.4rem' }}>📊 Reporte Teórico de Sesión de Estudio</h3>
              <button onClick={() => setShowReportModal(false)} className="casino-btn btn-surrender" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>Cerrar</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Tasa de Acierto</div>
                <div style={{ fontSize: '1.8rem', color: 'var(--green-neon)', fontWeight: 'bold', marginTop: '4px' }}>
                  {totalPlays === 0 ? '0%' : `${((totalPlays - errorCount) / totalPlays * 100).toFixed(1)}%`}
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Decisiones</div>
                <div style={{ fontSize: '1.8rem', color: '#fff', fontWeight: 'bold', marginTop: '4px' }}>{totalPlays}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Errores</div>
                <div style={{ fontSize: '1.8rem', color: errorCount > 0 ? 'var(--red-neon)' : 'var(--green-neon)', fontWeight: 'bold', marginTop: '4px' }}>{errorCount}</div>
              </div>
            </div>

            <div>
              <h4 style={{ color: '#fff', fontSize: '1rem', marginBottom: '10px' }}>Debilidades Detectadas (Análisis de Fuga de Valor Esperado)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                {errorsList.length === 0 ? (
                  <p style={{ color: 'var(--green-neon)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                    🎉 ¡Perfecto! No has cometido errores en esta sesión. Tu ejecución de la estrategia es intachable.
                  </p>
                ) : (
                  errorsList.map((err, idx) => (
                    <div key={idx} style={{
                      background: 'rgba(255, 23, 68, 0.05)',
                      border: '1px solid rgba(255, 23, 68, 0.15)',
                      padding: '12px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span style={{ color: '#fff' }}>{err.handDesc} vs Dealer {err.dealerCard}</span>
                        <span style={{ color: 'var(--red-neon)' }}>{err.timestamp}</span>
                      </div>
                      <div>
                        Jugaste: <strong style={{ color: 'var(--red-neon)' }}>{err.userChoice}</strong> | 
                        Óptimo: <strong style={{ color: 'var(--green-neon)' }}>{err.correctChoice}</strong>
                      </div>
                      <p style={{ color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.3' }}>
                        <strong>Explicación Científica:</strong> {err.explanation}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
              ℹ️ Este reporte compara tus decisiones empíricas con el óptimo derivado de los papers de Marino & Taylor (2014) y Buramdoyal (2023) para eliminar desviaciones que desgastan tu capital a largo plazo.
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
