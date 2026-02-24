import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth, db, googleProvider, facebookProvider } from '../firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Store, initialStore } from '../types/store';

interface StoreContextType {
    user: User | null;
    store: Store;
    loading: boolean;
    saveStore: (newStore: Store) => Promise<void>;
    login: (method: 'google' | 'facebook') => Promise<void>;
    logout: () => Promise<void>;
    showScheduleModal: boolean;
    setShowScheduleModal: (show: boolean) => void;
    generateSchedule: (breakfastTime: string) => void;
    resetSchedule: () => void;
    showNotificationsModal: boolean;
    setShowNotificationsModal: (show: boolean) => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [store, setStore] = useState<Store>(initialStore);
    const [loading, setLoading] = useState(true);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [showNotificationsModal, setShowNotificationsModal] = useState(false);

    // Load from LocalStorage on mount (offline support)
    useEffect(() => {
        const local = localStorage.getItem('mn_pro_clinic_v6');
        if (local) {
            try {
                const parsed = JSON.parse(local);
                setStore(parsed);
            } catch (e) {
                console.error('Error parsing local storage', e);
            }
        }
    }, []);

    // Auth Listener & Firestore Sync
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                setLoading(true);
                const docRef = doc(db, 'users', currentUser.uid);

                // Real-time listener
                const unsubDoc = onSnapshot(docRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data() as Store;
                        // Carefully merge to preserve local changes if needed? 
                        // For now, cloud is truth, but we rely on local for perceived speed.
                        setStore(prev => ({ ...prev, ...data }));
                        localStorage.setItem('mn_pro_clinic_v6', JSON.stringify(data));
                    } else {
                        // If new user, save current local store to cloud
                        setDoc(docRef, store);
                    }
                    setLoading(false);
                }, (error) => {
                    console.error("Firestore sync error:", error);
                    setLoading(false);
                });

                return () => unsubDoc();
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    // Daily Reset Logic
    useEffect(() => {
        if (!loading) {
            const today = new Date().toISOString().split('T')[0];
            if (!store.lastUpdateDate || store.lastUpdateDate !== today) {
                console.log("Daily reset triggered or missing date initialized.");
                saveStore({
                    ...store,
                    calories: 0,
                    water: 0,
                    doneEx: {},
                    doneMeals: {},
                    lastUpdateDate: today
                });
            }
        }
    }, [loading, store.lastUpdateDate]);

    // Recursively remove undefined values (Firestore rejects them)
    const removeUndefined = (obj: any): any => {
        if (obj === null || obj === undefined) return null;
        if (Array.isArray(obj)) return obj.map(removeUndefined);
        if (typeof obj === 'object') {
            const clean: any = {};
            for (const [k, v] of Object.entries(obj)) {
                if (v !== undefined) clean[k] = removeUndefined(v);
            }
            return clean;
        }
        return obj;
    };

    const saveStore = async (newStore: Store) => {
        setStore(newStore);
        localStorage.setItem('mn_pro_clinic_v6', JSON.stringify(newStore));

        if (user) {
            try {
                const cleanData = removeUndefined(newStore);
                await setDoc(doc(db, 'users', user.uid), cleanData);
            } catch (e) {
                console.error("Error saving to cloud", e);
            }
        }
    };

    const login = async (method: 'google' | 'facebook') => {
        try {
            const provider = method === 'google' ? googleProvider : facebookProvider;
            await signInWithPopup(auth, provider);
        } catch (e: any) {
            console.error(e);
            alert("Error login: " + e.message);
        }
    };

    const logout = async () => {
        await signOut(auth);
        setStore(initialStore);
        localStorage.removeItem('mn_pro_clinic_v6');
    };

    const generateSchedule = (breakfastTime: string) => {
        const [hours, minutes] = breakfastTime.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, minutes, 0);

        const newSchedule: Record<string, string> = { ...store.schedule };
        const mealKeys = ["DESAYUNO", "MERIENDA_AM", "ALMUERZO", "MERIENDA_PM", "CENA"];

        // Get current menu for the selected day
        const todayName = new Date().toLocaleDateString('es-ES', { weekday: 'long' }).toUpperCase();
        const selectedDay = store.selectedDay || todayName;
        const normalizedSelected = selectedDay.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        const originalKey = Object.keys(store.menu).find(key =>
            key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() === normalizedSelected
        );
        const menuForDay = originalKey ? store.menu[originalKey] : {};
        const currentMenuKeys = Object.keys(menuForDay);

        mealKeys.forEach((standardKey, idx) => {
            const mealDate = new Date(date.getTime() + idx * 3 * 60 * 60 * 1000);
            const timeStr = mealDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });

            const matchingKey = currentMenuKeys.find(k => k.toUpperCase().replace(/\s+/g, '_') === standardKey);
            if (matchingKey) {
                newSchedule[matchingKey] = timeStr;
            }
        });

        saveStore({ ...store, schedule: newSchedule });
    };

    const resetSchedule = () => {
        saveStore({
            ...store,
            schedule: null
        });
    };

    return (
        <StoreContext.Provider value={{
            user, store, loading, saveStore, login, logout,
            showScheduleModal, setShowScheduleModal, generateSchedule, resetSchedule,
            showNotificationsModal, setShowNotificationsModal
        }}>
            {children}
        </StoreContext.Provider>
    );
};

export const useStore = () => {
    const context = useContext(StoreContext);
    if (!context) throw new Error("useStore must be used within StoreProvider");
    return context;
};
