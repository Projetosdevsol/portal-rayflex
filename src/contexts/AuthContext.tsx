import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signOut, 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp, Timestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, UserPreferences } from '../types';

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'light',
  fontSize: 'medium',
  notifications: {
    email: true,
    browser: true,
    system: true
  }
};

const getIPAddress = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error('Error fetching IP address:', error);
    return 'unknown';
  }
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isEditor: boolean;
  isViewer: boolean;
  canEdit: boolean;
  canDelete: boolean;
  hasPermission: (permission: string) => boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePreferences: (newPrefs: Partial<UserPreferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          setUser(firebaseUser);
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          const ipAddress = await getIPAddress();
          const loginEntry = {
            timestamp: Timestamp.now(),
            ipAddress
          };

          if (userDoc.exists()) {
            const existingProfile = userDoc.data() as UserProfile;
            setProfile(existingProfile);
            
            // Update login history
            try {
              await updateDoc(userDocRef, {
                loginHistory: arrayUnion(loginEntry)
              });
            } catch (updateError) {
              console.error('Failed to update login history:', updateError);
            }
          } else {
            // Create default profile for new users if not exists
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || '',
              role: (firebaseUser.email === 'projetossolutiondev@gmail.com' || firebaseUser.email === 'suporte@rayflex.com.br') ? 'super_admin' : 'viewer',
              loginHistory: [loginEntry]
            };
            try {
              await setDoc(userDocRef, newProfile);
              setProfile(newProfile);
            } catch (createError) {
              console.error('Failed to create user profile:', createError);
            }
          }
        } catch (error) {
          console.error('Failed to get user document:', error);
          // Don't throw handleFirestoreError here to avoid breaking the auth flow
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      // Clear all theme and font classes first from html element
      const root = document.documentElement;
      root.classList.remove('theme-light', 'theme-dark', 'font-small', 'font-medium', 'font-large', 'font-extra');
      
      const prefs = profile?.preferences || DEFAULT_PREFERENCES;
      const { theme, fontSize } = prefs;
      
      // Theme
      if (theme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.add(isDark ? 'theme-dark' : 'theme-light');
      } else {
        root.classList.add(`theme-${theme}`);
      }

      // Font Size
      root.classList.add(`font-${fontSize}`);
    };

    applyTheme();

    // Listen for system theme changes if set to system
    if (profile?.preferences?.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme();
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [profile?.preferences]);

  const login = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const updatePreferences = async (newPrefs: Partial<UserPreferences>) => {
    if (!user || !profile) return;
    const updatedPrefs = { 
      ...(profile.preferences || DEFAULT_PREFERENCES), 
      ...newPrefs 
    };
    const userDocRef = doc(db, 'users', user.uid);
    await updateDoc(userDocRef, { preferences: updatedPrefs });
    setProfile({ ...profile, preferences: updatedPrefs as UserPreferences });
  };

  const isSuperAdmin = profile?.role === 'super_admin' || 
    (user?.email === 'projetossolutiondev@gmail.com' && user?.emailVerified) ||
    (user?.email === 'suporte@rayflex.com.br');
  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const isEditor = profile?.role === 'editor';
  const isViewer = profile?.role === 'viewer';
  
  const hasPermission = (permission: string) => {
    return isSuperAdmin || (profile?.permissions?.includes(permission) ?? false);
  };
  
  const canEdit = isSuperAdmin || isAdmin || isEditor || hasPermission('can_edit');
  const canDelete = isSuperAdmin || isAdmin || hasPermission('can_delete');

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      isSuperAdmin, 
      isAdmin,
      isManager,
      isEditor, 
      isViewer,
      canEdit,
      canDelete,
      hasPermission,
      login, 
      logout,
      updatePreferences
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
