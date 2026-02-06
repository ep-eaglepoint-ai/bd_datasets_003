<?php

namespace App\Http\Controllers;

use App\Models\Post;
use App\Models\Comment;
use Illuminate\Http\Request;
use App\Http\Resources\CommentResource;

class CommentController extends Controller
{
    public function index($postId)
    {
        $post = Post::find($postId);

        if (!$post) {
            return response()->json(['message' => 'Post not found'], 404);
        }

        $comments = $post->comments()->get();

        return CommentResource::collection($comments);
    }

    public function store(Request $request, $postId)
    {
        $post = Post::find($postId);

        if (!$post) {
            return response()->json(['message' => 'Post not found'], 404);
        }

        $validated = $request->validate([
            'body' => 'required|string',
        ]);

        $comment = $post->comments()->create([
            'body' => $validated['body'],
            'user_id' => auth()->id(),
        ]);

        return new CommentResource($comment);
    }
}
