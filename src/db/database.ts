import initSqlJs from 'sql.js';
import { DEFAULT_PAPERS } from '../simulator/core/defaultPapers.ts';

let SQL: any = null;

// Inicializa el motor de sql.js (unificado para Node y Navegador)
export async function getSqlEngine() {
  if (!SQL) {
    if (typeof window === 'undefined') {
      // Node.js - carga dinámica de módulos del sistema para evitar romper el build del navegador
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const wasmPath = path.resolve(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
      
      const wasmBinary = new Uint8Array(fs.readFileSync(wasmPath));
      SQL = await initSqlJs({ wasmBinary: wasmBinary as any });
    } else {
      // Navegador - carga local con fallback a CDN (redundante y resiliente)
      const baseUrl = import.meta.env.BASE_URL || '/';
      try {
        SQL = await initSqlJs({
          locateFile: (file) => `${baseUrl}${file}`
        });
        console.log('✅ SQLite Wasm cargado localmente con éxito.');
      } catch (err) {
        console.warn('⚠️ Fallo al cargar SQLite Wasm localmente. Usando fallback de CDN...', err);
        SQL = await initSqlJs({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.10.2/dist/${file}`
        });
        console.log('✅ SQLite Wasm cargado desde CDN como fallback.');
      }
    }
  }
  return SQL;
}

// Crea una base de datos nueva o carga una existente desde bytes
export async function initDatabase(existingDbBytes?: Uint8Array) {
  const SqlEngine = await getSqlEngine();
  const db = new SqlEngine.Database(existingDbBytes as any);
  createTables(db);
  seedResearchPapers(db);
  return db;
}

// Inicializa las tablas relacionales de SQLite
function createTables(db: any) {
  db.run(`
    CREATE TABLE IF NOT EXISTS strategies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      matrix_hard TEXT NOT NULL,
      matrix_soft TEXT NOT NULL,
      matrix_pairs TEXT NOT NULL,
      betting_progression TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS simulations (
      id TEXT PRIMARY KEY,
      strategy_id TEXT,
      run_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      hands_played INTEGER NOT NULL,
      initial_bankroll REAL NOT NULL,
      final_bankroll REAL NOT NULL,
      max_drawdown REAL NOT NULL,
      net_profit REAL NOT NULL,
      roi REAL NOT NULL,
      win_rate REAL NOT NULL,
      rules_config TEXT NOT NULL,
      FOREIGN KEY (strategy_id) REFERENCES strategies(id)
    );

    CREATE TABLE IF NOT EXISTS hand_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      simulation_id TEXT,
      hand_number INTEGER NOT NULL,
      player_initial_cards TEXT NOT NULL,
      dealer_upcard TEXT NOT NULL,
      player_final_value INTEGER NOT NULL,
      dealer_final_value INTEGER NOT NULL,
      player_decision_sequence TEXT NOT NULL,
      bet_size REAL NOT NULL,
      reward REAL NOT NULL,
      outcome TEXT NOT NULL,
      FOREIGN KEY (simulation_id) REFERENCES simulations(id)
    );

    CREATE TABLE IF NOT EXISTS research_papers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      authors TEXT NOT NULL,
      published_date TEXT NOT NULL,
      summary TEXT NOT NULL,
      pdf_url TEXT NOT NULL,
      implementation_notes TEXT,
      tested BOOLEAN DEFAULT 0
    );
  `);
}

// Guarda o actualiza una estrategia
export function saveStrategy(
  db: any,
  id: string,
  name: string,
  matrixHard: any,
  matrixSoft: any,
  matrixPairs: any,
  bettingProgression: any
) {
  db.run(
    `INSERT OR REPLACE INTO strategies (id, name, matrix_hard, matrix_soft, matrix_pairs, betting_progression)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      JSON.stringify(matrixHard),
      JSON.stringify(matrixSoft),
      JSON.stringify(matrixPairs),
      JSON.stringify(bettingProgression)
    ]
  );
}

// Guarda un resumen de simulación
export function saveSimulation(db: any, sim: any) {
  db.run(
    `INSERT OR REPLACE INTO simulations (id, strategy_id, hands_played, initial_bankroll, final_bankroll, max_drawdown, net_profit, roi, win_rate, rules_config)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sim.id,
      sim.strategyId,
      sim.handsPlayed,
      sim.initialBankroll,
      sim.finalBankroll,
      sim.maxDrawdown,
      sim.netProfit,
      sim.roi,
      sim.winRate,
      JSON.stringify(sim.rulesConfig)
    ]
  );
}

// Guarda un lote de manos de historial de manera ultra-eficiente en una sola transacción
export function saveHandHistoryBatch(db: any, simulationId: string, hands: any[]) {
  db.run('BEGIN TRANSACTION');
  try {
    const stmt = db.prepare(`
      INSERT INTO hand_histories (simulation_id, hand_number, player_initial_cards, dealer_upcard, player_final_value, dealer_final_value, player_decision_sequence, bet_size, reward, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const hand of hands) {
      stmt.run([
        simulationId,
        hand.handNumber,
        JSON.stringify(hand.playerCards),
        hand.dealerUpcard,
        hand.playerFinalValue,
        hand.dealerFinalValue,
        hand.playerDecisionSequence.join(','),
        hand.betSize,
        hand.reward,
        hand.outcome
      ]);
    }

    stmt.free();
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

// Guarda un paper científico en la base de datos local
export function saveResearchPaper(db: any, paper: any) {
  db.run(
    `INSERT OR REPLACE INTO research_papers (id, title, authors, published_date, summary, pdf_url, implementation_notes, tested)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      paper.id,
      paper.title,
      paper.authors,
      paper.publishedDate,
      paper.summary,
      paper.pdfUrl,
      paper.implementationNotes || null,
      paper.tested ? 1 : 0
    ]
  );
}

// Recupera todas las estrategias
export function getStrategies(db: any): any[] {
  const res = db.exec('SELECT * FROM strategies ORDER BY created_at DESC');
  if (res.length === 0) return [];
  const columns = res[0].columns;
  return res[0].values.map((row: any[]) => {
    const obj: any = {};
    columns.forEach((col: string, idx: number) => {
      obj[col] = row[idx];
    });
    obj.matrix_hard = JSON.parse(obj.matrix_hard);
    obj.matrix_soft = JSON.parse(obj.matrix_soft);
    obj.matrix_pairs = JSON.parse(obj.matrix_pairs);
    obj.betting_progression = JSON.parse(obj.betting_progression);
    return obj;
  });
}

// Recupera todas las simulaciones
export function getSimulations(db: any): any[] {
  const res = db.exec('SELECT * FROM simulations ORDER BY run_date DESC');
  if (res.length === 0) return [];
  const columns = res[0].columns;
  return res[0].values.map((row: any[]) => {
    const obj: any = {};
    columns.forEach((col: string, idx: number) => {
      obj[col] = row[idx];
    });
    obj.rules_config = JSON.parse(obj.rules_config);
    return obj;
  });
}

// Recupera el historial de manos para una simulación específica
export function getHandHistories(db: any, simulationId: string): any[] {
  const res = db.exec('SELECT * FROM hand_histories WHERE simulation_id = ? ORDER BY hand_number ASC', [simulationId]);
  if (res.length === 0) return [];
  const columns = res[0].columns;
  return res[0].values.map((row: any[]) => {
    const obj: any = {};
    columns.forEach((col: string, idx: number) => {
      obj[col] = row[idx];
    });
    obj.player_initial_cards = JSON.parse(obj.player_initial_cards);
    obj.player_decision_sequence = obj.player_decision_sequence ? obj.player_decision_sequence.split(',') : [];
    return obj;
  });
}

// Recupera la lista de papers científicos
export function getResearchPapers(db: any): any[] {
  const res = db.exec('SELECT * FROM research_papers ORDER BY published_date DESC');
  if (res.length === 0) return [];
  const columns = res[0].columns;
  return res[0].values.map((row: any[]) => {
    const obj: any = {};
    columns.forEach((col: string, idx: number) => {
      obj[col] = row[idx];
    });
    obj.tested = obj.tested === 1;
    return obj;
  });
}

// Inicializa la base de datos local con papers académicos semilla
function seedResearchPapers(db: any) {
  try {
    const res = db.exec('SELECT COUNT(*) FROM research_papers');
    const count = res[0].values[0][0];
    if (count === 0) {
      db.run('BEGIN TRANSACTION');
      const stmt = db.prepare(`
        INSERT INTO research_papers (id, title, authors, published_date, summary, pdf_url, implementation_notes, tested)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const paper of DEFAULT_PAPERS) {
        stmt.run([
          paper.id,
          paper.title,
          paper.authors,
          paper.publishedDate,
          paper.summary,
          paper.pdfUrl,
          paper.implementationNotes || null,
          paper.tested ? 1 : 0
        ]);
      }
      stmt.free();
      db.run('COMMIT');
    }
  } catch (error) {
    try {
      db.run('ROLLBACK');
    } catch (_) {}
    console.error('Error al sembrar papers en base de datos:', error);
  }
}
