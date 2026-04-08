import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft } from 'lucide-react';

export const CollaboratorDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [collaborator, setCollaborator] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCollaborator = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, 'collaborators', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setCollaborator(docSnap.data());
        }
      } catch (error) {
        console.error('Error fetching collaborator:', error);
      }
      setLoading(false);
    };
    fetchCollaborator();
  }, [id]);

  if (loading) return <div className="p-6">Carregando...</div>;
  if (!collaborator) return <div className="p-6">Colaborador não encontrado</div>;

  return (
    <div className="p-6 space-y-4">
      <button onClick={() => navigate('/collaborators')} className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
        <ArrowLeft size={16} /> Voltar para Colaboradores
      </button>
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{collaborator.name}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Login</p>
          <p style={{ color: 'var(--text-primary)' }}>{collaborator.login}</p>
        </div>
        <div className="p-4 rounded-xl border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>E-mail</p>
          <p style={{ color: 'var(--text-primary)' }}>{collaborator.email}</p>
        </div>
      </div>
    </div>
  );
};
