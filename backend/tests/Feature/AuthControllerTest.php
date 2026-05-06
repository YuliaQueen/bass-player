<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

// ===== POST /api/register =====

it('регистрирует нового пользователя и сразу логинит', function () {
    $response = $this->postJson('/api/register', [
        'name' => 'Юля',
        'email' => 'julia@example.com',
        'password' => 'secret-pass',
        'password_confirmation' => 'secret-pass',
    ]);

    $response->assertStatus(201)
        ->assertJson(['name' => 'Юля', 'email' => 'julia@example.com'])
        ->assertJsonStructure(['id', 'name', 'email']);

    expect(User::where('email', 'julia@example.com')->exists())->toBeTrue();

    // После регистрации /api/me должен быть доступен (cookie установлена)
    $this->getJson('/api/me')
        ->assertOk()
        ->assertJsonPath('email', 'julia@example.com');
});

it('отвергает регистрацию с занятым email', function () {
    User::factory()->create(['email' => 'taken@example.com']);

    $this->postJson('/api/register', [
        'name' => 'Test',
        'email' => 'taken@example.com',
        'password' => 'secret-pass',
        'password_confirmation' => 'secret-pass',
    ])->assertStatus(422)
        ->assertJsonPath('errors.email.0', 'Этот email уже зарегистрирован');
});

it('требует подтверждения пароля', function () {
    $this->postJson('/api/register', [
        'name' => 'Test',
        'email' => 'a@b.c',
        'password' => 'secret-pass',
        'password_confirmation' => 'different',
    ])->assertStatus(422)
        ->assertJsonPath('errors.password.0', 'Пароли не совпадают');
});

it('требует пароль не короче 8 символов', function () {
    $this->postJson('/api/register', [
        'name' => 'Test',
        'email' => 'a@b.c',
        'password' => 'short',
        'password_confirmation' => 'short',
    ])->assertStatus(422)
        ->assertJsonPath('errors.password.0', 'Пароль не короче 8 символов');
});

// ===== POST /api/login =====

it('логинит существующего пользователя', function () {
    User::factory()->create([
        'email' => 'user@example.com',
        'password' => Hash::make('secret-pass'),
    ]);

    $this->postJson('/api/login', [
        'email' => 'user@example.com',
        'password' => 'secret-pass',
    ])->assertOk()
        ->assertJsonPath('email', 'user@example.com');

    $this->getJson('/api/me')->assertOk();
});

it('отвергает неверный пароль', function () {
    User::factory()->create([
        'email' => 'user@example.com',
        'password' => Hash::make('correct-pass'),
    ]);

    $this->postJson('/api/login', [
        'email' => 'user@example.com',
        'password' => 'wrong-pass',
    ])->assertStatus(422)
        ->assertJsonPath('errors.email.0', 'Неверный email или пароль');
});

it('отвергает несуществующий email', function () {
    $this->postJson('/api/login', [
        'email' => 'nobody@example.com',
        'password' => 'any-pass',
    ])->assertStatus(422)
        ->assertJsonPath('errors.email.0', 'Неверный email или пароль');
});

// ===== POST /api/logout =====

it('логаутит залогиненного пользователя', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson('/api/logout')
        ->assertOk()
        ->assertJson(['ok' => true]);
});

it('logout требует авторизации', function () {
    $this->postJson('/api/logout')->assertStatus(401);
});

// ===== GET /api/me =====

it('возвращает данные текущего пользователя', function () {
    $user = User::factory()->create([
        'name' => 'Юзер',
        'email' => 'me@example.com',
    ]);

    $this->actingAs($user)
        ->getJson('/api/me')
        ->assertOk()
        ->assertExactJson([
            'id' => $user->id,
            'name' => 'Юзер',
            'email' => 'me@example.com',
        ]);
});

it('me возвращает 401 без авторизации', function () {
    $this->getJson('/api/me')->assertStatus(401);
});

// ===== Защита /api/tabs middleware'ом =====

it('GET /api/tabs требует авторизации', function () {
    $this->getJson('/api/tabs')->assertStatus(401);
});

it('POST /api/tabs требует авторизации', function () {
    $this->postJson('/api/tabs', [])->assertStatus(401);
});

it('DELETE /api/tabs/{name} требует авторизации', function () {
    $this->deleteJson('/api/tabs/song.gp')->assertStatus(401);
});

it('GET /tabs/{name} требует авторизации', function () {
    // С Accept: application/json — Laravel возвращает 401, без него — 302 redirect
    $this->getJson('/tabs/song.gp')->assertStatus(401);
});
