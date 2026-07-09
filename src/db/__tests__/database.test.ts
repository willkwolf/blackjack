import { describe, it, expect } from 'vitest';
import { initDatabase, saveStrategy, getStrategies, saveSimulation, getSimulations, saveHandHistoryBatch, getHandHistories, saveResearchPaper, getResearchPapers } from '../database.ts';

describe('SQLite Database Layer Tests', () => {
  it('should initialize the database and create tables', async () => {
    const db = await initDatabase();
    expect(db).toBeDefined();

    // Comprobar que las tablas existen
    const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tablesRes[0].values.map((row: any[]) => row[0]);
    expect(tableNames).toContain('strategies');
    expect(tableNames).toContain('simulations');
    expect(tableNames).toContain('hand_histories');
    expect(tableNames).toContain('research_papers');
    db.close();
  });

  it('should save and retrieve strategies correctly', async () => {
    const db = await initDatabase();
    const mockProgression = { type: 'DSP', unit: 2500, maxSteps: 3 };
    const mockMatrix = { '16': ['H', 'H', 'S', 'S', 'S', 'H', 'H', 'SU', 'SU', 'SU'] };

    saveStrategy(db, 'strat-test-1', 'Estrategia de Prueba', mockMatrix, {}, {}, mockProgression);

    const strategies = getStrategies(db);
    expect(strategies.length).toBe(1);
    expect(strategies[0].id).toBe('strat-test-1');
    expect(strategies[0].name).toBe('Estrategia de Prueba');
    expect(strategies[0].matrix_hard['16']).toEqual(['H', 'H', 'S', 'S', 'S', 'H', 'H', 'SU', 'SU', 'SU']);
    expect(strategies[0].betting_progression.type).toBe('DSP');
    db.close();
  });

  it('should save and query simulations and batch hand histories in a transaction', async () => {
    const db = await initDatabase();

    const mockSim = {
      id: 'sim-test-1',
      strategyId: 'strat-test-1',
      handsPlayed: 10,
      initialBankroll: 100000,
      finalBankroll: 105000,
      maxDrawdown: 5.2,
      netProfit: 5000,
      roi: 5.0,
      winRate: 60.0,
      rulesConfig: { decks: 6, das: true, h17: false }
    };

    saveSimulation(db, mockSim);

    const sims = getSimulations(db);
    expect(sims.length).toBe(1);
    expect(sims[0].id).toBe('sim-test-1');
    expect(sims[0].roi).toBe(5.0);
    expect(sims[0].rules_config.das).toBe(true);

    const mockHands = [
      {
        handNumber: 1,
        playerCards: ['A', '8'],
        dealerUpcard: '5',
        playerFinalValue: 19,
        dealerFinalValue: 18,
        playerDecisionSequence: ['D'],
        betSize: 5000,
        reward: 10000,
        outcome: 'WIN'
      },
      {
        handNumber: 2,
        playerCards: ['10', '6'],
        dealerUpcard: '10',
        playerFinalValue: 16,
        dealerFinalValue: 20,
        playerDecisionSequence: ['SU'],
        betSize: 5000,
        reward: -2500,
        outcome: 'SURRENDER'
      }
    ];

    // Guardar lote de manos en transaccion
    saveHandHistoryBatch(db, 'sim-test-1', mockHands);

    const hands = getHandHistories(db, 'sim-test-1');
    expect(hands.length).toBe(2);
    expect(hands[0].hand_number).toBe(1);
    expect(hands[0].player_initial_cards).toEqual(['A', '8']);
    expect(hands[0].player_decision_sequence).toEqual(['D']);
    expect(hands[0].reward).toBe(10000);
    expect(hands[1].outcome).toBe('SURRENDER');
    db.close();
  });

  it('should save and retrieve research papers', async () => {
    const db = await initDatabase();
    const mockPaper = {
      id: 'arXiv:1711.05993',
      title: 'On evolutionary selection of blackjack strategies',
      authors: 'Mikhail Goykhman',
      publishedDate: '2017-11-16',
      summary: 'Evolutionary programming to optimize blackjack basic strategy.',
      pdfUrl: 'https://arxiv.org/pdf/1711.05993v1',
      implementationNotes: 'Initialize GA with Thorp basic strategy.',
      tested: true
    };

    saveResearchPaper(db, mockPaper);

    const papers = getResearchPapers(db);
    expect(papers.length).toBe(4); // Sembrados 4 por defecto + 1 modificado (sobreescrito)
    expect(papers.find(p => p.id === 'arXiv:1711.05993').tested).toBe(true);
    db.close();
  });

  it('should support export and import', async () => {
    const db = await initDatabase();
    saveStrategy(db, 'strat-export', 'Exportable', {}, {}, {}, {});

    const bytes = db.export(); // Exportar bytes
    db.close();

    // Importar en una base de datos nueva
    const newDb = await initDatabase(bytes);
    const strategies = getStrategies(newDb);
    expect(strategies.length).toBe(1);
    expect(strategies[0].id).toBe('strat-export');
    newDb.close();
  });
});
