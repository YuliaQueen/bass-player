import { listTabs, uploadTab, deleteTab, type TabFile } from './api.ts';
import { toast, toastError } from './toast.ts';

const ALLOWED_EXT = /\.(gp|gp3|gp4|gp5|gpx|gp7|gp8|xml|musicxml|mxl)$/i;

export const stripExt = (name: string): string => name.replace(/\.[^./]+$/, '');

export interface LibraryHandle {
    refresh(): Promise<void>;
    getTabs(): TabFile[];
    setActive(name: string): void;
}

export interface InitLibraryOptions {
    listEl: HTMLElement;
    uploadBtn: HTMLElement;
    fileInput: HTMLInputElement;
    dropOverlay: HTMLElement;
    onSelect: (name: string) => void;
}

/**
 * Инициализирует UI-сайдбар: список файлов, drag&drop загрузку, кнопку удаления.
 */
export const initLibrary = async ({
    listEl,
    uploadBtn,
    fileInput,
    dropOverlay,
    onSelect,
}: InitLibraryOptions): Promise<LibraryHandle> => {
    let tabs: TabFile[] = [];
    let activeName: string | null = null;

    const render = (): void => {
        listEl.innerHTML = '';
        if (tabs.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'files-empty';
            empty.textContent = 'Пусто. Перетащи .gp файл сюда.';
            listEl.append(empty);
            return;
        }
        for (const tab of tabs) {
            const li = document.createElement('li');
            li.className = tab.name === activeName ? 'file active' : 'file';
            li.title = tab.name;

            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = stripExt(tab.name);

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'file-del';
            del.textContent = '✕';
            del.title = 'Удалить';
            del.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                if (!confirm(`Удалить «${stripExt(tab.name)}»?`)) return;
                try {
                    const res = await deleteTab(tab.name);
                    tabs = res.tabs;
                    toast({ title: 'Файл удалён', body: stripExt(tab.name) });
                    // Если удалили активный — открываем первый из оставшихся
                    if (tab.name === activeName) {
                        activeName = null;
                        const first = tabs[0];
                        if (first) onSelect(first.name);
                    }
                    render();
                } catch (err) {
                    toastError('Не удалось удалить', (err as Error).message);
                }
            });

            li.append(name, del);
            li.addEventListener('click', () => onSelect(tab.name));
            listEl.append(li);
        }
    };

    const refresh = async (): Promise<void> => {
        tabs = await listTabs();
        render();
    };

    const handleFiles = async (files: FileList | File[]): Promise<string | null> => {
        const valid = [...files].filter((f) => ALLOWED_EXT.test(f.name));
        if (valid.length === 0) {
            toastError('Неверный формат', 'Поддерживаются .gp/.gp3-8/.gpx и MusicXML (.xml/.musicxml/.mxl)');
            return null;
        }

        let lastUploaded: string | null = null;
        for (const file of valid) {
            try {
                const res = await uploadTab(file);
                tabs = res.tabs;
                lastUploaded = res.uploaded;
                toast({ title: 'Файл загружен', body: stripExt(res.uploaded) });
            } catch (err) {
                toastError(`Не загрузить «${file.name}»`, (err as Error).message);
            }
        }
        render();
        return lastUploaded;
    };

    // --- кнопка «+ Загрузить» ---
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        if (!fileInput.files) return;
        const uploaded = await handleFiles(fileInput.files);
        fileInput.value = '';
        if (uploaded) onSelect(uploaded);
    });

    // --- drag & drop на всё окно ---
    let dragDepth = 0;
    document.addEventListener('dragenter', (ev) => {
        if (!ev.dataTransfer?.types?.includes('Files')) return;
        dragDepth += 1;
        dropOverlay.hidden = false;
    });
    document.addEventListener('dragleave', () => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) dropOverlay.hidden = true;
    });
    document.addEventListener('dragover', (ev) => {
        if (ev.dataTransfer?.types?.includes('Files')) ev.preventDefault();
    });
    document.addEventListener('drop', async (ev) => {
        if (!ev.dataTransfer?.files?.length) return;
        ev.preventDefault();
        dragDepth = 0;
        dropOverlay.hidden = true;
        const uploaded = await handleFiles(ev.dataTransfer.files);
        if (uploaded) onSelect(uploaded);
    });

    // Не дёргаем refresh() здесь — может быть 401 (юзер ещё не залогинен).
    // main.ts вызовет refresh() после успешной авторизации.
    render();

    return {
        refresh,
        getTabs: () => tabs,
        setActive: (name: string) => {
            activeName = name;
            render();
        },
    };
};
