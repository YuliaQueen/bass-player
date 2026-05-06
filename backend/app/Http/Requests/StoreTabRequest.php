<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreTabRequest extends FormRequest
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
            'file' => [
                'required',
                'file',
                'max:10240', // 10 MB в КБ
                // Расширения проверяем по имени; mime для Guitar Pro нестандартный
                'extensions:gp,gp3,gp4,gp5,gpx,gp7,gp8',
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'file.required' => 'Файл не получен',
            'file.file' => 'Загружаемый объект не файл',
            'file.max' => 'Файл больше 10 МБ',
            'file.extensions' => 'Поддерживаются только .gp/.gp3/.gp4/.gp5/.gpx/.gp7/.gp8',
        ];
    }
}
