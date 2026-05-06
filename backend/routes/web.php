<?php

use App\Http\Controllers\TabController;
use Illuminate\Support\Facades\Route;

// Корень — это API-сервис, не сайт. Отдаём JSON-баннер.
Route::get('/', fn () => response()->json([
    'service' => 'bass-tabs-player API',
    'docs' => '/api/health',
]));

// Отдача .gp файла — вне /api префикса, чтобы alphaTab грузил по короткому URL.
Route::get('/tabs/{name}', [TabController::class, 'show'])
    ->where('name', '.+');
