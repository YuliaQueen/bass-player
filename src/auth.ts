/**
 * Auth-модуль: SPA-cookie-based аутентификация с Laravel Sanctum.
 *
 * Workflow:
 *  1. Перед любым state-changing запросом: GET /sanctum/csrf-cookie → ставит XSRF-TOKEN
 *  2. Все fetch'и идут с credentials: 'include' — браузер отправляет cookies
 *  3. POST/PUT/DELETE дополнительно отправляют X-XSRF-TOKEN из cookie (CSRF-защита)
 */

export interface User {
    id: number;
    name: string;
    email: string;
}

export interface RegisterPayload {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
}

export interface LoginPayload {
    email: string;
    password: string;
}

interface ErrorBody {
    error?: string;
    message?: string;
    errors?: Record<string, string[]>;
}

/**
 * Достаёт XSRF-TOKEN из document.cookie. Sanctum ставит его как обычный cookie
 * (не httpOnly), чтобы JS мог его прочитать и отправить обратно в заголовке.
 */
const getXsrfToken = (): string | null => {
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return match && match[1] ? decodeURIComponent(match[1]) : null;
};

/** Ленивая инициализация CSRF — дёргаем только если ещё не инициализировано. */
let csrfReady = false;
const ensureCsrf = async (): Promise<void> => {
    if (csrfReady) return;
    await fetch('/sanctum/csrf-cookie', { credentials: 'include' });
    csrfReady = true;
};

/**
 * Универсальный обработчик ответа auth-эндпоинтов: достаёт сообщение об ошибке
 * из всех возможных форматов Laravel (errors / message / error).
 */
const handleAuthResponse = async <T>(response: Response): Promise<T> => {
    if (response.ok) {
        return (await response.json()) as T;
    }

    const body = (await response.json().catch(() => ({}))) as ErrorBody;

    // Validation errors из Laravel: { errors: { email: [...], password: [...] } }
    if (body.errors) {
        const firstField = Object.keys(body.errors)[0];
        const messages = firstField ? body.errors[firstField] : undefined;
        if (messages && messages[0]) throw new Error(messages[0]);
    }
    throw new Error(body.error || body.message || `HTTP ${response.status}`);
};

const authFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    await ensureCsrf();
    const xsrf = getXsrfToken();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (xsrf) headers.set('X-XSRF-TOKEN', xsrf);
    return fetch(url, { ...init, credentials: 'include', headers });
};

export const register = async (payload: RegisterPayload): Promise<User> => {
    const response = await authFetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleAuthResponse<User>(response);
};

export const login = async (payload: LoginPayload): Promise<User> => {
    const response = await authFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleAuthResponse<User>(response);
};

export const logout = async (): Promise<void> => {
    const response = await authFetch('/api/logout', { method: 'POST' });
    if (!response.ok) throw new Error(`Logout failed: HTTP ${response.status}`);
};

/**
 * Возвращает текущего пользователя или null если не залогинен (401).
 * Не бросает исключение на 401 — это нормальный кейс «гость».
 */
export const me = async (): Promise<User | null> => {
    const response = await authFetch('/api/me');
    if (response.status === 401) return null;
    return handleAuthResponse<User>(response);
};
