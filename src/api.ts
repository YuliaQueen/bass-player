/**
 * Тонкие обёртки над fetch для бэкенд-API.
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
}

const handle = async <T>(response: Response): Promise<T> => {
    if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ErrorBody;
        throw new Error(data.error || `HTTP ${response.status}`);
    }
    return (await response.json()) as T;
};

export const listTabs = (): Promise<TabFile[]> => fetch('/api/tabs').then(handle<TabFile[]>);

export const uploadTab = (file: File | Blob): Promise<UploadResponse> => {
    const form = new FormData();
    form.append('file', file);
    return fetch('/api/tabs', { method: 'POST', body: form }).then(handle<UploadResponse>);
};

export const deleteTab = (name: string): Promise<DeleteResponse> =>
    fetch(`/api/tabs/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(handle<DeleteResponse>);
