import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Send, 
  Tag as TagIcon, 
  User as UserIcon, 
  Clock, 
  Trash2, 
  AlertCircle,
  CheckCircle2,
  Info,
  HelpCircle,
  X
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  deleteDoc, 
  doc,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, formatDate } from '../firebase';
import { Comment, CommentTag, UserProfile } from '../types';
import { logAction } from '../utils/audit';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CommentsSectionProps {
  entityId: string;
  entityType: Comment['entityType'];
  currentUserProfile: UserProfile | null;
}

const TAG_CONFIG: Record<CommentTag, { label: string; color: string; icon: any }> = {
  '#Erro': { label: 'Erro', color: 'bg-[var(--status-cancelled-bg)] text-[var(--status-cancelled-text)] border-[var(--status-cancelled-text)]/20', icon: AlertCircle },
  '#Incomplete': { label: 'Incompleto', color: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] border-[var(--status-warning-text)]/20', icon: HelpCircle },
  '#SolicitaçãoMudança': { label: 'Solicitação de Mudança', color: 'bg-[var(--status-info-bg)] text-[var(--status-info-text)] border-[var(--status-info-text)]/20', icon: Info },
  '#Desligamento': { label: 'Desligamento', color: 'bg-[var(--status-cancelled-bg)] text-[var(--status-cancelled-text)] border-[var(--status-cancelled-text)]/20', icon: X },
  '#TrocaSetor': { label: 'Troca de Setor', color: 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border-[var(--accent-primary)]/20', icon: TagIcon },
  'none': { label: 'Observação', color: 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)]', icon: MessageSquare },
};

