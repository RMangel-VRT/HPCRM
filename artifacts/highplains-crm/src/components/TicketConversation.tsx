import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Loader2, MessageSquare, Send } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MentionTextarea, renderMentionedText } from "@/components/MentionTextarea";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// The frontend schema's Drizzle stub resolves inferred comment types to any.
// Keep the wire shape explicit so parent IDs and mutation payloads are checked.
export interface ConversationComment {
  id: string;
  parentCommentId?: string | null;
  authorName: string | null;
  body: string;
  createdAt: string | Date;
}

interface Props {
  ticketId: string;
  comments: ConversationComment[];
  compact?: boolean;
  onViewAll?: () => void;
}

interface CommentPost {
  body: string;
  parentCommentId: string | null;
}

export function TicketConversation({ ticketId, comments, compact = false, onViewAll }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const threads = useMemo(() => {
    const sorted = [...comments].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const byId = new Map(sorted.map(c => [c.id, c]));
    const roots: ConversationComment[] = [];
    const replies = new Map<string, ConversationComment[]>();
    for (const comment of sorted) {
      // Flatten legacy deeper chains too, and keep orphans/cycles visible.
      let root = comment;
      const seen = new Set([comment.id]);
      while (root.parentCommentId != null && byId.has(root.parentCommentId)) {
        if (seen.has(root.parentCommentId)) { root = comment; break; }
        seen.add(root.parentCommentId);
        root = byId.get(root.parentCommentId)!;
      }
      if (root.id === comment.id) roots.push(comment);
      else replies.set(root.id, [...(replies.get(root.id) ?? []), comment]);
    }
    return { roots: compact ? roots.slice(-3) : roots, replies };
  }, [comments, compact]);

  const addCommentMutation = useMutation({
    mutationFn: ({ body, parentCommentId }: CommentPost) =>
      apiRequest("POST", `/api/tickets/${ticketId}/comments`, { body, parentCommentId }),
    onSuccess: (_response, submitted) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "details"] });
      if (submitted.parentCommentId === null) setNewComment("");
      else {
        setReplyDrafts(drafts => ({ ...drafts, [submitted.parentCommentId!]: "" }));
        setOpenReplies(open => ({ ...open, [submitted.parentCommentId!]: false }));
        setCollapsed(state => ({ ...state, [submitted.parentCommentId!]: false }));
      }
      toast({ title: t("ticketDetail.commentAdded") });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add comment", description: error.message, variant: "destructive" });
    },
  });

  const submit = (body: string, parentCommentId: string | null) => {
    if (body.trim() && !addCommentMutation.isPending) {
      addCommentMutation.mutate({ body: body.trim(), parentCommentId });
    }
  };
  const message = (comment: ConversationComment) => (
    <article className="flex gap-3 min-w-0" data-testid={`comment-${comment.id}`}>
      <Avatar className="w-8 h-8 shrink-0">
        <AvatarFallback className="text-xs">
          {comment.authorName?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?"}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
          <span className="text-sm font-semibold" data-testid={`text-comment-author-${comment.id}`}>
            {comment.authorName || "Unknown"}
          </span>
          <time className="text-xs text-muted-foreground" dateTime={new Date(comment.createdAt).toISOString()}>
            {new Date(comment.createdAt).toLocaleDateString()} at{" "}
            {new Date(comment.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </time>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">{renderMentionedText(comment.body)}</p>
      </div>
    </article>
  );

  return (
    <div className={compact ? "space-y-4" : "flex min-h-[60vh] flex-col gap-4"} data-testid="ticket-conversation">
      <div className="space-y-5 flex-1">
        {comments.length === 0 && (
          <div className="py-8 text-center">
            <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">{t("tickets.noTicketsFound")}</p>
          </div>
        )}
        {threads.roots.map(root => {
          const replies = threads.replies.get(root.id) ?? [];
          const expanded = !collapsed[root.id];
          return (
            <div key={root.id} className="space-y-2">
              {message(root)}
              <div className="ml-11 flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpenReplies(open => ({ ...open, [root.id]: !open[root.id] }))}
                  aria-expanded={!!openReplies[root.id]} aria-controls={`reply-composer-${root.id}`}>
                  Reply
                </Button>
                {replies.length > 0 && (
                  <Button variant="ghost" size="sm" aria-expanded={expanded} aria-controls={`replies-${root.id}`}
                    onClick={() => setCollapsed(state => ({ ...state, [root.id]: !state[root.id] }))}>
                    {expanded ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                    {replies.length} {replies.length === 1 ? "reply" : "replies"}
                  </Button>
                )}
              </div>
              {replies.length > 0 && expanded && (
                <div id={`replies-${root.id}`} className="ml-4 border-l pl-6 space-y-4">
                  {replies.map(reply => <div key={reply.id}>{message(reply)}</div>)}
                </div>
              )}
              {openReplies[root.id] && (
                <div id={`reply-composer-${root.id}`} className="ml-4 border-l pl-6 space-y-2">
                  <MentionTextarea value={replyDrafts[root.id] ?? ""}
                    onChange={body => setReplyDrafts(drafts => ({ ...drafts, [root.id]: body }))}
                    placeholder={`Reply to ${root.authorName || "Unknown"}...`} disabled={addCommentMutation.isPending}
                    data-testid={`input-reply-${root.id}`} />
                  <Button size="sm" onClick={() => submit(replyDrafts[root.id] ?? "", root.id)}
                    disabled={!replyDrafts[root.id]?.trim() || addCommentMutation.isPending}
                    data-testid={`button-send-reply-${root.id}`}>Send reply</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {compact && (
        <Button variant="ghost" size="sm" onClick={onViewAll} data-testid="button-view-all-comments">
          View all {comments.length}
        </Button>
      )}
      <div className="border-t pt-3">
        <MentionTextarea value={newComment} onChange={setNewComment} rows={2}
          placeholder="Add a comment... Type @ to mention someone" disabled={addCommentMutation.isPending}
          className="resize-none" data-testid="input-comment" />
        <div className="flex items-center justify-between gap-2 mt-2">
          {user?.name && (
            <span className="text-xs text-muted-foreground" data-testid="text-commenting-as">
              Commenting as <span className="font-medium">{user.name}</span>
            </span>
          )}
          <Button size="sm" onClick={() => submit(newComment, null)}
            disabled={!newComment.trim() || addCommentMutation.isPending} data-testid="button-add-comment">
            {addCommentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <><Send className="w-4 h-4 mr-1" />{t("ticketDetail.sendComment")}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
