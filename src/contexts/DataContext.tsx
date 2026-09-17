import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

interface DataContextType {
  collaborators: any[];
  machines: any[];
  servers: any[];
  printers: any[];
  ups: any[];
  licenses: any[];
  units: any[];
  loading: boolean;
  getReferencedData: (refName: string) => any[];
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [servers, setServers] = useState<any[]>([]);
  const [printers, setPrinters] = useState<any[]>([]);
  const [ups, setUps] = useState<any[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) {
      setLoading(false);
      return;
    }

    const collections = [
      { name: 'collaborators', setter: setCollaborators },
      { name: 'machines', setter: setMachines },
      { name: 'servers', setter: setServers },
      { name: 'printers', setter: setPrinters },
      { name: 'ups', setter: setUps },
      { name: 'licenses', setter: setLicenses },
      { name: 'units', setter: setUnits },
    ];

    const unsubscribes = collections.map(col => {
      return onSnapshot(collection(db, col.name), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        col.setter(data);
      }, (error) => {
        console.error(`Error fetching ${col.name}:`, error);
      });
    });

    setLoading(false);

    return () => unsubscribes.forEach(unsub => unsub());
  }, [user, authLoading]);

  const getReferencedData = (refName: string) => {
    switch (refName) {
      case 'collaborator':
      case 'collaborators':
        return collaborators;
      case 'machine':
      case 'machines':
        return machines;
      case 'server':
      case 'servers':
        return servers;
      case 'printer':
      case 'printers':
        return printers;
      case 'ups':
      case 'nobreak':
      case 'nobreaks':
        return ups;
      case 'license':
      case 'licenses':
        return licenses;
      case 'unit':
      case 'units':
        return units;
      default:
        return [];
    }
  };

  return (
    <DataContext.Provider value={{ 
      collaborators,
      machines,
      servers,
      printers,
      ups,
      licenses,
      units,
      loading,
      getReferencedData
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
