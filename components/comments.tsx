"use client";
import { useEffect, useState } from "react";
import { addCommentAction, deleteCommentAction, listCommentsAction } from "@/app/actions/social";
import type { DbComment } from "@/lib/db/types";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "./ui";

function friendly(error: string): string {
  if (error === "UNAUTHENTICATED") return "Sign in with your wallet to comment.";
  if (error === "PROFILE_REQUIRED") return "Finish your profile before commenting.";
  if (error === "DB_NOT_READY") return "Live database is not migrated yet. Run supabase/migrations/0001_init.sql.";
  if (error === "FORBIDDEN") return "You can only delete your own comments.";
  return "Couldn't save that comment. Try again.";
}

export function Comments({ postId, source, initialComments, initialCount }: {
  postId: string;
  source: "live" | "mock";
  initialComments: DbComment[];
  initialCount: number;
}) {
  const [comments, setComments] = useState<DbComment[]>(initialComments);
  const [count, setCount] = useState(initialCount);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (source !== "live") return;
    let live = true;
    void listCommentsAction(postId).then((r) => {
      if (live && r.ok) setComments(r.comments);
    });
    return () => { live = false; };
  }, [postId, source]);

  if (source !== "live") {
    return <div className="card p-4 text-sm muted">Mock sample posts keep their comment count only. Publish a live post to start a real thread.</div>;
  }

  const submit = async () => {
    const text = body.trim();
    if (!text || pending) return;
    setPending(true); setError("");
    try {
      const r = await addCommentAction(postId, text);
      if (!r.ok) { setError(friendly(r.error)); return; }
      setComments((c) => [...c, r.comment]);
      setCount(r.commentCount);
      setBody("");
    } finally { setPending(false); }
  };

  const remove = async (id: string) => {
    setError("");
    const r = await deleteCommentAction(id);
    if (!r.ok) { setError(friendly(r.error)); return; }
    setComments((c) => c.filter((x) => x.id !== id));
    setCount(r.commentCount);
  };

  return <div className="card p-4 sm:p-5 space-y-4">
    <div className="font-semibold text-sm">Comments · {count}</div>
    <div className="space-y-3">
      {comments.length === 0 && <p className="muted text-sm">No comments yet. Start the thread.</p>}
      {comments.map((c) => <div key={c.id} className="flex gap-3">
        <Avatar name={c.authorDisplayName} src={c.authorAvatarUrl} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-sm">{c.authorDisplayName}</span>
            <span className="muted text-xs">@{c.authorUsername} · {timeAgo(c.createdAt)}</span>
            {c.mine && <button onClick={() => void remove(c.id)} className="ml-auto text-xs muted hover:text-white">Delete</button>}
          </div>
          <p className="text-sm mt-1 whitespace-pre-line break-words">{c.body}</p>
        </div>
      </div>)}
    </div>
    <div className="flex gap-2">
      <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment…" maxLength={2000}
        className="flex-1 rounded-full bg-white/[.04] border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-teal-300/50 placeholder:text-[#6b7280]" />
      <button onClick={() => void submit()} disabled={!body.trim() || pending}
        className="rounded-full bg-white text-black px-5 text-sm font-medium disabled:opacity-50">
        {pending ? "Posting…" : "Post"}</button>
    </div>
    {error && <p className="text-sm text-red-400">{error}</p>}
  </div>;
}
