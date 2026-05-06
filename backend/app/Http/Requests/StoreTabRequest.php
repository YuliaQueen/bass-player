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
                'max:25600', // 25 MB в КБ — MusicXML обычно крупнее .gp
                // Расширения проверяем по имени; mime для Guitar Pro / MusicXML нестандартный
                'extensions:gp,gp3,gp4,gp5,gpx,gp7,gp8,xml,musicxml,mxl',
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
            'file.max' => 'Файл больше 25 МБ',
            'file.extensions' => 'Поддерживаются только .gp/.gp3/.gp4/.gp5/.gpx/.gp7/.gp8 и MusicXML (.xml/.musicxml/.mxl)',
        ];
    }
}
