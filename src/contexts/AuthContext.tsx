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

/**
 * Super-admin identities kept in sync with firestore.rules and the API
 * (`functions/src/api/auth.ts`). The profile document is the normal source of
 * truth; these identities ensure a legitimate super admin is never locked out
 * by a missing or stale profile.
 */
const SUPER_ADMIN_UID = 'ocH5vnmyMbWElrB2G0xmnlmXzgs1';
const SUPER_ADMIN_EMAILS = [
  'suporte@rayflex.com.br',
  'suporte@solution-sp.com.br',
];
const SUPER_ADMIN_VERIFIED_EMAIL = 'projetossolutiondev@gmail.com';

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
  const [tokenRole, setTokenRole] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          setUser(firebaseUser);

          // Custom claims are the same source used by firestore.rules and the
          // API, so a super_admin claim works even without a profile document.
          let claimRole = '';
          try {
            const tokenResult = await firebaseUser.getIdTokenResult();
            const claims = tokenResult.claims as Record<string, unknown>;
            claimRole =
              claims.super_admin === true
                ? 'super_admin'
                : typeof claims.role === 'string'
                  ? claims.role
                  : '';
          } catch (claimError) {
            console.error('Failed to read custom claims:', claimError);
          }
          setTokenRole(claimRole);

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
              role:
                claimRole === 'super_admin' ||
                firebaseUser.uid === SUPER_ADMIN_UID ||
                (!!firebaseUser.email &&
                  SUPER_ADMIN_EMAILS.includes(firebaseUser.email)) ||
                (firebaseUser.email === SUPER_ADMIN_VERIFIED_EMAIL &&
                  firebaseUser.emailVerified)
                  ? 'super_admin'
                  : 'viewer',
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
        setTokenRole('');
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

  const isSuperAdmin =
    profile?.role === 'super_admin' ||
    tokenRole === 'super_admin' ||
    user?.uid === SUPER_ADMIN_UID ||
    (!!user?.email && SUPER_ADMIN_EMAILS.includes(user.email)) ||
    (user?.email === SUPER_ADMIN_VERIFIED_EMAIL && user?.emailVerified === true);
  const isAdmin = profile?.role === 'admin' || tokenRole === 'admin';
  const isManager = profile?.role === 'manager' || tokenRole === 'manager';
  const isEditor = profile?.role === 'editor' || tokenRole === 'editor';
  const isViewer = profile?.role === 'viewer' || tokenRole === 'viewer';
  
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
