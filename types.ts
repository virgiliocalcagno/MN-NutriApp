
export type View = 'welcome' | 'home' | 'fitness' | 'progress' | 'profile' | 'shopping';

export interface Exercise {
  id: string;
  name: string;
  reps: string;
  level: 'Principiante' | 'Intermedio' | 'Avanzado';
  image: string;
  completed: boolean;
}

export interface PantryItem {
  id: string;
  name: string;
  status: 'STOCK BAJO' | 'DISPONIBLE' | 'CRÍTICO';
  percentage: number;
  color: string;
  icon: string;
}

export interface Meal {
  id: string;
  name: string;
  time: string;
  description: string;
  kcal: number;
  completed: boolean;
  icon: string;
}
