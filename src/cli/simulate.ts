import fs from 'fs';
import path from 'path';
import { initDatabase, saveStrategy, saveSimulation, saveHandHistoryBatch } from '../db/database.ts';
import { runMonteCarlo } from '../simulator/core/MonteCarloSimulation.ts';
import { DEFAULT_RULES } from '../simulator/core/defaultStrategy.ts';
import { runGeneticGeneration, initializePopulation, Chromosome, createDefaultChromosome } from '../simulator/core/GeneticEngine.ts';

// Configuración de rutas

function printHelp() {
  console.log(`
🃏 Plataforma de Ciencia de Datos Blackjack - Simulador CLI

Uso:
  npm run simulate -- [opciones]

Opciones:
  -h, --hands <num>        Número de manos a simular (por defecto: 100000)
  -b, --bankroll <num>     Bankroll inicial en COP (por defecto: 500000)
  -s, --baseBet <num>      Apuesta base en COP (por defecto: 2500)
  -p, --progression <tipo> Tipo de progresión: FLAT, PAROLI, DSP, KELLY (por defecto: DSP)
  -d, --db <ruta>          Ruta al archivo de base de datos SQLite (por defecto: blackjack_results.db)
  -o, --optimize           Ejecuta optimización genética previa (por defecto: desactivado)
  -g, --generations <num>  Generaciones para el algoritmo genético (por defecto: 10)
  --help                   Muestra esta ayuda
  `);
}

