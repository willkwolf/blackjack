import { useState, useEffect } from 'react';
import { Play, BarChart3, Brain } from 'lucide-react';
import { initDatabase } from './db/database.ts';
import { createDefaultChromosome, Chromosome } from './simulator/core/GeneticEngine.ts';
import { DEFAULT_RULES, RulesConfig } from './simulator/core/defaultStrategy.ts';
import Dashboard from './gui/components/Dashboard.tsx';
import TrainerTable from './gui/components/TrainerTable.tsx';
import RLVisualizer from './gui/components/RLVisualizer.tsx';

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trainer' | 'rl'>('dashboard');
  const [db, setDb] = useState<any>(null);
  const [activeStrategy, setActiveStrategy] = useState<Chromosome | null>(null);
  const [strategySource, setStrategySource] = useState<'goykhman' | 'buramdoyal' | 'taylor' | 'custom'>('taylor');
  const [activeRules] = useState<RulesConfig>(DEFAULT_RULES);
  const [dbLoading, setDbLoading] = useState(true);

  // Inicializar base de datos en memoria y estrategia por defecto
  useEffect(() => {
    async function loadDb() {
      try {
        setDbLoading(true);
        const database = await initDatabase();
        setDb(database);
        
        // Cargar estrategia básica por defecto
        const defaultStrat = createDefaultChromosome();
        setActiveStrategy(defaultStrat);
        
        console.log('✅ Base de datos SQLite Wasm y estrategias por defecto inicializadas.');
      } catch (err) {
        console.error('Error al inicializar la base de datos local:', err);
      } finally {
        setDbLoading(false);
      }
    }
    loadDb();
  }, []);

  if (dbLoading || !activeStrategy) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '20px'
      }}>
        <div style={{
          border: '4px solid rgba(212, 175, 55, 0.2)',
          borderTop: '4px solid #d4af37',
          borderRadius: '50%',
          width: '50px',
          height: '50px',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ fontFamily: 'Outfit, sans-serif', color: '#a0b2a6', fontSize: '1.1rem' }}>
          Cargando entorno de ciencia de datos SQLite Wasm...
        </p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px',
        marginBottom: '30px',
        background: 'rgba(5, 20, 12, 0.5)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(212, 175, 55, 0.15)',
        borderRadius: '16px'
      }}>
        <div>
          <h1 style={{ color: '#d4af37', fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            🃏 Blackjack Science Platform
          </h1>
          <p style={{ color: '#a0b2a6', fontSize: '0.9rem', marginTop: '4px' }}>
            Simulador Monte Carlo, Algoritmos Genéticos y Aprendizaje por Refuerzo
          </p>
        </div>
        
        {/* Navegación por pestañas */}
        <nav style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`casino-btn ${activeTab === 'dashboard' ? 'btn-deal' : ''}`}
            style={activeTab !== 'dashboard' ? { background: 'rgba(255,255,255,0.05)', color: '#fff' } : {}}
          >
            <BarChart3 size={18} /> Dashboard
          </button>
          <button
            onClick={() => setActiveTab('trainer')}
            className={`casino-btn ${activeTab === 'trainer' ? 'btn-deal' : ''}`}
            style={activeTab !== 'trainer' ? { background: 'rgba(255,255,255,0.05)', color: '#fff' } : {}}
          >
            <Play size={18} /> Mesa 2D
          </button>
          <button
            onClick={() => setActiveTab('rl')}
            className={`casino-btn ${activeTab === 'rl' ? 'btn-deal' : ''}`}
            style={activeTab !== 'rl' ? { background: 'rgba(255,255,255,0.05)', color: '#fff' } : {}}
          >
            <Brain size={18} /> Papers & RL
          </button>
        </nav>
      </header>

      <main style={{ minHeight: '60vh' }}>
        {activeTab === 'dashboard' && (
          <Dashboard 
            db={db}
            activeStrategy={activeStrategy}
            setActiveStrategy={setActiveStrategy}
            activeRules={activeRules}
          />
        )}
        {activeTab === 'trainer' && (
          <TrainerTable 
            db={db}
            strategy={activeStrategy}
            rules={activeRules}
            strategySource={strategySource}
          />
        )}
        {activeTab === 'rl' && (
          <RLVisualizer 
            db={db}
            rules={activeRules}
            activeStrategy={activeStrategy}
            setActiveStrategy={setActiveStrategy}
            strategySource={strategySource}
            setStrategySource={setStrategySource}
          />
        )}
      </main>

      <footer style={{
        textAlign: 'center',
        padding: '30px 0',
        marginTop: '50px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        color: '#5a7062',
        fontSize: '0.85rem'
      }}>
        <p>Blackjack Data Science Lab • Diseñado para mitigar varianza y optimizar rendimientos teóricos.</p>
        <p style={{ marginTop: '5px' }}>ponytail: simulaciones asíncronas en hilos paralelos (Web Workers) para rendimiento óptimo de la UI.</p>
      </footer>
    </div>
  );
}

export default App;
