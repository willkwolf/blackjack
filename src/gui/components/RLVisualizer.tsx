import { useState, useEffect } from 'react';
import { Play, Pause, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { QLearningAgent } from '../../simulator/core/QLearningAgent.ts';
import { Hand, Deck } from '../../simulator/core/BlackjackEngine.ts';

interface RLVisualizerProps {
  db: any;
  rules: RulesConfig;
}

interface RulesConfig {
  decks: number;
  blackjackPayout: number;
  dealerHitSoft17: boolean;
  surrenderAllowed: boolean;
  dasAllowed: boolean;
  maxSplits: number;
}

export default function RLVisualizer({ rules }: RLVisualizerProps) {
  const [alpha, setAlpha] = useState(0.1);
  const [gamma, setGamma] = useState(0.9);
  const epsilon = 1.0;
  
  // Instancia del agente
  const [agent, setAgent] = useState<QLearningAgent | null>(null);
  const [totalHands, setTotalHands] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  
  // Métricas
  const [winRateHistory, setWinRateHistory] = useState<{ episode: number; winRate: number }[]>([]);
  const [currentWinRate, setCurrentWinRate] = useState(0);

  // Inicializar agente
  useEffect(() => {
    setAgent(new QLearningAgent({ alpha, gamma, epsilon }));
  }, []);

  // Bucle de entrenamiento
  useEffect(() => {
    if (!isTraining || !agent) return;

    let intervalId: any;
    const deck = new Deck(rules.decks);

    // ponytail: Corremos lotes rápidos de 1000 manos por ciclo de render para mantener la UI responsiva y avanzar rápido
    const batchSize = 1500; 

    const trainBatch = () => {
      let batchWins = 0;
      let batchHands = 0;

      for (let step = 0; step < batchSize; step++) {
        // Ejecutar una mano de entrenamiento
        // 1. Repartir cartas iniciales
        if (deck.needsReshuffle(75)) {
          deck.reset();
        }

        const playerHand = new Hand(100); // Apuesta fija para entrenamiento
        const dealerHand = new Hand(0);

        playerHand.addCard(deck.deal());
        dealerHand.addCard(deck.deal());
        playerHand.addCard(deck.deal());
        dealerHand.addCard(deck.deal());

        const dealerUpcard = dealerHand.cards[0];

        // Verificar blackjacks naturales
        const pBJ = playerHand.isBlackjack();
        const dBJ = dealerHand.isBlackjack();

        if (pBJ || dBJ) {
          // Actualización de estado terminal inmediato
          const stateKey = agent.getStateKey(playerHand.getValue(), dealerUpcard.value, playerHand.isSoft());
          let reward = 0;
          if (pBJ && dBJ) reward = 0;
          else if (pBJ) reward = 1.5; // Blackjack natural normalizado
          else reward = -1.0;

          agent.updateTerminalQValue(stateKey, pBJ ? 'S' : 'H', reward);
          if (pBJ && !dBJ) batchWins++;
          batchHands++;
          continue;
        }

        // Historial de la trayectoria para actualizar Q-Values
        const trajectory: { stateKey: string; action: string }[] = [];

        // Jugar mano del jugador
        while (!playerHand.isBusted() && !playerHand.isStood && !playerHand.isSurrendered && playerHand.getValue() < 21) {
          const pVal = playerHand.getValue();
          const isSoft = playerHand.isSoft();
          const stateKey = agent.getStateKey(pVal, dealerUpcard.value, isSoft);

          const action = agent.selectAction(
            pVal,
            dealerUpcard.value,
            isSoft,
            playerHand.canDouble(),
            rules.surrenderAllowed && !playerHand.isSplitHand
          );

          trajectory.push({ stateKey, action });

          if (action === 'H') {
            playerHand.addCard(deck.deal());
          } else if (action === 'S') {
            playerHand.isStood = true;
          } else if (action === 'D') {
            playerHand.addCard(deck.deal());
            playerHand.isStood = true;
            // Doblamos la apuesta para esta decisión
            break;
          } else if (action === 'SU') {
            playerHand.isSurrendered = true;
            break;
          }
        }

        // Jugar mano del dealer
        if (!playerHand.isBusted() && !playerHand.isSurrendered) {
          while (
            dealerHand.getValue() < 17 ||
            (rules.dealerHitSoft17 && dealerHand.getValue() === 17 && dealerHand.isSoft())
          ) {
            dealerHand.addCard(deck.deal());
          }
        }

        // Evaluar resultado final
        const finalPVal = playerHand.getValue();
        const finalDVal = dealerHand.getValue();
        let outcomeReward = 0;

        if (playerHand.isSurrendered) {
          outcomeReward = -0.5;
        } else if (playerHand.isBusted()) {
          outcomeReward = trajectory.some(t => t.action === 'D') ? -2.0 : -1.0;
        } else if (dealerHand.isBusted()) {
          outcomeReward = trajectory.some(t => t.action === 'D') ? 2.0 : 1.0;
          batchWins++;
        } else if (finalPVal > finalDVal) {
          outcomeReward = trajectory.some(t => t.action === 'D') ? 2.0 : 1.0;
          batchWins++;
        } else if (finalPVal < finalDVal) {
          outcomeReward = trajectory.some(t => t.action === 'D') ? -2.0 : -1.0;
        } else {
          outcomeReward = 0.0;
        }

        batchHands++;

        // Actualizar Q-Values recorriendo hacia atrás la trayectoria (Backpropagation temporal)
        for (let j = 0; j < trajectory.length; j++) {
          const step = trajectory[j];
          const isLastStep = j === trajectory.length - 1;

          if (isLastStep) {
            agent.updateTerminalQValue(step.stateKey, step.action, outcomeReward);
          } else {
            const nextStep = trajectory[j + 1];
            agent.updateQValue(step.stateKey, step.action, 0.0, nextStep.stateKey);
          }
        }

        agent.decayEpsilon();
      }

      setTotalHands(prev => prev + batchHands);
      const batchWinRate = (batchWins / batchHands) * 100;
      setCurrentWinRate(batchWinRate);

      setWinRateHistory(prev => {
        const next = [...prev, { episode: totalHands + batchHands, winRate: batchWinRate }];
        if (next.length > 50) next.shift(); // Quedarse con los últimos 50 puntos
        return next;
      });
    };

    intervalId = setInterval(trainBatch, 100);

    return () => clearInterval(intervalId);
  }, [isTraining, agent, totalHands, rules]);

  const handleToggleTraining = () => {
    setIsTraining(prev => !prev);
  };

  const handleResetAgent = () => {
    setIsTraining(false);
    const newAgent = new QLearningAgent({ alpha, gamma, epsilon: 1.0 });
    setAgent(newAgent);
    setTotalHands(0);
    setWinRateHistory([]);
    setCurrentWinRate(0);
  };

  // Matriz de decisiones aprendida en tiempo real
  const renderQMatrix = () => {
    if (!agent) return null;

    const rows = [16, 15, 14, 13, 12, 11, 10, 9, 8];
    const columns = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // 11 representa el As

    return (
      <table className="strategy-table" style={{ fontSize: '0.8rem' }}>
        <thead>
          <tr>
            <th>Mano</th>
            {columns.map(col => <th key={col}>{col === 11 ? 'A' : col}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(rowVal => {
            return (
              <tr key={rowVal}>
                <td><strong>{rowVal}</strong></td>
                {columns.map(colVal => {
                  const stateKey = agent.getStateKey(rowVal, colVal, false);
                  const qValues = agent.getQValues(stateKey);
                  
                  // Encontrar el índice del Q-value máximo
                  let bestIdx = 0;
                  let maxVal = qValues[0];
                  let isAllZero = qValues.every(v => v === 0);

                  for (let i = 1; i < qValues.length; i++) {
                    if (qValues[i] > maxVal) {
                      maxVal = qValues[i];
                      bestIdx = i;
                    }
                  }

                  const action = isAllZero ? '?' : ['H', 'S', 'D', 'SU'][bestIdx];
                  const className = isAllZero ? '' : `cell-${action.toLowerCase()}`;

                  return (
                    <td 
                      key={colVal} 
                      className={className} 
                      style={{ fontWeight: 'bold', fontSize: '0.75rem', width: '32px', height: '32px' }}
                      title={`Q-Values:\nH: ${qValues[0].toFixed(3)}\nS: ${qValues[1].toFixed(3)}\nD: ${qValues[2].toFixed(3)}\nSU: ${qValues[3].toFixed(3)}`}
                    >
                      {action}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '30px' }}>
      
      {/* Panel de Configuración RL */}
      <aside className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'fit-content' }}>
        <h2 style={{ color: 'var(--gold)', fontSize: '1.4rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
          🧠 Agente Q-Learning
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Alpha (Learning Rate): {alpha}</label>
          <input 
            type="range" 
            min="0.01" 
            max="0.5" 
            step="0.01" 
            value={alpha} 
            onChange={(e) => setAlpha(parseFloat(e.target.value))}
            disabled={isTraining}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Gamma (Discount Factor): {gamma}</label>
          <input 
            type="range" 
            min="0.1" 
            max="0.99" 
            step="0.05" 
            value={gamma} 
            onChange={(e) => setGamma(parseFloat(e.target.value))}
            disabled={isTraining}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Epsilon (Exploración): {agent ? agent.epsilon.toFixed(3) : epsilon}</label>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Decae dinámicamente al entrenar</div>
        </div>

        <div style={{ padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div><strong>Manos jugadas:</strong> {totalHands.toLocaleString()}</div>
          <div><strong>Win Rate actual (Lote):</strong> {currentWinRate.toFixed(2)}%</div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={handleToggleTraining}
            className={`casino-btn ${isTraining ? 'btn-surrender' : 'btn-deal'}`}
            style={{ flexGrow: 1, justifyContent: 'center' }}
          >
            {isTraining ? <><Pause size={18} /> Detener</> : <><Play size={18} /> Entrenar</>}
          </button>
          <button 
            onClick={handleResetAgent}
            className="casino-btn"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </aside>

      {/* Visualización en Vivo del Aprendizaje */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        
        {/* Curva de Convergencia del Agente */}
        <div className="glass-panel">
          <h3 style={{ color: 'var(--gold)', marginBottom: '15px', fontSize: '1.2rem' }}>📈 Convergencia de Aprendizaje (Win Rate por Lotes)</h3>
          <div style={{ width: '100%', height: '220px' }}>
            {winRateHistory.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                Haz clic en "Entrenar" para iniciar el aprendizaje en tiempo real...
              </div>
            ) : (
              <ResponsiveContainer>
                <LineChart data={winRateHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="episode" stroke="var(--text-secondary)" fontSize={11} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                  <YAxis stroke="var(--text-secondary)" domain={[35, 50]} fontSize={11} />
                  <Tooltip 
                    contentStyle={{ background: '#0a1d13', border: '1px solid var(--gold)', color: '#fff' }}
                    labelFormatter={(val) => `Manos: ${val.toLocaleString()}`}
                  />
                  <Line type="monotone" dataKey="winRate" stroke="var(--green-neon)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Matriz de Decisiones Aprendida (hard hands) */}
        <div className="glass-panel">
          <h3 style={{ color: 'var(--gold)', marginBottom: '15px', fontSize: '1.2rem' }}>🎮 Matriz de Acciones Aprendida por la IA (Hard Hands)</h3>
          <div style={{ overflowX: 'auto' }}>
            {renderQMatrix()}
          </div>
          <div style={{ display: 'flex', gap: '15px', marginTop: '15px', fontSize: '0.8rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '12px', height: '12px', background: 'rgba(0, 230, 118, 0.25)', border: '1px solid var(--green-neon)' }}></span> H = Hit (Pedir)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '12px', height: '12px', background: 'rgba(41, 121, 255, 0.25)', border: '1px solid var(--blue-neon)' }}></span> S = Stand (Plantarse)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '12px', height: '12px', background: 'rgba(212, 175, 55, 0.25)', border: '1px solid var(--gold)' }}></span> D = Double (Doblar)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '12px', height: '12px', background: 'rgba(255, 23, 68, 0.25)', border: '1px solid var(--red-neon)' }}></span> SU = Surrender (Rendirse)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)' }}>
              ❓ = Estado no visitado
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
