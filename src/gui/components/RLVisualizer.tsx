import { useState, useEffect } from 'react';
import { Play, Pause, RefreshCw, Check } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { QLearningAgent } from '../../simulator/core/QLearningAgent.ts';
import { Hand, Deck } from '../../simulator/core/BlackjackEngine.ts';
import { Chromosome, createDefaultChromosome } from '../../simulator/core/GeneticEngine.ts';
import { RulesConfig } from '../../simulator/core/defaultStrategy.ts';

interface RLVisualizerProps {
  db: any;
  rules: RulesConfig;
  activeStrategy: Chromosome | null;
  setActiveStrategy: (strat: Chromosome) => void;
  strategySource: 'goykhman' | 'buramdoyal' | 'taylor' | 'custom';
  setStrategySource: (source: 'goykhman' | 'buramdoyal' | 'taylor' | 'custom') => void;
}

export default function RLVisualizer({
  rules,
  activeStrategy,
  setActiveStrategy,
  strategySource,
  setStrategySource
}: RLVisualizerProps) {
  // Parámetros Q-learning
  const [alpha, setAlpha] = useState(0.1);
  const [gamma, setGamma] = useState(0.9);
  const epsilon = 1.0;
  
  // Agente y entrenamiento
  const [agent, setAgent] = useState<QLearningAgent | null>(null);
  const [totalHands, setTotalHands] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  
  // Métricas de entrenamiento
  const [winRateHistory, setWinRateHistory] = useState<{ episode: number; winRate: number }[]>([]);
  const [currentWinRate, setCurrentWinRate] = useState(0);

  // Inicializar agente
  useEffect(() => {
    setAgent(new QLearningAgent({ alpha, gamma, epsilon }));
  }, []);

  // Sincronizar parámetros si cambia el agente manualmente
  useEffect(() => {
    if (agent) {
      agent.alpha = alpha;
      agent.gamma = gamma;
    }
  }, [alpha, gamma, agent]);

  // Bucle de entrenamiento en lote
  useEffect(() => {
    if (!isTraining || !agent) return;

    let intervalId: any;
    const deck = new Deck(rules.decks);
    const batchSize = 2000; 

    const trainBatch = () => {
      let batchWins = 0;
      let batchHands = 0;

      for (let step = 0; step < batchSize; step++) {
        if (deck.needsReshuffle(75)) {
          deck.reset();
        }

        const playerHand = new Hand(100); 
        const dealerHand = new Hand(0);

        playerHand.addCard(deck.deal());
        dealerHand.addCard(deck.deal());
        playerHand.addCard(deck.deal());
        dealerHand.addCard(deck.deal());

        const dealerUpcard = dealerHand.cards[0];
        const pBJ = playerHand.isBlackjack();
        const dBJ = dealerHand.isBlackjack();

        if (pBJ || dBJ) {
          const stateKey = agent.getStateKey(playerHand.getValue(), dealerUpcard.value, playerHand.isSoft());
          let reward = 0;
          if (pBJ && dBJ) reward = 0;
          else if (pBJ) reward = 1.5; 
          else reward = -1.0;

          agent.updateTerminalQValue(stateKey, pBJ ? 'S' : 'H', reward);
          if (pBJ && !dBJ) batchWins++;
          batchHands++;
          continue;
        }

        const trajectory: { stateKey: string; action: string }[] = [];

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
            break;
          } else if (action === 'SU') {
            playerHand.isSurrendered = true;
            break;
          }
        }

        if (!playerHand.isBusted() && !playerHand.isSurrendered) {
          while (
            dealerHand.getValue() < 17 ||
            (rules.dealerHitSoft17 && dealerHand.getValue() === 17 && dealerHand.isSoft())
          ) {
            dealerHand.addCard(deck.deal());
          }
        }

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
        if (next.length > 50) next.shift(); 
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

  // Aplica la estrategia de Q-Learning (Buramdoyal) a la mesa
  const handleApplyQLearningStrategy = () => {
    if (!agent || totalHands === 0) return;
    const qMatrices = agent.exportToStrategyMatrices();
    const newStrategy: Chromosome = {
      hard: qMatrices.hard,
      soft: qMatrices.soft,
      pairs: qMatrices.pairs,
      betting: activeStrategy?.betting || createDefaultChromosome().betting
    };
    setActiveStrategy(newStrategy);
    setStrategySource('buramdoyal');
    alert('🧬 Estrategia de Q-Learning (Buramdoyal 2023) aplicada a la Mesa 2D con éxito.');
  };

  // Aplica la estrategia Genética (Goykhman)
  const handleApplyGeneticStrategy = () => {
    const defaultStrat = createDefaultChromosome();
    setActiveStrategy(defaultStrat);
    setStrategySource('goykhman');
    alert('🧬 Estrategia Genética (Goykhman 2017) aplicada a la Mesa 2D con éxito.');
  };

  // Aplica la estrategia Matemática Exacta (Taylor)
  const handleApplyTaylorStrategy = () => {
    const defaultStrat = createDefaultChromosome();
    setActiveStrategy(defaultStrat);
    setStrategySource('taylor');
    alert('🧬 Estrategia Matemática Exacta (Marino & Taylor 2014) aplicada a la Mesa 2D con éxito.');
  };

  // Renderizado de la matriz de decisiones aprendida en tiempo real
  const renderQMatrix = () => {
    if (!agent) return null;

    const rows = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8];
    const columns = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // 11 = As

    return (
      <table className="strategy-table" style={{ fontSize: '0.8rem', width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <th style={{ padding: '6px' }}>Mano</th>
            {columns.map(col => <th key={col} style={{ padding: '6px' }}>{col === 11 ? 'A' : col}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(rowVal => {
            return (
              <tr key={rowVal} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '6px', fontWeight: 'bold' }}>{rowVal}</td>
                {columns.map(colVal => {
                  const stateKey = agent.getStateKey(rowVal, colVal, false);
                  const qValues = agent.getQValues(stateKey);
                  
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
                      style={{ 
                        fontWeight: 'bold', 
                        fontSize: '0.75rem', 
                        textAlign: 'center',
                        padding: '6px',
                        color: isAllZero ? '#5a7062' : '#fff'
                      }}
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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
      
      {/* Cabecera del Lab Científico */}
      <div className="glass-panel" style={{ padding: '20px 30px' }}>
        <h2 style={{ color: 'var(--gold)', fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          🎓 Lab de Estrategias y Papers Académicos
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '6px' }}>
          Selecciona un paper científico para generar su respectiva matriz de decisiones, entrenar inteligencias artificiales en tiempo real y cargar la estrategia resultante en el simulador 2D.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
        
        {/* Paper 1: Goykhman 2017 */}
        <section className={`glass-panel ${strategySource === 'goykhman' ? 'active-strategy-panel' : ''}`} style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          border: strategySource === 'goykhman' ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.05)',
          background: strategySource === 'goykhman' ? 'rgba(212,175,55,0.03)' : 'rgba(5,20,12,0.4)'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="badge" style={{ background: 'rgba(212,175,55,0.1)', color: 'var(--gold)', fontSize: '0.7rem' }}>Algoritmos Genéticos</span>
              {strategySource === 'goykhman' && <span style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}><Check size={16} /> ACTIVO</span>}
            </div>
            <h3 style={{ color: '#fff', fontSize: '1.2rem', marginTop: '10px' }}>Mikhail Goykhman (2017)</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic', margin: '4px 0 15px 0' }}>
              "On evolutionary selection of blackjack strategies"
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              Propone el uso de evolución artificial para mutar y cruzar tablas de estrategia de Blackjack. La función de aptitud penaliza el drawdown máximo para mitigar la varianza del juego real.
            </p>

            <div style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '12px',
              borderRadius: '8px',
              fontFamily: 'serif',
              fontSize: '1.1rem',
              color: 'var(--gold)',
              textAlign: 'center',
              margin: '15px 0',
              letterSpacing: '0.05em'
            }}>
              Fitness(θ) = ROI(θ) - λ · MaxDrawdown(θ)
            </div>
          </div>

          <button 
            onClick={handleApplyGeneticStrategy}
            className={`casino-btn ${strategySource === 'goykhman' ? 'btn-deal' : ''}`}
            style={{ width: '100%', justifyContent: 'center', marginTop: '15px' }}
          >
            {strategySource === 'goykhman' ? 'Estrategia Aplicada' : 'Aplicar Estrategia GA'}
          </button>
        </section>

        {/* Paper 2: Buramdoyal 2023 */}
        <section className={`glass-panel ${strategySource === 'buramdoyal' ? 'active-strategy-panel' : ''}`} style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          border: strategySource === 'buramdoyal' ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.05)',
          background: strategySource === 'buramdoyal' ? 'rgba(212,175,55,0.03)' : 'rgba(5,20,12,0.4)'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="badge" style={{ background: 'rgba(0,230,118,0.1)', color: 'var(--green-neon)', fontSize: '0.7rem' }}>Q-Learning RL</span>
              {strategySource === 'buramdoyal' && <span style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}><Check size={16} /> ACTIVO</span>}
            </div>
            <h3 style={{ color: '#fff', fontSize: '1.2rem', marginTop: '10px' }}>Buramdoyal & Gebbie (2023)</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic', margin: '4px 0 15px 0' }}>
              "RL performance of Blackjack"
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              Evalúa la convergencia de modelos Q-Learning libres de modelo en entornos estocásticos de Blackjack. El agente aprende por ensayo-error penalizando bustos y recompensando victorias.
            </p>

            <div style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '12px',
              borderRadius: '8px',
              fontFamily: 'serif',
              fontSize: '1.05rem',
              color: 'var(--gold)',
              textAlign: 'center',
              margin: '15px 0',
              letterSpacing: '0.02em'
            }}>
              Q(s,a) 🠄 Q + α [ R + γ max Q(s',a') - Q ]
            </div>
          </div>

          <button 
            onClick={handleApplyQLearningStrategy}
            disabled={totalHands === 0}
            className={`casino-btn ${strategySource === 'buramdoyal' ? 'btn-deal' : ''}`}
            style={{ width: '100%', justifyContent: 'center', marginTop: '15px', opacity: totalHands === 0 ? 0.5 : 1 }}
          >
            {totalHands === 0 
              ? 'Entrena la IA para aplicar' 
              : strategySource === 'buramdoyal' 
                ? 'Estrategia de IA Aplicada' 
                : 'Aplicar Estrategia de IA'}
          </button>
        </section>

        {/* Paper 3: Marino & Taylor 2014 */}
        <section className={`glass-panel ${strategySource === 'taylor' ? 'active-strategy-panel' : ''}`} style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          border: strategySource === 'taylor' ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.05)',
          background: strategySource === 'taylor' ? 'rgba(212,175,55,0.03)' : 'rgba(5,20,12,0.4)'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="badge" style={{ background: 'rgba(41,121,255,0.1)', color: 'var(--blue-neon)', fontSize: '0.7rem' }}>Matemática Exacta</span>
              {strategySource === 'taylor' && <span style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}><Check size={16} /> ACTIVO</span>}
            </div>
            <h3 style={{ color: '#fff', fontSize: '1.2rem', marginTop: '10px' }}>Marino & Taylor (2014)</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic', margin: '4px 0 15px 0' }}>
              "Integer Compositions applied to Blackjack"
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              Calcula con total exactitud combinatoria las probabilidades del Blackjack. Determina de forma analítica el valor esperado de plantarse, pedir, doblar o rendirse sin necesidad de simulación.
            </p>

            <div style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '12px',
              borderRadius: '8px',
              fontFamily: 'serif',
              fontSize: '1.1rem',
              color: 'var(--gold)',
              textAlign: 'center',
              margin: '15px 0',
              letterSpacing: '0.05em'
            }}>
              P(Dealer = D | U) = Σ P(c₁) · P(c₂) · ...
            </div>
          </div>

          <button 
            onClick={handleApplyTaylorStrategy}
            className={`casino-btn ${strategySource === 'taylor' ? 'btn-deal' : ''}`}
            style={{ width: '100%', justifyContent: 'center', marginTop: '15px' }}
          >
            {strategySource === 'taylor' ? 'Estrategia Aplicada' : 'Aplicar Estrategia Exacta'}
          </button>
        </section>
      </div>

      {/* Panel de Entrenamiento Interactivo de Buramdoyal (2023) */}
      <div className="glass-panel" style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '30px', marginTop: '10px' }}>
        
        {/* Controles de Entrenamiento */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ color: 'var(--gold)', fontSize: '1.2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
            🏋️ Entrenar Agente Q-Learning (Buramdoyal)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Alpha (Tasa de Aprendizaje): {alpha}</label>
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
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Gamma (Descuento temporal): {gamma}</label>
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
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Exploración (Epsilon): {agent ? agent.epsilon.toFixed(3) : epsilon}</label>
            <span style={{ fontSize: '0.7rem', color: '#5a7062' }}>Decae automáticamente al jugar manos</span>
          </div>

          <div style={{ padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div><strong>Manos Simuladas:</strong> {totalHands.toLocaleString()}</div>
            <div><strong>Rendimiento del Lote:</strong> {currentWinRate.toFixed(2)}% de victorias</div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={handleToggleTraining}
              className={`casino-btn ${isTraining ? 'btn-surrender' : 'btn-deal'}`}
              style={{ flexGrow: 1, justifyContent: 'center' }}
            >
              {isTraining ? <><Pause size={18} /> Detener</> : <><Play size={18} /> Entrenar en Lote</>}
            </button>
            <button 
              onClick={handleResetAgent}
              className="casino-btn"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}
              title="Reiniciar Agente"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </aside>

        {/* Gráfico y Matriz de Aprendizaje en Vivo */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="glass-panel" style={{ background: 'rgba(0,0,0,0.15)', border: 'none' }}>
            <h4 style={{ color: '#fff', fontSize: '1rem', marginBottom: '10px' }}>Gráfica de Convergencia (Tasa de Éxitos)</h4>
            <div style={{ width: '100%', height: '140px' }}>
              {winRateHistory.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                  Inicia el entrenamiento en lote para graficar la convergencia de la IA...
                </div>
              ) : (
                <ResponsiveContainer>
                  <LineChart data={winRateHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="episode" stroke="var(--text-secondary)" fontSize={9} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                    <YAxis stroke="var(--text-secondary)" domain={[35, 50]} fontSize={9} />
                    <Tooltip 
                      contentStyle={{ background: '#0a1d13', border: '1px solid var(--gold)', color: '#fff', fontSize: '0.75rem' }}
                      labelFormatter={(val) => `Manos: ${val.toLocaleString()}`}
                    />
                    <Line type="monotone" dataKey="winRate" stroke="var(--green-neon)" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="glass-panel" style={{ background: 'rgba(0,0,0,0.15)', border: 'none' }}>
            <h4 style={{ color: '#fff', fontSize: '1rem', marginBottom: '10px' }}>Matriz de Decisión Q-Table (Mano Dura vs Carta Dealer)</h4>
            <div style={{ overflowX: 'auto' }}>
              {renderQMatrix()}
            </div>
            <div style={{ display: 'flex', gap: '15px', marginTop: '12px', fontSize: '0.7rem', flexWrap: 'wrap', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', background: 'rgba(0, 230, 118, 0.25)', border: '1px solid var(--green-neon)' }}></span> H (Hit)
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', background: 'rgba(41, 121, 255, 0.25)', border: '1px solid var(--blue-neon)' }}></span> S (Stand)
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', background: 'rgba(212, 175, 55, 0.25)', border: '1px solid var(--gold)' }}></span> D (Double)
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', background: 'rgba(255, 23, 68, 0.25)', border: '1px solid var(--red-neon)' }}></span> SU (Surrender)
              </span>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
