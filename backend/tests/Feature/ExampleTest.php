<?php

it('возвращает 200 на главной странице', function () {
    $response = $this->get('/');

    $response->assertStatus(200);
});