async function main() {
  const args = process.argv.slice(2);

  // Valores por defecto
  let numRounds = 100000;
  let initialBankroll = 500000;
  let baseBet = 2500;
  let progressionType: 'FLAT' | 'PAROLI' | 'DSP' | 'KELLY' = 'DSP';
  let dbPath = 'blackjack_results.db';
  let optimize = false;
  let generations = 10;

  // Parser simple de argumentos (Estilo Ponytail: 0 dependencias extra)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg === '-h' || arg === '--hands') {
      numRounds = parseInt(args[++i], 10);
    } else if (arg === '-b' || arg === '--bankroll') {
      initialBankroll = parseInt(args[++i], 10);
    } else if (arg === '-s' || arg === '--baseBet') {
      baseBet = parseInt(args[++i], 10);
    } else if (arg === '-p' || arg === '--progression') {
      progressionType = args[++i].toUpperCase() as any;
    } else if (arg === '-d' || arg === '--db') {
      dbPath = args[++i];
    } else if (arg === '-o' || arg === '--optimize') {
      optimize = true;
    } else if (arg === '-g' || arg === '--generations') {
      generations = parseInt(args[++i], 10);
    }
  }

  console.log('----------------------------------------------------');
  console.log('🎮 Inicializando Plataforma Científica de Blackjack...');
  console.log('----------------------------------------------------');
  console.log(`  - Manos a simular: ${numRounds.toLocaleString()}`);
  console.log(`  - Bankroll Inicial: $${initialBankroll.toLocaleString()} COP`);
  console.log(`  - Apuesta Base: $${baseBet.toLocaleString()} COP`);
  console.log(`  - Progresión: ${progressionType}`);
  console.log(`  - Base de Datos SQLite: ${dbPath}`);
  console.log(`  - Optimizar con Algoritmo Genético: ${optimize ? 'SÍ' : 'NO'}`);
  if (optimize) {
    console.log(`    - Generaciones: ${generations}`);
  }
  console.log('----------------------------------------------------');

  // Cargar base de datos local desde disco si existe
  let dbBytes: Uint8Array | undefined;
  const fullDbPath = path.resolve(process.cwd(), dbPath);
  if (fs.existsSync(fullDbPath)) {
    console.log(`📁 Cargando base de datos existente de: ${fullDbPath}`);
    dbBytes = new Uint8Array(fs.readFileSync(fullDbPath));
  } else {
    console.log(`📁 Creando nueva base de datos SQLite en: ${fullDbPath}`);
  }

  const db = await initDatabase(dbBytes);

  let activeChromosome: Chromosome = createDefaultChromosome(baseBet);
  activeChromosome.betting.type = progressionType;
  activeChromosome.betting.baseBet = baseBet;

  // 1. Optimización Genética si es solicitada
  if (optimize) {
    console.log('\n🧬 Iniciando optimización por algoritmo genético...');
    const popSize = 20;
    const mutationRate = 0.15;
    const handsPerEval = 2000; // Evaluaciones rápidas para velocidad
    const rules = DEFAULT_RULES;

    let population = initializePopulation(popSize, activeChromosome, mutationRate);

    for (let gen = 1; gen <= generations; gen++) {
      population = runGeneticGeneration(population, rules, initialBankroll, handsPerEval, mutationRate);
      const best = population[0];
      console.log(`   Gen ${gen}/${generations} | Mejor Fitness: ${best.fitness.toFixed(2)} | ROI: ${best.roi.toFixed(2)}% | MaxDD: ${best.drawdown.toFixed(2)}%`);
    }

    activeChromosome = population[0].chromosome;
    console.log('✅ Optimización completada. Matriz de juego adaptada.');
  }

  // Guardar la estrategia activa en la base de datos
  const strategyId = optimize ? `genetic-${Date.now()}` : 'basic-standard';
  const strategyName = optimize ? 'Estrategia Genética Optimizada' : 'Estrategia Básica Estándar';
  saveStrategy(
    db,
    strategyId,
    strategyName,
    activeChromosome.hard,
    activeChromosome.soft,
    activeChromosome.pairs,
    activeChromosome.betting
  );

  // 2. Correr Simulación de Monte Carlo
  console.log('\n🎲 Ejecutando simulación Monte Carlo de Blackjack...');
  const rules = DEFAULT_RULES;
  
  // Guardar hasta 5,000 manos de historial para análisis en la base de datos
  const saveLimit = Math.min(5000, numRounds);

  const startSimTime = Date.now();
  const simResult = runMonteCarlo(
    numRounds,
    initialBankroll,
    rules,
    activeChromosome,
    activeChromosome.betting,
    {
      saveHandHistoryLimit: saveLimit,
      onProgress: (progress, currentBankroll) => {
        const barLength = 20;
        const filledLength = Math.round((progress / 100) * barLength);
        const bar = '='.repeat(filledLength) + ' '.repeat(barLength - filledLength);
        process.stdout.write(`\r   [${bar}] ${progress.toFixed(1)}% | Bankroll: $${Math.round(currentBankroll).toLocaleString()} COP`);
      }
    }
  );
  const endSimTime = Date.now();

  process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Limpiar la línea de progreso
  console.log(`✅ Simulación completada en ${((endSimTime - startSimTime) / 1000).toFixed(2)} segundos.\n`);

  // 3. Registrar resultados en la base de datos
  const simulationId = `sim-${Date.now()}`;
  const simulationRecord = {
    id: simulationId,
    strategyId,
    handsPlayed: simResult.stats.handsPlayed,
    initialBankroll,
    finalBankroll: simResult.finalBankroll,
    maxDrawdown: simResult.maxDrawdown,
    netProfit: simResult.finalBankroll - initialBankroll,
    roi: simResult.roi,
    winRate: simResult.winRate,
    rulesConfig: rules
  };

  saveSimulation(db, simulationRecord);

  if (simResult.sampleHands && simResult.sampleHands.length > 0) {
    console.log(`💾 Registrando ${simResult.sampleHands.length.toLocaleString()} manos de historial en SQLite...`);
    saveHandHistoryBatch(db, simulationId, simResult.sampleHands);
  }

  // Guardar archivo SQLite de vuelta a disco
  const exportedBytes = db.export();
  fs.writeFileSync(fullDbPath, Buffer.from(exportedBytes));
  console.log(`💾 Base de datos SQLite guardada con éxito.`);

  // 4. Imprimir reporte de resultados en consola
  const netResult = simResult.finalBankroll - initialBankroll;
  const roiColor = simResult.roi >= 0 ? '\x1b[32m' : '\x1b[31m'; // Verde o Rojo
  const resetColor = '\x1b[0m';

  console.log('\n====================================================');
  console.log('📊 REPORTE DE RENDIMIENTO (MONTE CARLO)');
  console.log('====================================================');
  console.log(`  Manos jugadas          : ${simResult.stats.handsPlayed.toLocaleString()}`);
  console.log(`  Victorias              : ${simResult.stats.wins.toLocaleString()} (${simResult.winRate.toFixed(2)}%)`);
  console.log(`  Derrotas               : ${simResult.stats.losses.toLocaleString()}`);
  console.log(`  Empates (Pushes)       : ${simResult.stats.pushes.toLocaleString()}`);
  console.log(`  Blackjacks             : ${simResult.stats.blackjacks.toLocaleString()}`);
  console.log(`  Surrenders (Rendiciones): ${simResult.stats.surrenders.toLocaleString()}`);
  console.log(`  Dobles y Splits        : ${simResult.stats.doubles.toLocaleString()} D / ${simResult.stats.splits.toLocaleString()} SP`);
  console.log('----------------------------------------------------');
  console.log(`  Bankroll Final         : $${Math.round(simResult.finalBankroll).toLocaleString()} COP`);
  console.log(`  Resultado Neto         : ${roiColor}$${Math.round(netResult).toLocaleString()} COP${resetColor}`);
  console.log(`  Retorno de Inversión   : ${roiColor}${simResult.roi.toFixed(2)}%${resetColor}`);
  console.log(`  Drawdown Máximo        : ${simResult.maxDrawdown.toFixed(2)}%`);
  console.log(`  Ventaja de la Casa     : ${simResult.houseEdge.toFixed(4)}%`);
  console.log(`  Bancarrotas            : ${simResult.stats.bankruptcies}`);
  console.log(`  Kelly Sugerido (F)     : ${simResult.kellyFraction.toFixed(4)}`);
  console.log('====================================================\n');

  db.close();
}

main().catch((err) => {
  console.error('❌ Error fatal en simulador CLI:', err);
  process.exit(1);
});
