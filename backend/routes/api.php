<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\TabController;
use Illuminate\Support\Facades\Route;

// Публичные эндпоинты
Route::get('/health', [TabController::class, 'health']);

// Auth: нужны session+CSRF (для cookie-выдачи), поэтому через web-стек
Route::middleware('web')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

// Logout требует и session (web), и аутентификацию через Sanctum SPA-cookie
Route::middleware(['web', 'auth:sanctum'])->group(function (): void {
    Route::post('/logout', [AuthController::class, 'logout']);
});

// Остальное защищённое: только auth:sanctum (session им не нужна)
Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/me', [AuthController::class, 'me']);

    // CRUD .gp файлов — single-user сейчас, в фазе 13 переедет на per-user
    Route::get('/tabs', [TabController::class, 'index']);
    Route::post('/tabs', [TabController::class, 'store']);
    Route::delete('/tabs/{name}', [TabController::class, 'destroy'])->where('name', '.+');
});

// Заглушка для именованного маршрута 'login' — Auth\Authenticate middleware
// при unauth-запросах с Accept: text/html пытается сделать redirect()->route('login').
// Своего фронт-логина в backend нет (он на Vite-фронте), отвечаем JSON 401.
Route::get('/login', fn () => response()->json(['error' => 'Требуется авторизация'], 401))
    ->name('login');
