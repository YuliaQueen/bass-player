/**
 * Тонкие обёртки над fetch для бэкенд-API.
 */

const handle = async (response) => {
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
    }
    return response.json();
};

export const listTabs = () => fetch('/api/tabs').then(handle);

export const uploadTab = (file) => {
    const form = new FormData();
    form.append('file', file);
    return fetch('/api/tabs', { method: 'POST', body: form }).then(handle);
};

export const deleteTab = (name) =>
    fetch(`/api/tabs/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(handle);
