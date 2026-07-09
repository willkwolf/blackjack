import { runMonteCarlo } from './core/MonteCarloSimulation.ts';

// Configurar el Web Worker para ejecutar simulaciones Monte Carlo en segundo plano
self.addEventListener('message', (event) => {
  const { type, config } = event.data;

  if (type === 'start') {
    try {
      const { numRounds, initialBankroll, rules, strategy, progConfig, saveHandHistoryLimit } = config;

      const result = runMonteCarlo(
        numRounds,
        initialBankroll,
        rules,
        strategy,
        progConfig,
        {
          saveHandHistoryLimit: saveHandHistoryLimit || 0,
          onProgress: (progress, currentBankroll) => {
            self.postMessage({
              type: 'progress',
              data: { progress, currentBankroll }
            });
          }
        }
      );

      self.postMessage({
        type: 'complete',
        data: result
      });
    } catch (error: any) {
      self.postMessage({
        type: 'error',
        data: { message: error.message || 'Error desconocido en simulación' }
      });
    }
  }
});
