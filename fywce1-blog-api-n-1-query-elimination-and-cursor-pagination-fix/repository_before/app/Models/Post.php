<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Post extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = ['title', 'body', 'slug', 'user_id', 'category_id', 'published_at'];

    protected $appends = ['read_time'];

    public function author()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function comments()
    {
        return $this->hasMany(Comment::class);
    }

    public function tags()
    {
        return $this->belongsToMany(Tag::class);
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function getReadTimeAttribute()
    {
        $wordCount = str_word_count($this->body);
        foreach ($this->comments as $comment) {
            $wordCount += str_word_count($comment->body);
        }
        return max(1, (int) ceil($wordCount / 200));
    }
}
