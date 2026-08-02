import { apiClient } from '../services/apiClient';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export type AuthState = 'loading' | 'signedOut' | 'signedIn';

type Listener = () => void;

class AuthStore {
  private static instance: AuthStore;
  public state: AuthState = 'loading';
  public user: User | null = null;
  public token: string | null = null;
  private listeners: Set<Listener> = new Set();

  private constructor() {
    this.init();
  }

  public static getInstance(): AuthStore {
    if (!AuthStore.instance) {
      AuthStore.instance = new AuthStore();
    }
    return AuthStore.instance;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private async init() {
    const savedToken = localStorage.getItem('syncbeats_jwt_token');
    const savedUser = localStorage.getItem('syncbeats_user');

    if (savedToken && savedUser) {
      try {
        this.token = savedToken;
        this.user = JSON.parse(savedUser);
        apiClient.setAuthToken(savedToken);
        this.state = 'signedIn';
      } catch (e) {
        this.signOut();
      }
    } else {
      this.state = 'signedOut';
    }
    this.notify();
  }

  public signIn(token: string, user: User) {
    this.token = token;
    this.user = user;
    this.state = 'signedIn';
    localStorage.setItem('syncbeats_jwt_token', token);
    localStorage.setItem('syncbeats_user', JSON.stringify(user));
    apiClient.setAuthToken(token);
    this.notify();
  }

  public signOut() {
    this.token = null;
    this.user = null;
    this.state = 'signedOut';
    localStorage.removeItem('syncbeats_jwt_token');
    localStorage.removeItem('syncbeats_user');
    apiClient.setAuthToken(null);
    this.notify();
  }
}

export const authStore = AuthStore.getInstance();
