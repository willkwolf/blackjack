import React, { useState, useEffect } from 'react';
import { Book, Plus, ExternalLink, Check } from 'lucide-react';
import { getResearchPapers, saveResearchPaper } from '../../db/database.ts';
import { Paper } from '../../simulator/core/defaultPapers.ts';

interface ResearchLibraryProps {
  db: any;
}

export default function ResearchLibrary({ db }: ResearchLibraryProps) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

  // Campos del formulario
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [publishedDate, setPublishedDate] = useState('');
  const [summary, setSummary] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [tested, setTested] = useState(false);

  // Recargar papers de la base de datos
  const loadPapers = () => {
    try {
      const data = getResearchPapers(db);
      setPapers(data);
    } catch (e) {
      console.error('Error al cargar papers de la base de datos SQLite:', e);
    }
  };

  useEffect(() => {
    loadPapers();
  }, [db]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !authors || !summary || !pdfUrl) {
      alert('Por favor, completa los campos requeridos (Título, Autores, Resumen y URL del PDF).');
      return;
    }

    const paperId = `paper-${Date.now()}`;
    const newPaper = {
      id: paperId,
      title,
      authors,
      publishedDate: publishedDate || new Date().toISOString().split('T')[0],
      summary,
      pdfUrl,
      implementationNotes: notes,
      tested
    };

    try {
      saveResearchPaper(db, newPaper);
      loadPapers();
      
      // Limpiar formulario
      setTitle('');
      setAuthors('');
      setPublishedDate('');
      setSummary('');
      setPdfUrl('');
      setNotes('');
      setTested(false);
      setShowAddForm(false);
      
      alert('📖 Paper agregado con éxito a la base de datos relacional.');
    } catch (err) {
      console.error(err);
      alert('No se pudo guardar el paper.');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: showAddForm ? '1fr' : '1fr 380px', gap: '30px' }}>
      
      {/* Listado de Papers */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h2 style={{ color: 'var(--gold)', fontSize: '1.4rem' }}>
            📖 Biblioteca de Investigación Científica (Blackjack Lab)
          </h2>
          {!showAddForm && (
            <button 
              onClick={() => setShowAddForm(true)}
              className="casino-btn btn-deal"
              style={{ fontSize: '0.85rem', padding: '8px 16px' }}
            >
              <Plus size={16} /> Agregar Paper
            </button>
          )}
        </div>

        {papers.length === 0 ? (
          <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>No hay papers científicos registrados en la base de datos local...</p>
        ) : (
          papers.map((paper) => (
            <div 
              key={paper.id} 
              className="glass-panel" 
              style={{ 
                borderLeft: paper.tested ? '4px solid var(--green-neon)' : '4px solid var(--gold)',
                display: 'flex',
                flexDirection: 'column',
                gap: '15px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', color: '#fff', lineHeight: '1.4' }}>{paper.title}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--gold)', marginTop: '4px' }}>
                    Autor(es): {paper.authors} • Publicado: {paper.publishedDate}
                  </p>
                </div>
                {paper.tested && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: 'rgba(0, 230, 118, 0.15)',
                    border: '1px solid var(--green-neon)',
                    fontSize: '0.75rem',
                    color: 'var(--green-neon)',
                    fontWeight: 'bold',
                    textTransform: 'uppercase'
                  }}>
                    <Check size={12} /> Implementado
                  </span>
                )}
              </div>

              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <strong>Resumen:</strong> {paper.summary}
              </p>

              {paper.implementationNotes && (
                <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', fontSize: '0.85rem' }}>
                  <p style={{ color: 'var(--gold)', fontWeight: 'bold', marginBottom: '4px' }}>🛠️ Notas de Integración:</p>
                  <p style={{ color: 'var(--text-secondary)' }}>{paper.implementationNotes}</p>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '10px' }}>
                <a 
                  href={paper.pdfUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'var(--gold)',
                    textDecoration: 'none',
                    fontSize: '0.85rem',
                    fontWeight: '600'
                  }}
                >
                  Ver PDF Completo (arXiv) <ExternalLink size={14} />
                </a>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Formulario para agregar Paper (Sidebar o modal-like) */}
      {showAddForm ? (
        <section className="glass-panel" style={{ height: 'fit-content' }}>
          <h3 style={{ color: 'var(--gold)', marginBottom: '20px', fontSize: '1.2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
            📖 Agregar Paper Científico a la DB
          </h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Título del Artículo *</label>
              <input 
                type="text" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                style={{ width: '100%', padding: '10px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '6px' }}
                placeholder="Ej: On evolutionary selection of..."
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Autores *</label>
              <input 
                type="text" 
                value={authors} 
                onChange={(e) => setAuthors(e.target.value)}
                style={{ width: '100%', padding: '10px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '6px' }}
                placeholder="Ej: Mikhail Goykhman"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Fecha de Publicación</label>
                <input 
                  type="date" 
                  value={publishedDate} 
                  onChange={(e) => setPublishedDate(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '6px' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Enlace al PDF (URL) *</label>
                <input 
                  type="url" 
                  value={pdfUrl} 
                  onChange={(e) => setPdfUrl(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '6px' }}
                  placeholder="https://arxiv.org/pdf/..."
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Resumen / Abstract *</label>
              <textarea 
                value={summary} 
                onChange={(e) => setSummary(e.target.value)}
                rows={4}
                style={{ width: '100%', padding: '10px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '6px', resize: 'vertical' }}
                placeholder="Escribe un breve resumen de los hallazgos y metodologías del paper..."
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Notas de Implementación en el Simulador</label>
              <textarea 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '10px', background: '#07180e', color: '#fff', border: '1px solid var(--felt-border)', borderRadius: '6px', resize: 'vertical' }}
                placeholder="¿Cómo se aplica o modela la estrategia propuesta en este sistema?"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input 
                type="checkbox" 
                id="tested" 
                checked={tested} 
                onChange={(e) => setTested(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="tested" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                ¿El paper ya fue implementado y probado en esta plataforma?
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="submit" className="casino-btn btn-deal" style={{ flexGrow: 1, justifyContent: 'center' }}>
                Guardar en la DB
              </button>
              <button 
                type="button" 
                onClick={() => setShowAddForm(false)} 
                className="casino-btn"
                style={{ background: 'rgba(255, 23, 68, 0.1)', color: 'var(--red-neon)', border: '1px solid var(--red-neon)' }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      ) : (
        /* Breve introducción científica */
        <aside className="glass-panel" style={{ height: 'fit-content', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <h3 style={{ color: 'var(--gold)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Book size={18} /> Ciencia de Datos
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            El Blackjack es el único juego de casino que posee una <strong>memoria matemática</strong> dependiente de la baraja física, lo cual ha generado décadas de investigación en probabilidad aplicada y toma de decisiones.
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            Esta biblioteca relacional local te permite registrar cualquier paper científico y estructurar su integración en la plataforma. Los papers cargados de manera predeterminada sirven de sustento teórico para los algoritmos genéticos y agentes de RL incluidos aquí.
          </p>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
            📊 Los datos relacionales persisten en el cliente local utilizando IndexedDB y son exportables en formato SQL a cualquier libreta Jupyter de Python.
          </div>
        </aside>
      )}
    </div>
  );
}
