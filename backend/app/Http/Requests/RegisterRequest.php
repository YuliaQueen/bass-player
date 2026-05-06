<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Укажи имя',
            'email.required' => 'Укажи email',
            'email.email' => 'Неверный формат email',
            'email.unique' => 'Этот email уже зарегистрирован',
            'password.required' => 'Укажи пароль',
            'password.confirmed' => 'Пароли не совпадают',
            'password.min' => 'Пароль не короче 8 символов',
        ];
    }
}
