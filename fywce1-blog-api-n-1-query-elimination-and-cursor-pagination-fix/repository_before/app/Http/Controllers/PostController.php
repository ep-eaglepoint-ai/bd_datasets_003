<?php

namespace App\Http\Controllers;

use App\Models\Post;
use App\Models\Tag;
use Illuminate\Http\Request;
use App\Http\Resources\PostResource;

class PostController extends Controller
{
    public function index(Request $request)
    {
        $posts = Post::all();

        if ($request->has('tag')) {
            $tag = Tag::where('slug', $request->tag)->first();
            $posts = $tag->posts;
        }

        if ($request->has('category')) {
            $posts = Post::where('category_id', $request->category)->get();
        }

        if ($request->has('search')) {
            $posts = Post::where('title', 'LIKE', '%' . $request->search . '%')->get();
        }

        return PostResource::collection($posts);
    }

    public function show($id)
    {
        $post = Post::find($id);

        if (!$post) {
            return response()->json(['message' => 'Post not found'], 404);
        }

        return new PostResource($post);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'body' => 'required|string',
            'slug' => 'required|string|unique:posts',
            'category_id' => 'required|exists:categories,id',
            'tags' => 'array',
            'tags.*' => 'exists:tags,id',
        ]);

        $post = Post::create([
            'title' => $validated['title'],
            'body' => $validated['body'],
            'slug' => $validated['slug'],
            'user_id' => auth()->id(),
            'category_id' => $validated['category_id'],
            'published_at' => now(),
        ]);

        if (isset($validated['tags'])) {
            $post->tags()->attach($validated['tags']);
        }

        return new PostResource($post);
    }
}
