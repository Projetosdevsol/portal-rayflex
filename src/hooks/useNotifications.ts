import { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  updateDoc, 
  deleteDoc, 
  doc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, formatDate } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Notification } from '../types';

export const useNotifications = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !profile || authLoading) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      // Sort in memory to avoid index issues and ensure consistency
      setNotifications(data.sort((a, b) => {
        const dateA = formatDate(a.createdAt).getTime();
        const dateB = formatDate(b.createdAt).getTime();
        return dateB - dateA;
      }));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'notifications');
      setLoading(false);
    });

    return unsubscribe;
  }, [user, profile, authLoading]);

  const markAsRead = async (id: string) => {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    await Promise.all(unread.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true })));
  };

  return {
    notifications,
    unreadCount: notifications.filter(n => !n.read).length,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification
  };
};
