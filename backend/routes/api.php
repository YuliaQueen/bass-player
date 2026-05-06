<?php

use App\Http\Controllers\TabController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/health', [TabController::class, 'health']);

// CRUD .gp файлов. Auth добавим в фазе multi-user (Sanctum SPA).
Route::get('/tabs', [TabController::class, 'index']);
Route::post('/tabs', [TabController::class, 'store']);
Route::delete('/tabs/{name}', [TabController::class, 'destroy'])
    ->where('name', '.+');

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');
