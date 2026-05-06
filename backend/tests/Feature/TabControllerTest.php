<?php

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    Storage::fake('tabs');
});

// ===== /api/health =====

it('GET /api/health отдаёт ok=true', function () {
    $this->getJson('/api/health')
        ->assertOk()
        ->assertExactJson(['ok' => true]);
});

// ===== GET /api/tabs =====

it('GET /api/tabs возвращает пустой массив для пустой папки', function () {
    $this->getJson('/api/tabs')
        ->assertOk()
        ->assertExactJson([]);
});

it('возвращает только файлы с разрешёнными расширениями', function () {
    Storage::disk('tabs')->put('song.gp', 'data');
    Storage::disk('tabs')->put('note.txt', 'irrelevant');
    Storage::disk('tabs')->put('other.gpx', 'data');

    $names = collect($this->getJson('/api/tabs')->json())->pluck('name')->sort()->values();
    expect($names->all())->toBe(['other.gpx', 'song.gp']);
});

it('сортирует по имени', function () {
    Storage::disk('tabs')->put('Альфа.gp', '');
    Storage::disk('tabs')->put('Браво.gp', '');
    Storage::disk('tabs')->put('Яндекс.gp', '');

    $names = collect($this->getJson('/api/tabs')->json())->pluck('name')->all();
    expect($names)->toBe(['Альфа.gp', 'Браво.gp', 'Яндекс.gp']);
});

// ===== POST /api/tabs =====

// Хелпер: POST с правильным Accept-хедером, иначе валидация редиректит вместо 422
$jsonPost = fn (array $data) => test()
    ->withHeaders(['Accept' => 'application/json'])
    ->post('/api/tabs', $data);

it('сохраняет валидный .gp файл', function () use ($jsonPost) {
    $file = UploadedFile::fake()->createWithContent('song.gp', 'fake gp content');

    $jsonPost(['file' => $file])
        ->assertOk()
        ->assertJsonPath('uploaded', 'song.gp')
        ->assertJsonCount(1, 'tabs');

    Storage::disk('tabs')->assertExists('song.gp');
    expect(Storage::disk('tabs')->get('song.gp'))->toBe('fake gp content');
});

it('отвергает файл с недопустимым расширением', function () use ($jsonPost) {
    $file = UploadedFile::fake()->createWithContent('malware.exe', 'virus');

    $jsonPost(['file' => $file])
        ->assertStatus(422)
        ->assertJsonPath('errors.file.0', 'Поддерживаются только .gp/.gp3/.gp4/.gp5/.gpx/.gp7/.gp8');

    expect(Storage::disk('tabs')->files())->toBe([]);
});

it('защищает от path traversal — берёт только basename', function () use ($jsonPost) {
    $file = UploadedFile::fake()->createWithContent('../../../etc/passwd.gp', 'hack');

    $jsonPost(['file' => $file])
        ->assertOk()
        ->assertJsonPath('uploaded', 'passwd.gp');
    Storage::disk('tabs')->assertExists('passwd.gp');
});

it('отвергает файлы больше 10 МБ', function () use ($jsonPost) {
    $file = UploadedFile::fake()->create('big.gp', 10241);

    $jsonPost(['file' => $file])
        ->assertStatus(422)
        ->assertJsonPath('errors.file.0', 'Файл больше 10 МБ');
});

it('отвечает 422 если файл вообще не приложен', function () use ($jsonPost) {
    $jsonPost([])
        ->assertStatus(422)
        ->assertJsonPath('errors.file.0', 'Файл не получен');
});

it('сохраняет имя с кириллицей корректно', function () use ($jsonPost) {
    $name = 'Кино-Спокойная.gp';
    $file = UploadedFile::fake()->createWithContent($name, 'x');

    $jsonPost(['file' => $file])
        ->assertOk()
        ->assertJsonPath('uploaded', $name);

    Storage::disk('tabs')->assertExists($name);
});

// ===== DELETE /api/tabs/{name} =====

it('удаляет существующий файл', function () {
    Storage::disk('tabs')->put('song.gp', '');

    $this->delete('/api/tabs/song.gp')
        ->assertOk()
        ->assertJsonPath('deleted', 'song.gp')
        ->assertJsonCount(0, 'tabs');

    Storage::disk('tabs')->assertMissing('song.gp');
});

it('возвращает 404 если файла нет', function () {
    $this->delete('/api/tabs/nonexistent.gp')
        ->assertStatus(404);
});

it('отвергает имя с недопустимым расширением', function () {
    $this->delete('/api/tabs/something.exe')
        ->assertStatus(400)
        ->assertJsonPath('error', 'Недопустимое имя файла');
});

it('защищает от path traversal в имени удаления', function () {
    Storage::disk('tabs')->put('real.gp', '');

    // basename('../../real.gp') === 'real.gp' — удалится файл из tabs/, не снаружи
    $this->delete('/api/tabs/'.rawurlencode('../../real.gp'))
        ->assertOk()
        ->assertJsonPath('deleted', 'real.gp');
});

// ===== GET /tabs/{name} =====

it('отдаёт содержимое файла', function () {
    Storage::disk('tabs')->put('song.gp', 'binary-content');

    $response = $this->get('/tabs/song.gp');
    $response->assertOk();
    expect($response->streamedContent())->toBe('binary-content');
});

it('возвращает 404 для несуществующего файла', function () {
    $this->get('/tabs/missing.gp')->assertStatus(404);
});
