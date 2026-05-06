<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTabRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class TabController extends Controller
{
    private const ALLOWED_EXT = ['gp', 'gp3', 'gp4', 'gp5', 'gpx', 'gp7', 'gp8', 'xml', 'musicxml', 'mxl'];

    private const DISK = 'tabs';

    /**
     * GET /api/tabs — список загруженных файлов.
     */
    public function index(): JsonResponse
    {
        $disk = Storage::disk(self::DISK);
        $files = collect($disk->files())
            ->filter(fn (string $name) => $this->hasAllowedExtension($name))
            ->map(fn (string $name) => [
                'name' => $name,
                'size' => $disk->size($name),
                'mtime' => date(DATE_ATOM, $disk->lastModified($name)),
            ])
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values()
            ->all();

        return response()->json($files);
    }

    /**
     * POST /api/tabs — загрузка нового файла.
     */
    public function store(StoreTabRequest $request): JsonResponse
    {
        $upload = $request->file('file');

        // Защита от path traversal: используем только basename оригинального имени
        $safeName = basename($upload->getClientOriginalName());

        Storage::disk(self::DISK)->putFileAs('', $upload, $safeName);

        return response()->json([
            'uploaded' => $safeName,
            'tabs' => $this->index()->getData(true),
        ]);
    }

    /**
     * DELETE /api/tabs/{name} — удаление файла.
     */
    public function destroy(string $name): JsonResponse
    {
        $safeName = basename($name);

        if (! $this->hasAllowedExtension($safeName)) {
            return response()->json(['error' => 'Недопустимое имя файла'], 400);
        }

        $disk = Storage::disk(self::DISK);

        if (! $disk->exists($safeName)) {
            return response()->json(['error' => 'Файл не найден'], 404);
        }

        $disk->delete($safeName);

        return response()->json([
            'deleted' => $safeName,
            'tabs' => $this->index()->getData(true),
        ]);
    }

    /**
     * GET /tabs/{name} — отдача .gp файла на скачивание/чтение.
     */
    public function show(string $name): BinaryFileResponse|JsonResponse
    {
        $safeName = basename($name);
        $disk = Storage::disk(self::DISK);

        if (! $disk->exists($safeName)) {
            return response()->json(['error' => 'Файл не найден', 'name' => $safeName], 404);
        }

        return response()->file($disk->path($safeName));
    }

    /**
     * GET /api/health — health-check.
     */
    public function health(): JsonResponse
    {
        return response()->json(['ok' => true]);
    }

    private function hasAllowedExtension(string $name): bool
    {
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));

        return in_array($ext, self::ALLOWED_EXT, true);
    }
}
