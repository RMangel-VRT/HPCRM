import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Edit, Send } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { Link } from "wouter";

export default function TicketDetail() {
  const [newComment, setNewComment] = useState("");

  const ticket = {
    id: "1",
    title: "Sprinkler head replacement needed",
    description: "Several sprinkler heads in Zone 3 are damaged and need replacement. Customer reported water pooling in the area. Needs to be addressed before next scheduled service.",
    customer: "Riverside Homeowners Association",
    customerId: "1",
    property: "Main Entrance",
    propertyId: "1",
    priority: "high",
    status: "open" as const,
    assignedTo: "John Doe",
    createdBy: "Sarah Johnson",
    createdAt: "2024-03-10T10:30:00",
    dueDate: "2024-03-15",
  };

  const comments = [
    {
      id: "1",
      user: "John Doe",
      comment: "I've ordered the replacement parts. Should arrive by end of day tomorrow.",
      createdAt: "2024-03-10T14:20:00",
    },
    {
      id: "2",
      user: "Sarah Johnson",
      comment: "Great, please schedule this for Thursday morning if possible.",
      createdAt: "2024-03-10T15:45:00",
    },
  ];

  const handleAddComment = () => {
    if (newComment.trim()) {
      console.log("Adding comment:", newComment);
      setNewComment("");
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "high":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "normal":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "low":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-ticket-title">
              {ticket.title}
            </h1>
            <StatusBadge status={ticket.status} />
            <Badge variant="secondary" className={getPriorityColor(ticket.priority)}>
              {ticket.priority}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Ticket #{ticket.id} • Created by {ticket.createdBy} on{" "}
            {new Date(ticket.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Button data-testid="button-edit-ticket">
          <Edit className="w-4 h-4 mr-2" />
          Edit Ticket
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{ticket.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Comments ({comments.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                {comments.map((comment, index) => (
                  <div key={comment.id}>
                    <div className="flex gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="text-xs">
                          {comment.user.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{comment.user}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(comment.createdAt).toLocaleDateString()} at{" "}
                            {new Date(comment.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-sm">{comment.comment}</p>
                      </div>
                    </div>
                    {index < comments.length - 1 && <Separator className="mt-4" />}
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-3">
                <Textarea
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={3}
                  data-testid="input-comment"
                />
                <div className="flex justify-end">
                  <Button onClick={handleAddComment} data-testid="button-add-comment">
                    <Send className="w-4 h-4 mr-2" />
                    Add Comment
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Status</p>
                <Select defaultValue={ticket.status}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="waiting">Waiting</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Priority</p>
                <Select defaultValue={ticket.priority}>
                  <SelectTrigger data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Assigned To</p>
                <div className="flex items-center gap-2 mt-2">
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-xs">
                      {ticket.assignedTo.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{ticket.assignedTo}</span>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Due Date</p>
                <p className="text-sm">{new Date(ticket.dueDate).toLocaleDateString()}</p>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Customer</p>
                <Link href={`/dashboard/customers/${ticket.customerId}`} className="text-sm text-primary hover:underline">
                  {ticket.customer}
                </Link>
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Property</p>
                <Link href={`/properties/${ticket.propertyId}`} className="text-sm text-primary hover:underline">
                  {ticket.property}
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
