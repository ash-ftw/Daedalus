import { CheckCircle2, MessageSquare, X } from "lucide-react";
import type { BoardComment } from "../../../shared/src/types";

interface CommentsPanelProps {
  comments: BoardComment[];
  open: boolean;
  placing: boolean;
  onClose: () => void;
  onResolve: (commentId: string) => void;
  onStartPlacing: () => void;
}

export function CommentsPanel({ comments, open, placing, onClose, onResolve, onStartPlacing }: CommentsPanelProps) {
  if (!open) {
    return null;
  }

  const unresolved = comments.filter((comment) => !comment.resolved);
  const resolved = comments.filter((comment) => comment.resolved);

  return (
    <aside className="floating-drawer right" aria-label="Board comments">
      <div className="floating-drawer-header">
        <div>
          <span className="panel-kicker">Comments</span>
          <h2>{unresolved.length} Open</h2>
        </div>
        <button className="icon-button" onClick={onClose} title="Close comments" type="button">
          <X size={18} />
        </button>
      </div>
      <div className="drawer-actions">
        <button className={placing ? "wide-button active" : "wide-button"} onClick={onStartPlacing} type="button">
          <MessageSquare size={16} />
          {placing ? "Click canvas" : "Add comment"}
        </button>
      </div>
      <div className="drawer-list">
        {[...unresolved, ...resolved].map((comment) => (
          <article className={comment.resolved ? "comment-row resolved" : "comment-row"} key={comment.id}>
            <div>
              <strong>{comment.authorName}</strong>
              <p>{comment.body}</p>
              <span>{new Date(comment.createdAt).toLocaleTimeString()}</span>
            </div>
            {!comment.resolved ? (
              <button className="icon-button" onClick={() => onResolve(comment.id)} title="Resolve comment" type="button">
                <CheckCircle2 size={16} />
              </button>
            ) : null}
          </article>
        ))}
        {comments.length === 0 ? (
          <div className="empty-state compact">
            <p>No comments yet.</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
