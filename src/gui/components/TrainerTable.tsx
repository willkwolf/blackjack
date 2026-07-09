import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, RotateCcw } from 'lucide-react';
import { Hand, Deck, getActionFromStrategy } from '../../simulator/core/BlackjackEngine.ts';
import { Chromosome } from '../../simulator/core/GeneticEngine.ts';
import { RulesConfig } from '../../simulator/core/defaultStrategy.ts';
import { getNextBet } from '../../simulator/core/MonteCarloSimulation.ts';

interface TrainerTableProps {
  db: any;
  strategy: Chromosome;
  rules: RulesConfig;
}

export default function TrainerTable({ strategy, rules }: TrainerTableProps) {
  // Estado del juego
  const [bankroll, setBankroll] = useState(100000);
  const [betSize, setBetSize] = useState(2500);
  const [selectedChip, setSelectedChip] = useState(2500);
  const [gameState, setGameState] = useState<'betting' | 'playing' | 'dealer_turn' | 'round_end'>('betting');
  
  // Baraja y manos
  const [deck, setDeck] = useState<Deck | null>(null);
  const [playerHands, setPlayerHands] = useState<Hand[]>([]);
  const [activeHandIdx, setActiveHandIdx] = useState(0);
  const [dealerHand, setDealerHand] = useState<Hand | null>(null);
  
  // Historial de rachas para el tutor de apuestas
  const [consecutiveWins, setConsecutiveWins] = useState(0);
  const [lastRoundResult, setLastRoundResult] = useState(0);

  // Registro del tutor de entrenamiento
  const [trainerMsg, setTrainerMsg] = useState<{ type: 'success' | 'warning' | 'info'; text: string } | null>({
    type: 'info',
    text: 'Coloca tu apuesta. El tutor evaluará si sigues la progresión DSP para mitigar la varianza.'
  });
  const [log, setLog] = useState<string[]>([]);

  // Inicializar baraja
  useEffect(() => {
    const d = new Deck(rules.decks);
    setDeck(d);
  }, [rules.decks]);

  // Ejecuta la jugada inicial (Repartir)
  const handleDeal = () => {
    if (!deck) return;

    // 1. Evaluar si la apuesta sigue la progresión óptima (DSP)
    const expectedOptimalBet = getNextBet(strategy.betting, bankroll, consecutiveWins, lastRoundResult);
    if (betSize !== expectedOptimalBet) {
      setTrainerMsg({
        type: 'warning',
        text: `⚠️ Desviación de Apuesta: Estás apostando $${betSize.toLocaleString()}, pero la progresión óptima te pide apostar $${expectedOptimalBet.toLocaleString()} (Paso actual: ${consecutiveWins} victorias consecutivas). ¡Controla tu varianza!`
      });
      addLog(`Tutor: Advertencia de apuesta de $${betSize}. Esperada: $${expectedOptimalBet}.`);
    } else {
      setTrainerMsg({
        type: 'success',
        text: `✅ Apuesta Correcta: $${betSize.toLocaleString()} sigue la progresión óptima de control de riesgos.`
      });
    }

    if (bankroll < betSize) {
      alert('Bankroll insuficiente para colocar esta apuesta.');
      return;
    }

    // Cobrar apuesta
    setBankroll(prev => prev - betSize);

    // Inicializar manos
    const newPlayerHand = new Hand(betSize);
    const newDealerHand = new Hand(0);

    newPlayerHand.addCard(deck.deal());
    newDealerHand.addCard(deck.deal());
    newPlayerHand.addCard(deck.deal());
    newDealerHand.addCard(deck.deal());

    setPlayerHands([newPlayerHand]);
    setActiveHandIdx(0);
    setDealerHand(newDealerHand);

    // Verificar blackjacks naturales
    const pBJ = newPlayerHand.isBlackjack();
    const dBJ = newDealerHand.isBlackjack();

    if (pBJ || dBJ) {
      setGameState('round_end');
      resolveRound([newPlayerHand], newDealerHand, true);
    } else {
      setGameState('playing');
    }
  };

  // Resuelve las apuestas al final de la ronda
  const resolveRound = (hands: Hand[], dealer: Hand, naturalBJ = false) => {
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

    const handSummaries = hands.map((hand, idx) => {
      let outcome: 'WIN' | 'LOSE' | 'PUSH' | 'SURRENDER' | 'BLACKJACK';
      let payout = 0;

      if (hand.isSurrendered) {
        outcome = 'SURRENDER';
        payout = hand.bet * 0.5; // Devuelve la mitad de la apuesta
      } else if (hand.isBusted()) {
        outcome = 'LOSE';
        payout = 0;
      } else if (hand.isBlackjack() && !dealer.isBlackjack()) {
        outcome = 'BLACKJACK';
        payout = hand.bet + hand.bet * rules.blackjackPayout; // Devuelve bet + ganancia 3:2
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
        payout = hand.bet; // Devuelve apuesta original
      }

      const netProfit = payout - hand.bet;
      roundNetReward += netProfit;

      return `Mano ${idx + 1}: ${outcome} (${netProfit >= 0 ? '+' : ''}$${netProfit.toLocaleString()} COP)`;
    });

    // Actualizar bankroll con los payouts
    const totalPayout = hands.reduce((sum, h) => {
      if (h.isSurrendered) return sum + h.bet * 0.5;
      if (h.isBusted()) return sum;
      if (h.isBlackjack() && !dealer.isBlackjack()) return sum + h.bet * (1 + rules.blackjackPayout);
      if (dBusted || h.getValue() > dVal) return sum + h.bet * 2;
      if (h.getValue() === dVal) return sum + h.bet;
      return sum;
    }, 0);

    setBankroll(prev => prev + totalPayout);
    setLastRoundResult(roundNetReward);

    // Ajustar racha
    if (roundNetReward > 0) {
      setConsecutiveWins(prev => prev + 1);
      addLog(`Ronda: Victoria Neta (${roundNetReward >= 0 ? '+' : ''}$${roundNetReward.toLocaleString()}). Racha: ${consecutiveWins + 1}`);
    } else if (roundNetReward < 0) {
      setConsecutiveWins(0);
      addLog(`Ronda: Pérdida Neta ($${roundNetReward.toLocaleString()}). Racha reseteada.`);
    } else {
      // Push neto
      addLog(`Ronda: Empate.`);
    }

    addLog(handSummaries.join(' | ') + ` | Dealer finalizó con ${dVal}`);
    setGameState('round_end');
  };

  // Intercepta y valida la decisión del jugador
  const handlePlayerAction = (action: 'H' | 'S' | 'D' | 'SU' | 'SP') => {
    if (!deck || playerHands.length === 0 || !dealerHand) return;
    
    const currentHand = playerHands[activeHandIdx];
    const dealerUpcard = dealerHand.cards[0];

    // 1. Obtener acción óptima teórica
    const optimalAction = getActionFromStrategy(currentHand, dealerUpcard, strategy, rules.dasAllowed);

    // 2. Dar retroalimentación de entrenamiento
    if (action !== optimalAction) {
      setTrainerMsg({
        type: 'warning',
        text: `❌ Desviación de Juego: Decidiste hacer ${action === 'H' ? 'HIT' : action === 'S' ? 'STAND' : action === 'D' ? 'DOUBLE' : action === 'SU' ? 'SURRENDER' : 'SPLIT'}. La decisión óptima era ${optimalAction}. ¡Jugar desviado incrementa las fugas por varianza!`
      });
      addLog(`Tutor: Alerta de movimiento en Mano ${activeHandIdx + 1}. Jugado: ${action}, Óptimo: ${optimalAction}.`);
    } else {
      setTrainerMsg({
        type: 'success',
        text: '✅ ¡Movimiento Óptimo! Esa decisión maximiza estadísticamente el retorno esperado.'
      });
    }

    // 3. Ejecutar la acción del jugador (incluso si cometió un error, el casino real permite errores)
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
      currentHand.bet *= 2;
      setBankroll(prev => prev - currentHand.bet / 2); // Cobrar el doble
      currentHand.addCard(deck.deal());
      currentHand.isStood = true;
      moveToNextHand(updatedHands);
    } else if (action === 'SU') {
      currentHand.isSurrendered = true;
      moveToNextHand(updatedHands);
    } else if (action === 'SP') {
      // Split
      const splitCard = currentHand.cards.pop()!;
      const newHand = new Hand(currentHand.bet);
      newHand.isSplitHand = true;
      newHand.addCard(splitCard);

      // Cobrar segunda apuesta
      setBankroll(prev => prev - currentHand.bet);

      // Completar ambas manos
      currentHand.addCard(deck.deal());
      newHand.addCard(deck.deal());

      updatedHands.splice(activeHandIdx + 1, 0, newHand);
      setPlayerHands(updatedHands);

      // Si dividimos ases, se standean en el acto
      if (currentHand.cards[0].rank === 'A') {
        currentHand.isStood = true;
        newHand.isStood = true;
        moveToNextHand(updatedHands);
      }
    }

    setPlayerHands(updatedHands);
  };

  const moveToNextHand = (hands: Hand[]) => {
    if (activeHandIdx + 1 < hands.length) {
      setActiveHandIdx(prev => prev + 1);
    } else {
      // Turno del dealer
      setGameState('dealer_turn');
      setTimeout(() => {
        resolveRound(hands, dealerHand!);
      }, 800);
    }
  };

  const addLog = (msg: string) => {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 15)]);
  };

  // Reiniciar bankroll a $100,000 para volver a entrenar
  const handleResetTrainer = () => {
    setBankroll(100000);
    setConsecutiveWins(0);
    setLastRoundResult(0);
    setGameState('betting');
    setPlayerHands([]);
    setDealerHand(null);
    setTrainerMsg({
      type: 'info',
      text: 'Entrenador reiniciado. Vuelve a colocar tus apuestas.'
    });
    setLog([]);
  };

  const activeHand = playerHands[activeHandIdx];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '30px' }}>
      
      {/* Mesa 2D de Juego */}
      <section className="glass-panel" style={{
        backgroundImage: 'radial-gradient(circle, #0e4c2b 0%, #031b0f 100%)',
        border: '3px solid var(--felt-border)',
        boxShadow: 'inset 0 0 100px rgba(0,0,0,0.8), 0 8px 30px rgba(0,0,0,0.5)',
        minHeight: '550px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative'
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
                : 'rgba(212,175,55,0.15)',
            border: `1px solid ${
              trainerMsg.type === 'success' 
                ? 'var(--green-neon)' 
                : trainerMsg.type === 'warning' 
                  ? 'var(--red-neon)' 
                  : 'var(--gold)'
            }`,
            fontSize: '0.9rem',
            color: '#fff',
            fontFamily: 'Inter, sans-serif'
          }}>
            {trainerMsg.type === 'success' ? (
              <CheckCircle size={24} style={{ color: 'var(--green-neon)', flexShrink: 0 }} />
            ) : (
              <AlertCircle size={24} style={{ color: trainerMsg.type === 'warning' ? 'var(--red-neon)' : 'var(--gold)', flexShrink: 0 }} />
            )}
            <p>{trainerMsg.text}</p>
          </div>
        )}

        {/* Croupier (Dealer) Area */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginTop: '20px' }}>
          <p style={{ color: 'var(--gold)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Dealer {dealerHand && `(${dealerHand.getValue()})`}
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
          
          {/* Manos del jugador (incluye Splits de lado a lado) */}
          <div style={{ display: 'flex', gap: '50px', justifyContent: 'center' }}>
            {playerHands.map((hand, idx) => {
              const isActive = idx === activeHandIdx && gameState === 'playing';
              return (
                <div 
                  key={idx} 
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px',
                    borderRadius: '12px',
                    border: isActive ? '2px dashed var(--gold)' : '2px solid transparent',
                    background: isActive ? 'rgba(212,175,55,0.05)' : 'none'
                  }}
                >
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
                    Mano {idx + 1} {hand.getValue() > 0 && `(${hand.getValue()})`}
                  </p>
                  <p style={{ color: 'var(--gold)', fontSize: '0.8rem' }}>
                    Apuesta: ${hand.bet.toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Controles de Acción de Juego */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '20px', padding: '0 20px' }}>
          {gameState === 'betting' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', width: '100%' }}>
              
              {/* Fichas de apuestas */}
              <div style={{ display: 'flex', gap: '15px' }}>
                {[500, 2500, 10000, 50000, 100000].map((val) => (
                  <div 
                    key={val}
                    onClick={() => {
                      setSelectedChip(val);
                      setBetSize(val);
                    }}
                    className={`chip chip-${val} ${selectedChip === val ? 'active' : ''}`}
                  >
                    {val >= 1000 ? `${val / 1000}k` : val}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <span style={{ fontSize: '1rem', color: '#fff' }}>Apuesta: ${betSize.toLocaleString()}</span>
                <button onClick={handleDeal} className="casino-btn btn-deal">
                  Repartir Mano
                </button>
              </div>
            </div>
          )}

          {gameState === 'playing' && activeHand && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button 
                onClick={() => handlePlayerAction('H')} 
                className="casino-btn btn-hit"
              >
                Hit (Pedir)
              </button>
              <button 
                onClick={() => handlePlayerAction('S')} 
                className="casino-btn btn-stand"
              >
                Stand (Plantarse)
              </button>
              <button 
                onClick={() => handlePlayerAction('D')} 
                disabled={!activeHand.canDouble() || (activeHand.isSplitHand && !rules.dasAllowed)} 
                className="casino-btn btn-double"
              >
                Double (Doblar)
              </button>
              <button 
                onClick={() => handlePlayerAction('SP')} 
                disabled={!activeHand.isPair() || playerHands.length > rules.maxSplits}
                className="casino-btn btn-split"
              >
                Split (Dividir)
              </button>
              <button 
                onClick={() => handlePlayerAction('SU')} 
                disabled={!activeHand.canDouble() || activeHand.isSplitHand} 
                className="casino-btn btn-surrender"
              >
                Surrender
              </button>
            </div>
          )}

          {gameState === 'round_end' && (
            <button 
              onClick={() => {
                setGameState('betting');
                setPlayerHands([]);
                setDealerHand(null);
                setTrainerMsg({
                  type: 'info',
                  text: 'Coloca tu apuesta para iniciar la siguiente ronda. ¡La racha acumulada se mantiene!'
                });
              }} 
              className="casino-btn btn-deal"
            >
              Siguiente Mano
            </button>
          )}
        </div>
      </section>

      {/* Panel de Estadísticas y Registro del Tutor */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Datos Financieros del Alumno */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: 'var(--gold)', fontSize: '1.2rem' }}>💰 Tu Capital</h3>
            <button onClick={handleResetTrainer} title="Reiniciar Entrenador" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <RotateCcw size={16} />
            </button>
          </div>
          <h2 style={{ fontSize: '2rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
            ${bankroll.toLocaleString()}
          </h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Racha Victorias:</span>
            <span style={{ color: 'var(--green-neon)', fontWeight: 'bold' }}>{consecutiveWins} consecutivas</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Último Resultado:</span>
            <span style={{ color: lastRoundResult >= 0 ? 'var(--green-neon)' : 'var(--red-neon)', fontWeight: 'bold' }}>
              ${lastRoundResult.toLocaleString()}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
            💡 Progresión DSP activa:
            <br />
            Paso 1: 1u ($2,500) • Paso 2: 2u ($5,000) • Paso 3: 1.5u ($3,750 - ¡Asegura ganancia!) • Paso 4: 3u ($7,500).
          </div>
        </div>

        {/* Bitácora de Entrenamiento */}
        <div className="glass-panel" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
          <h3 style={{ color: 'var(--gold)', fontSize: '1.1rem', marginBottom: '10px' }}>📝 Historial del Tutor</h3>
          <div style={{
            flexGrow: 1,
            overflowY: 'auto',
            maxHeight: '280px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '0.8rem',
            fontFamily: 'JetBrains Mono, monospace',
            color: 'var(--text-secondary)'
          }}>
            {log.length === 0 ? (
              <p style={{ fontStyle: 'italic', color: '#556b5c' }}>Sin jugadas registradas aún...</p>
            ) : (
              log.map((item, idx) => <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '4px' }}>{item}</div>)
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
