import { listTabs, uploadTab, deleteTab } from './api.js';

const ALLOWED_EXT = /\.(gp|gp3|gp4|gp5|gpx|gp7|gp8)$/i;

export const stripExt = (name) => name.replace(/\.[^./]+$/, '');

/**
 * Инициализирует UI-сайдбар: список файлов, drag&drop загрузку, кнопку удаления.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.listEl       — UL для списка
 * @param {HTMLElement} opts.uploadBtn    — кнопка «+ Загрузить»
 * @param {HTMLElement} opts.fileInput    — скрытый input[type=file]
 * @param {HTMLElement} opts.dropOverlay  — оверлей drop-зоны
 * @param {(name: string) => void} opts.onSelect — колбэк при выборе файла
 */
export const initLibrary = async ({ listEl, uploadBtn, fileInput, dropOverlay, onSelect }) => {
    let tabs = [];
    let activeName = null;

    const render = () => {
        listEl.innerHTML = '';
        if (tabs.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'tabs-empty';
            empty.textContent = 'Пусто. Перетащи .gp файл сюда.';
            listEl.append(empty);
            return;
        }
        for (const tab of tabs) {
            const li = document.createElement('li');
            li.className = tab.name === activeName ? 'tab active' : 'tab';
            li.title = tab.name;

            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = stripExt(tab.name);

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'tab-del';
            del.textContent = '✕';
            del.title = 'Удалить';
            del.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                if (!confirm(`Удалить «${stripExt(tab.name)}»?`)) return;
                try {
                    const res = await deleteTab(tab.name);
                    tabs = res.tabs;
                    // Если удалили активный — открываем первый из оставшихся
                    if (tab.name === activeName) {
                        activeName = null;
                        if (tabs.length > 0) onSelect(tabs[0].name);
                    }
                    render();
                } catch (err) {
                    alert(`Не удалось удалить: ${err.message}`);
                }
            });

            li.append(name, del);
            li.addEventListener('click', () => onSelect(tab.name));
            listEl.append(li);
        }
    };

    const refresh = async () => {
        tabs = await listTabs();
        render();
    };

    const handleFiles = async (files) => {
        const valid = [...files].filter((f) => ALLOWED_EXT.test(f.name));
        if (valid.length === 0) return null;

        let lastUploaded = null;
        for (const file of valid) {
            try {
                const res = await uploadTab(file);
                tabs = res.tabs;
                lastUploaded = res.uploaded;
            } catch (err) {
                alert(`Не удалось загрузить «${file.name}»: ${err.message}`);
            }
        }
        render();
        return lastUploaded;
    };

    // --- кнопка «+ Загрузить» ---
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
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

    await refresh();

    return {
        refresh,
        getTabs: () => tabs,
        setActive: (name) => {
            activeName = name;
            render();
        },
    };
};
