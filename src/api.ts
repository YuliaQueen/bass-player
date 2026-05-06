/**
 * Тонкие обёртки над fetch для бэкенд-API. Все запросы идут с credentials
 * (Sanctum SPA-cookie) и X-XSRF-TOKEN для state-changing методов.
 */

export interface TabFile {
    name: string;
    size: number;
    mtime: string;
}

export interface UploadResponse {
    uploaded: string;
    tabs: TabFile[];
}

export interface DeleteResponse {
    deleted: string;
    tabs: TabFile[];
}

interface ErrorBody {
    error?: string;
    message?: string;
    errors?: Record<string, string[]>;
}

/** Глобальный колбэк, дёргается на 401 — выкидывает в login (см. main.ts) */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (cb: () => void): void => {
    onUnauthorized = cb;
};

const getXsrfToken = (): string | null => {
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return match && match[1] ? decodeURIComponent(match[1]) : null;
};

const handle = async <T>(response: Response): Promise<T> => {
    if (response.status === 401) {
        onUnauthorized?.();
        throw new Error('Требуется авторизация');
    }
    if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ErrorBody;
        if (body.errors) {
            const firstField = Object.keys(body.errors)[0];
            const messages = firstField ? body.errors[firstField] : undefined;
            if (messages && messages[0]) throw new Error(messages[0]);
        }
        throw new Error(body.error || body.message || `HTTP ${response.status}`);
    }
    return (await response.json()) as T;
};

const authedFetch = (url: string, init: RequestInit = {}): Promise<Response> => {
    const xsrf = getXsrfToken();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (xsrf && init.method && init.method !== 'GET') {
        headers.set('X-XSRF-TOKEN', xsrf);
    }
    return fetch(url, { ...init, credentials: 'include', headers });
};

export const listTabs = (): Promise<TabFile[]> => authedFetch('/api/tabs').then(handle<TabFile[]>);

export const uploadTab = (file: File | Blob): Promise<UploadResponse> => {
    const form = new FormData();
    form.append('file', file);
    return authedFetch('/api/tabs', { method: 'POST', body: form }).then(handle<UploadResponse>);
};

export const deleteTab = (name: string): Promise<DeleteResponse> =>
    authedFetch(`/api/tabs/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(handle<DeleteResponse>);
