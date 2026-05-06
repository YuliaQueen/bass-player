/**
 * Минималистичные toast-уведомления в правом верхнем углу.
 * Заменяют браузерный alert() — он блокирующий и уродский.
 */

const HOST_ID = 'toast-host';
const SHOW_MS = 3000;
const FADE_MS = 250;

export type ToastKind = 'info' | 'success' | 'error';

interface ToastOptions {
    title: string;
    body?: string;
    kind?: ToastKind;
    /** Длительность показа в мс. По умолчанию 3 секунды. */
    durationMs?: number;
}

const ensureHost = (): HTMLElement => {
    let host = document.getElementById(HOST_ID);
    if (!host) {
        host = document.createElement('div');
        host.id = HOST_ID;
        host.className = 'toast-host';
        host.setAttribute('aria-live', 'polite');
        document.body.appendChild(host);
    }
    return host;
};

export const toast = ({ title, body, kind = 'info', durationMs = SHOW_MS }: ToastOptions): void => {
    const host = ensureHost();
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;

    const titleEl = document.createElement('strong');
    titleEl.textContent = title;
    el.append(titleEl);

    if (body) {
        const bodyEl = document.createElement('span');
        bodyEl.textContent = body;
        el.append(bodyEl);
    }

    host.append(el);

    setTimeout(() => el.classList.add('hide'), durationMs);
    setTimeout(() => el.remove(), durationMs + FADE_MS);
};

// Удобные шорткаты
export const toastError = (title: string, body?: string) => toast({ title, body, kind: 'error' });
export const toastInfo = (title: string, body?: string) => toast({ title, body, kind: 'info' });
