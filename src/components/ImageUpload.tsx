import React, { useRef, useState } from 'react';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';
import { Camera, Trash2, Loader2, ImagePlus } from 'lucide-react';

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  collectionName: string;
  label?: string;
}

const MAX_SIZE_MB = 5;

export const ImageUpload: React.FC<ImageUploadProps> = ({
  value,
  onChange,
  collectionName,
  label = 'Foto',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem (JPG, PNG, WEBP).');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Imagem muito grande. Máximo de ${MAX_SIZE_MB}MB.`);
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `assets/${collectionName}/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);

      // Remove a imagem anterior do Storage (se for do nosso bucket) para não acumular arquivos
      if (value && value.includes('firebasestorage')) {
        try {
          // Extrai o path do objeto a partir da URL de download
          const match = value.match(/\/o\/([^?]+)/);
          if (match?.[1]) {
            const oldPath = decodeURIComponent(match[1]);
            if (oldPath.startsWith('assets/')) {
              await deleteObject(ref(storage, oldPath));
            }
          }
        } catch {
          // Falha silenciosa: o essencial (novo upload) já foi concluído
        }
      }

      onChange(url);
    } catch (e) {
      console.error('Erro ao enviar imagem:', e);
      setError('Falha no upload. Verifique sua permissão e tente novamente.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!value) return;
    setUploading(true);
    try {
      if (value.includes('firebasestorage')) {
        const match = value.match(/\/o\/([^?]+)/);
        if (match?.[1]) {
          const oldPath = decodeURIComponent(match[1]);
          if (oldPath.startsWith('assets/')) {
            await deleteObject(ref(storage, oldPath));
          }
        }
      }
    } catch {
      // segue removendo a referência mesmo se o arquivo já não existir
    } finally {
      onChange('');
      setUploading(false);
    }
  };

  return (
    <div className="col-span-full space-y-3">
      <label className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {label}
      </label>
      <div
        className="flex flex-col sm:flex-row items-stretch gap-4 p-4 rounded-2xl border border-dashed"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <div
          className="w-full sm:w-40 h-40 rounded-xl overflow-hidden flex items-center justify-center border flex-shrink-0"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
        >
          {value ? (
            <img src={value} alt={label} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 text-center" style={{ color: 'var(--text-secondary)' }}>
              <Camera size={28} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Sem foto</span>
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col justify-center gap-3">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Anexe uma foto do equipamento (JPG, PNG ou WEBP, até {MAX_SIZE_MB}MB). A imagem aparece na lista, na grade e nos detalhes do ativo.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--bg-primary)' }}
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
              {uploading ? 'Enviando...' : value ? 'Trocar foto' : 'Anexar foto'}
            </button>
            {value && (
              <>
                <a
                  href={value}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all"
                  style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
                >
                  Ver ampliada
                </a>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={handleRemove}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                  style={{ backgroundColor: 'transparent', color: 'var(--status-error)' }}
                >
                  <Trash2 size={16} />
                  Remover
                </button>
              </>
            )}
          </div>
          {error && <p className="text-[11px] font-bold" style={{ color: 'var(--status-error)' }}>{error}</p>}
        </div>
      </div>
    </div>
  );
};