export const CommentsSection: React.FC<CommentsSectionProps> = ({ entityId, entityType, currentUserProfile }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [selectedTag, setSelectedTag] = useState<CommentTag>('none');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!entityId) return;

    const q = query(
      collection(db, 'comments'),
      where('entityId', '==', entityId),
      where('entityType', '==', entityType),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Comment[];
      setComments(fetchedComments);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'comments');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [entityId, entityType]);

  const handleSubmit = async (e: React.FormEvent, parentId?: string) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUserProfile) return;

    setSubmitting(true);
    try {
      const commentData = {
        entityId,
        entityType,
        authorId: currentUserProfile.uid,
        authorName: currentUserProfile.displayName || currentUserProfile.email || 'Usuário',
        authorEmail: currentUserProfile.email,
        content: newComment.trim(),
        tag: selectedTag,
        mentions: [],
        parentId: parentId || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'comments'), commentData);
      
      // Update entity with lastCommentAt
      try {
        const entityRef = doc(db, entityType, entityId);
        await updateDoc(entityRef, {
          lastCommentAt: serverTimestamp()
        });
      } catch (updateError) {
        console.error('Error updating entity lastCommentAt:', updateError);
      }
      
      // Log audit action
      await logAction(
        'comment',
        entityType,
        entityId,
        null,
        { ...commentData },
        `Novo comentário adicionado por ${currentUserProfile.displayName} em ${entityType} (${entityId})`,
        undefined,
        'low'
      );
      
      // Automatic notification system:
      if (currentUserProfile.role === 'viewer' || currentUserProfile.role === 'manager') {
        try {
          const idToken = await auth.currentUser?.getIdToken();
          if (idToken) {
            await fetch('/api/notifications/notify-admins', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
              },
              body: JSON.stringify({
                entityId,
                entityType,
                commentContent: newComment.trim(),
                authorName: currentUserProfile.displayName,
                tag: selectedTag,
                link: `/${entityType}?id=${entityId}`
              })
            });
          }
        } catch (notifyError) {
          console.error('Failed to send notifications:', notifyError);
        }
      }

      setNewComment('');
      setSelectedTag('none');
      setReplyingToId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'comments');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este comentário?')) return;

    try {
      const comment = comments.find(c => c.id === commentId);
      await deleteDoc(doc(db, 'comments', commentId));
      
      // Check if this was the last comment for this entity
      const remainingComments = comments.filter(c => c.id !== commentId);
      try {
        const entityRef = doc(db, entityType, entityId);
        if (remainingComments.length === 0) {
          await updateDoc(entityRef, {
            lastCommentAt: null
          });
        } else {
          // Find the most recent remaining comment
          const mostRecent = remainingComments.reduce((prev, current) => {
            const prevDate = new Date(formatDate(prev.createdAt));
            const currentDate = new Date(formatDate(current.createdAt));
            return prevDate > currentDate ? prev : current;
          });
          await updateDoc(entityRef, {
            lastCommentAt: mostRecent.createdAt
          });
        }
      } catch (updateError) {
        console.error('Error updating entity lastCommentAt:', updateError);
      }
      
      // Log audit action
      if (comment) {
        await logAction(
          'delete',
          entityType,
          commentId,
          comment,
          null,
          `Comentário excluído por ${currentUserProfile?.displayName} em ${entityType} (${entityId})`,
          'Exclusão manual pelo usuário',
          'medium'
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'comments');
    }
  };

  const canDelete = (comment: Comment) => {
    if (!currentUserProfile) return false;
    return comment.authorId === currentUserProfile.uid || ['admin', 'super_admin'].includes(currentUserProfile.role);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2 text-[var(--text-primary)]">
          <MessageSquare className="w-5 h-5 text-[var(--accent-primary)]" />
          Histórico e Observações
        </h3>
      </div>

      {/* New Comment Form */}
      {currentUserProfile && (currentUserProfile.role === 'editor' || currentUserProfile.role === 'manager' || ['admin', 'super_admin'].includes(currentUserProfile.role)) && (
        <form onSubmit={handleSubmit} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TAG_CONFIG) as CommentTag[]).map((tag) => {
              const config = TAG_CONFIG[tag];
              const Icon = config.icon;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    selectedTag === tag 
                      ? config.color + ' ring-2 ring-offset-1 ring-[var(--accent-primary)]' 
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-[var(--bg-primary)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {config.label}
                </button>
              );
            })}
          </div>

          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Escreva sua observação... (Suporta Markdown)"
            className="w-full min-h-[100px] p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent resize-none text-sm placeholder:text-[var(--text-secondary)]/50"
            disabled={submitting}
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !newComment.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Publicar Observação
            </button>
          </div>
        </form>
      )}

      {/* Comments List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-12 bg-[var(--bg-secondary)] rounded-xl border border-dashed border-[var(--border-color)]">
            <MessageSquare className="w-12 h-12 text-[var(--text-secondary)] mx-auto mb-3 opacity-20" />
            <p className="text-[var(--text-secondary)] text-sm">Nenhuma observação registrada ainda.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {comments
              .filter(c => !c.parentId)
              .map((comment) => {
                const replies = comments.filter(c => c.parentId === comment.id);
                const config = TAG_CONFIG[comment.tag];
                const Icon = config.icon;
                return (
                  <div key={comment.id} className="space-y-2">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] p-4 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[var(--accent-primary)]/10 flex items-center justify-center text-[var(--accent-primary)] font-bold text-xs">
                            {comment.authorName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[var(--text-primary)]">{comment.authorName}</span>
                              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${config.color}`}>
                                <Icon className="w-3 h-3" />
                                {config.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)] mt-0.5">
                              <Clock className="w-3 h-3" />
                              {format(formatDate(comment.createdAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {currentUserProfile && ['manager', 'admin', 'super_admin'].includes(currentUserProfile.role) && (
                            <button
                              onClick={() => setReplyingToId(replyingToId === comment.id ? null : comment.id)}
                              className="text-xs text-[var(--accent-primary)] hover:underline"
                            >
                              Responder
                            </button>
                          )}
                          {canDelete(comment) && (
                            <button
                              onClick={() => handleDelete(comment.id)}
                              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--status-cancelled-text)] hover:bg-[var(--status-cancelled-bg)] rounded-lg transition-colors"
                              title="Excluir comentário"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="prose prose-sm max-w-none text-[var(--text-primary)] text-sm">
                        <ReactMarkdown>{comment.content}</ReactMarkdown>
                      </div>
                    </motion.div>

                    {/* Reply Form */}
                    {replyingToId === comment.id && (
                      <form onSubmit={(e) => handleSubmit(e, comment.id)} className="ml-8 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-3 shadow-sm space-y-2">
                        <textarea
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="Escreva sua resposta..."
                          className="w-full min-h-[60px] p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-primary)] resize-none text-sm"
                          disabled={submitting}
                        />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setReplyingToId(null)} className="px-3 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancelar</button>
                          <button type="submit" disabled={submitting} className="px-3 py-1 bg-[var(--accent-primary)] text-white rounded-lg text-xs font-medium">Responder</button>
                        </div>
                      </form>
                    )}

                    {/* Replies */}
                    {replies.map(reply => (
                      <div key={reply.id} className="ml-8 bg-[var(--bg-secondary)]/50 rounded-xl border border-[var(--border-color)] p-3 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-[var(--text-primary)]">{reply.authorName}</span>
                          <span className="text-[10px] text-[var(--text-secondary)]">
                            {format(formatDate(reply.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <div className="prose prose-sm max-w-none text-[var(--text-primary)] text-xs">
                          <ReactMarkdown>{reply.content}</ReactMarkdown>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};
