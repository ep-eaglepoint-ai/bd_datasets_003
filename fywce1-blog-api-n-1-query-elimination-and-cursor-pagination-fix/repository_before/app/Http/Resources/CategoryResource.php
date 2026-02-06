<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class CategoryResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'parent' => $this->parent ? [
                'id' => $this->parent->id,
                'name' => $this->parent->name,
            ] : null,
            'children' => $this->children->map(function ($child) {
                return [
                    'id' => $child->id,
                    'name' => $child->name,
                ];
            }),
            'post_count' => $this->posts->count(),
        ];
    }
}
