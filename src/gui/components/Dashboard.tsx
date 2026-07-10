import { useState } from 'react';
import { Download, Cpu, Play } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Chromosome, runGeneticGeneration, initializePopulation, createDefaultChromosome } from '../../simulator/core/GeneticEngine.ts';
import { RulesConfig, BettingProgressionConfig } from '../../simulator/core/defaultStrategy.ts';
import { runMonteCarlo, SimulationResult } from '../../simulator/core/MonteCarloSimulation.ts';
import { saveStrategy, saveSimulation } from '../../db/database.ts';

interface DashboardProps {
  db: any;
  activeStrategy: Chromosome;
  setActiveStrategy: (strat: Chromosome) => void;
  activeRules: RulesConfig;
  setActiveRules: (rules: RulesConfig) => void;
}

export default function Dashboard({
  db,
  activeStrategy,
  setActiveStrategy,
  activeRules,
  setActiveRules
}: DashboardProps) {
  // Configuración de simulación
  const [hands, setHands] = useState(50000);
  const [bankroll, setBankroll] = useState(500000);
  const [baseBet, setBaseBet] = useState(2500);
  const [progressionType, setProgressionType] = useState<'FLAT' | 'PAROLI' | 'DSP' | 'KELLY'>('DSP');

  // Configuración de optimización genética
  const [generations, setGenerations] = useState(10);
  const [popSize, setPopSize] = useState(15);
  const [mutationRate, setMutationRate] = useState(0.15);
  const [handsPerEval, setHandsPerEval] = useState(2000);
  const [optimizing, setOptimizing] = useState(false);
  const [optProgress, setOptProgress] = useState(0);

  // Resultados
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  // Ejecuta la simulación Monte Carlo en el hilo principal de manera asíncrona
  // ponytail: Para evitar bloquear la UI, usamos un setTimeout en lotes o corremos directamente para tamaños cortos.
  // En producción, esto se delega al Web Worker. Aquí hacemos una ejecución directa rápida.
  const handleSimulate = async () => {
    setSimulating(true);

    // Pequeño delay para actualizar la UI
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      const progConfig: BettingProgressionConfig = {
        type: progressionType,
        baseBet,
        maxProgressions: 2,
        kellyFraction: 0.5,
        stopLossPercent: 20
      };

      const strategyId = `gui-strat-${Date.now()}`;
      const result = runMonteCarlo(hands, bankroll, activeRules, activeStrategy, progConfig, {
        saveHandHistoryLimit: 200 // Guardar una muestra pequeña en el navegador para ahorrar memoria
      });

      // Registrar en la base de datos relacional
      saveStrategy(db, strategyId, 'Estrategia GUI Interactiva', activeStrategy.hard, activeStrategy.soft, activeStrategy.pairs, progConfig);
      
      saveSimulation(db, {
        id: `sim-gui-${Date.now()}`,
        strategyId,
        handsPlayed: result.stats.handsPlayed,
        initialBankroll: bankroll,
        finalBankroll: result.finalBankroll,
        maxDrawdown: result.maxDrawdown,
        netProfit: result.finalBankroll - bankroll,
        roi: result.roi,
        winRate: result.winRate,
        rulesConfig: activeRules
      });

      setSimResult(result);
    } catch (e) {
      console.error(e);
      alert('Error ejecutando simulación');
    } finally {
      setSimulating(false);
    }
  };

  // Optimización genética por generaciones
  const handleOptimize = async () => {
    setOptimizing(true);
    setOptProgress(0);
    
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      let pop = initializePopulation(popSize, activeStrategy, mutationRate);

      for (let gen = 1; gen <= generations; gen++) {
        pop = runGeneticGeneration(pop, activeRules, bankroll, handsPerEval, mutationRate, gen, generations);
        setOptProgress(Math.round((gen / generations) * 100));
        await new Promise((resolve) => setTimeout(resolve, 30)); // Ceder el paso a la UI
      }

      // Tomar el mejor de la evolución
      setActiveStrategy(pop[0].chromosome);
      setProgressionType(pop[0].chromosome.betting.type);
      setBaseBet(pop[0].chromosome.betting.baseBet);

      alert(`🧬 ¡Optimización Genética Completada!\nMejor ROI teórico: ${pop[0].roi.toFixed(2)}%\nDrawdown: ${pop[0].drawdown.toFixed(2)}%`);
    } catch (e) {
      console.error(e);
      alert('Error en optimización genética');
    } finally {
      setOptimizing(false);
    }
  };

  // Descarga la base de datos SQLite actual como archivo binario
  const handleDownloadDatabase = () => {
    try {
      const bytes = db.export();
      const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `blackjack_data_${Date.now()}.sqlite`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('No se pudo exportar el archivo SQLite.');
    }
  };

  // Alterna las acciones al hacer clic en las tablas
  const cycleAction = (type: 'hard' | 'soft' | 'pairs', key: string, colIdx: number) => {
    const list = type === 'pairs' ? ['SP', 'H', 'S', 'D', 'SU'] : ['H', 'S', 'D', 'SU'];
    const updated = { ...activeStrategy };
    const current = updated[type][key][colIdx];
    const nextIdx = (list.indexOf(current) + 1) % list.length;
    updated[type][key][colIdx] = list[nextIdx];
    setActiveStrategy(updated);
  };

  // Restablece la estrategia a la básica de Taylor
  const handleResetStrategy = () => {
    if (window.confirm('¿Estás seguro de que deseas restablecer la estrategia activa a la Estrategia Básica (Exacta)?')) {
      setActiveStrategy(createDefaultChromosome(baseBet));
      alert('Estrategia restablecida a la básica matemática.');
    }
  };

  // Limpia el historial de simulaciones en SQLite
  const handleClearHistory = () => {
    if (window.confirm('¿Estás seguro de que deseas borrar todo el historial de simulaciones en la base de datos local SQLite?')) {
      try {
        db.run('DELETE FROM hand_histories;');
        db.run('DELETE FROM simulations;');
        db.run('DELETE FROM strategies WHERE id NOT LIKE "gui-strat%";');
        setSimResult(null);
        alert('Historial borrado de la base de datos.');
      } catch (err) {
        console.error(err);
        alert('Error al borrar el historial.');
      }
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '30px' }}>
      
      {/* Panel de Parámetros */}
      <aside className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'fit-content' }}>
        <h2 style={{ color: 'var(--gold)', fontSize: '1.4rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
          ⚙️ Parámetros
        </h2>

        {/* Simulación */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Manos a Simular</label>
          <select 
            value={hands} 
            onChange={(e) => setHands(parseInt(e.target.value))}
            style={{ width: '100%', padding: '10px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '6px' }}
          >
            <option value={10000}>10,000 Manos</option>
            <option value={50000}>50,000 Manos</option>
            <option value={100000}>100,000 Manos</option>
            <option value={250000}>250,000 Manos</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Bankroll de Trabajo</label>
          <input 
            type="number" 
            value={bankroll} 
            onChange={(e) => setBankroll(parseInt(e.target.value))}
            style={{ width: '100%', padding: '10px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '6px' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Apuesta Base (1 Unit)</label>
          <input 
            type="number" 
            value={baseBet} 
            onChange={(e) => setBaseBet(parseInt(e.target.value))}
            style={{ width: '100%', padding: '10px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '6px' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Estrategia de Apuesta</label>
          <select 
            value={progressionType} 
            onChange={(e) => setProgressionType(e.target.value as any)}
            style={{ width: '100%', padding: '10px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '6px' }}
          >
            <option value="FLAT">Flat (Bet Fijo)</option>
            <option value="PAROLI">Paroli Modificado</option>
            <option value="DSP">DSP (Shielded Dinámico)</option>
            <option value="KELLY">Kelly Fraction (0.5)</option>
          </select>
        </div>

        {/* Reglas de la Mesa */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ color: 'var(--gold)', fontSize: '1.0rem', marginBottom: '5px' }}>🃏 Reglas de la Mesa</h3>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mazos (Decks)</label>
            <select 
              value={activeRules.decks} 
              onChange={(e) => setActiveRules({ ...activeRules, decks: parseInt(e.target.value) })}
              style={{ width: '120px', padding: '5px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '4px', fontSize: '0.8rem' }}
            >
              <option value={1}>1 Mazo</option>
              <option value={2}>2 Mazos</option>
              <option value={4}>4 Mazos</option>
              <option value={6}>6 Mazos</option>
              <option value={8}>8 Mazos</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Soft 17 Rule</label>
            <select 
              value={activeRules.dealerHitSoft17 ? 'H17' : 'S17'} 
              onChange={(e) => setActiveRules({ ...activeRules, dealerHitSoft17: e.target.value === 'H17' })}
              style={{ width: '120px', padding: '5px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '4px', fontSize: '0.8rem' }}
            >
              <option value="S17">Stand S17</option>
              <option value="H17">Hit H17</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Permitir Rendición</label>
            <input 
              type="checkbox" 
              checked={activeRules.surrenderAllowed} 
              onChange={(e) => setActiveRules({ ...activeRules, surrenderAllowed: e.target.checked })}
              style={{ accentColor: 'var(--gold)' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Doblar tras Split (DAS)</label>
            <input 
              type="checkbox" 
              checked={activeRules.dasAllowed} 
              onChange={(e) => setActiveRules({ ...activeRules, dasAllowed: e.target.checked })}
              style={{ accentColor: 'var(--gold)' }}
            />
          </div>
        </div>

        <button 
          onClick={handleSimulate} 
          disabled={simulating || optimizing}
          className="casino-btn btn-deal"
          style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}
        >
          {simulating ? 'Simulando...' : <><Play size={18} /> Correr Simulación</>}
        </button>

        {/* Optimización Genética */}
        <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
          <h3 style={{ color: 'var(--gold)', fontSize: '1.1rem', marginBottom: '15px' }}>🧬 Optimizar Vía Mutación</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Generaciones</label>
            <input 
              type="number" 
              value={generations} 
              onChange={(e) => setGenerations(parseInt(e.target.value))}
              style={{ width: '100%', padding: '10px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '6px' }}
              min="2"
              max="100"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Tamaño Población</label>
            <input 
              type="number" 
              value={popSize} 
              onChange={(e) => setPopSize(parseInt(e.target.value))}
              style={{ width: '100%', padding: '10px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '6px' }}
              min="4"
              max="100"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Tasa Mutación Base ({Math.round(mutationRate * 100)}%)</label>
            <input 
              type="range" 
              value={mutationRate} 
              onChange={(e) => setMutationRate(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--gold)', background: 'none' }}
              min="0.05"
              max="0.50"
              step="0.01"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Manos por Evaluación</label>
            <select 
              value={handsPerEval} 
              onChange={(e) => setHandsPerEval(parseInt(e.target.value))}
              style={{ width: '100%', padding: '10px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '6px' }}
            >
              <option value={1000}>1,000 Manos</option>
              <option value={2000}>2,000 Manos</option>
              <option value={5000}>5,000 Manos</option>
              <option value={10000}>10,000 Manos</option>
            </select>
          </div>

          <button 
            onClick={handleOptimize} 
            disabled={simulating || optimizing}
            className="casino-btn btn-split"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {optimizing ? `Optimizando (${optProgress}%)` : <><Cpu size={18} /> Optimizar Estrategia</>}
          </button>
        </div>

        {/* Descarga SQLite */}
        <button 
          onClick={handleDownloadDatabase}
          className="casino-btn btn-stand"
          style={{ width: '100%', justifyContent: 'center', marginTop: '10px', background: '#1c2e22', border: '1px solid var(--felt-border)' }}
        >
          <Download size={18} /> Descargar SQLite .db
        </button>

        {/* Restablecer / Limpiar */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button 
            onClick={handleResetStrategy}
            className="casino-btn btn-surrender"
            style={{ flex: 1, justifyContent: 'center', padding: '8px', fontSize: '0.8rem' }}
          >
            Restablecer Estrat.
          </button>
          <button 
            onClick={handleClearHistory}
            className="casino-btn"
            style={{ flex: 1, justifyContent: 'center', padding: '8px', fontSize: '0.8rem', background: '#3d0a14', border: '1px solid #ff1744', color: '#ff1744' }}
          >
            Borrar Historial
          </button>
        </div>
      </aside>

      {/* Panel de Resultados */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        
        {/* Métricas Financieras */}
        {simResult && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
            <div className="glass-panel neon-border-gold" style={{ padding: '15px' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Net Profit</p>
              <h3 style={{ fontSize: '1.4rem', color: simResult.roi >= 0 ? 'var(--green-neon)' : 'var(--red-neon)', marginTop: '5px' }}>
                ${Math.round(simResult.finalBankroll - bankroll).toLocaleString()}
              </h3>
            </div>
            <div className="glass-panel neon-border-blue" style={{ padding: '15px' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>ROI de la Sesión</p>
              <h3 style={{ fontSize: '1.4rem', color: 'var(--text-primary)', marginTop: '5px' }}>
                {simResult.roi.toFixed(2)}%
              </h3>
            </div>
            <div className="glass-panel neon-border-red" style={{ padding: '15px' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Drawdown Máximo</p>
              <h3 style={{ fontSize: '1.4rem', color: 'var(--text-primary)', marginTop: '5px' }}>
                {simResult.maxDrawdown.toFixed(2)}%
              </h3>
            </div>
            <div className="glass-panel neon-border-green" style={{ padding: '15px' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Win Rate</p>
              <h3 style={{ fontSize: '1.4rem', color: 'var(--text-primary)', marginTop: '5px' }}>
                {simResult.winRate.toFixed(2)}%
              </h3>
            </div>
            <div className="glass-panel neon-border-gold" style={{ padding: '15px' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ventaja de Casa</p>
              <h3 style={{ fontSize: '1.4rem', color: 'var(--text-primary)', marginTop: '5px' }}>
                {simResult.houseEdge.toFixed(3)}%
              </h3>
            </div>
          </div>
        )}

        {/* Gráfico de Rendimiento */}
        {simResult && (
          <div className="glass-panel">
            <h3 style={{ color: 'var(--gold)', marginBottom: '15px', fontSize: '1.2rem' }}>📈 Evolución del Capital (Curva de Rendimiento)</h3>
            <div style={{ width: '100%', height: '300px' }}>
              <ResponsiveContainer>
                <LineChart data={simResult.bankrollHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="hand" stroke="var(--text-secondary)" fontSize={11} />
                  <YAxis stroke="var(--text-secondary)" fontSize={11} domain={['auto', 'auto']} />
                  <Tooltip 
                    contentStyle={{ background: '#0a1d13', border: '1px solid var(--gold)', color: '#fff' }}
                    labelStyle={{ color: 'var(--gold)' }}
                  />
                  <Line type="monotone" dataKey="bankroll" stroke="var(--gold)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Editor de Estrategia */}
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ color: 'var(--gold)', fontSize: '1.2rem' }}>📋 Editor de Matriz de Estrategia</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Haz clic en cualquier celda para rotar la acción.</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
            {/* Manos Duras */}
            <div>
              <h4 style={{ color: '#fff', fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '5px' }}>Manos Duras</h4>
              <table className="strategy-table">
                <thead>
                  <tr>
                    <th>Mano</th>
                    <th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>A</th>
                  </tr>
                </thead>
                <tbody>
                  {[20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8].map((val) => (
                    <tr key={val}>
                      <td><strong>{val}</strong></td>
                      {activeStrategy.hard[val].map((act, idx) => (
                        <td 
                          key={idx} 
                          className={`cell-${act.toLowerCase()}`}
                          onClick={() => cycleAction('hard', String(val), idx)}
                          style={{ cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          {act}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Manos Suaves y Pares */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h4 style={{ color: '#fff', fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '5px' }}>Manos Suaves</h4>
                <table className="strategy-table">
                  <thead>
                    <tr>
                      <th>Mano</th>
                      <th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[20, 19, 18, 17, 16, 15, 14, 13].map((val) => (
                      <tr key={val}>
                        <td><strong>A,{val - 11}</strong></td>
                        {activeStrategy.soft[val].map((act, idx) => (
                          <td 
                            key={idx} 
                            className={`cell-${act.toLowerCase()}`}
                            onClick={() => cycleAction('soft', String(val), idx)}
                            style={{ cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            {act}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h4 style={{ color: '#fff', fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '5px' }}>Pares</h4>
                <table className="strategy-table">
                  <thead>
                    <tr>
                      <th>Par</th>
                      <th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['A', '9', '8', '7', '6', '5', '4', '3', '2'].map((val) => (
                      <tr key={val}>
                        <td><strong>{val},{val}</strong></td>
                        {activeStrategy.pairs[val].map((act, idx) => (
                          <td 
                            key={idx} 
                            className={`cell-${act.toLowerCase().replace('sp', 'sp')}`}
                            onClick={() => cycleAction('pairs', val, idx)}
                            style={{ cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            {act}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
