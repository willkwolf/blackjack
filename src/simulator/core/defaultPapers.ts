export interface Paper {
  id: string;
  title: string;
  authors: string;
  publishedDate: string;
  summary: string;
  pdfUrl: string;
  implementationNotes?: string;
  tested?: boolean;
}

export const DEFAULT_PAPERS: Paper[] = [
  {
    id: "arXiv:1711.05993",
    title: "On evolutionary selection of blackjack strategies",
    authors: "Mikhail Goykhman",
    publishedDate: "2017-11-16",
    summary: "Se aplica el enfoque de programación evolutiva (Algoritmos Genéticos) al problema de optimización de la estrategia básica del blackjack. Se demuestra que una población de estrategias aleatorias evoluciona y satura hacia un rendimiento óptimo en unas 100 generaciones, asemejándose a la clásica estrategia de Thorp.",
    pdfUrl: "https://arxiv.org/pdf/1711.05993v1",
    implementationNotes: "Inspiró el motor de optimización genética de la plataforma. La función de aptitud recompensa el ROI neto y penaliza el drawdown máximo.",
    tested: true
  },
  {
    id: "arXiv:2308.07329",
    title: "Variations on the Reinforcement Learning performance of Blackjack",
    authors: "Avish Buramdoyal, Tim Gebbie",
    publishedDate: "2023-08-09",
    summary: "Investiga soluciones de Q-Learning para el juego óptimo del Blackjack y analiza la convergencia del algoritmo según el tamaño de la baraja y las variaciones en las reglas. Demuestra cómo un agente aprende de manera autónoma en entornos estocásticos.",
    pdfUrl: "https://arxiv.org/pdf/2308.07329v1",
    implementationNotes: "Base del agente Q-Learning de esta plataforma. Modela el estado como (PlayerValue, DealerUpcard, IsSoft) y actualiza mediante la ecuación de Bellman.",
    tested: true
  },
  {
    id: "arXiv:1403.8081",
    title: "Integer Compositions Applied to the Probability Analysis of Blackjack and the Infinite Deck Assumption",
    authors: "Jonathan Marino, David G. Taylor",
    publishedDate: "2014-03-18",
    summary: "Utiliza la teoría de composición de enteros para enumerar y calcular con precisión matemática las formas en que el dealer puede alcanzar cualquier puntaje final en Blackjack, eliminando composiciones de cartas ilegales.",
    pdfUrl: "https://arxiv.org/pdf/1403.8081v1",
    implementationNotes: "Proporciona la base teórica para validar la distribución empírica de puntajes del dealer en nuestro simulador Monte Carlo.",
    tested: false
  },
  {
    id: "arXiv:1906.01220",
    title: "Snackjack: A toy model of blackjack",
    authors: "Stewart N. Ethier, Jiyeon Lee",
    publishedDate: "2019-06-04",
    summary: "Propone Snackjack, un modelo hiper-simplificado de Blackjack con baraja de 8 cartas y meta de 7 puntos. Su simplicidad matemática permite derivar de forma analítica estrategias básicas y conteo, ayudando a entender el Blackjack real.",
    pdfUrl: "https://arxiv.org/pdf/1906.01220v1",
    implementationNotes: "Excelente modelo educativo de prueba para validar que el motor de simulación converge con cálculos analíticos realizados a mano.",
    tested: false
  }
];
