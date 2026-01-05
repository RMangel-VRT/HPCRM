import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

export function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 2,
  className = "",
  disabled = false,
  "data-testid": testId,
}: MentionTextareaProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
    staleTime: 60000,
  });

  const filteredMembers = teamMembers.filter(
    (member) =>
      member.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(newValue);

    const textBeforeCursor = newValue.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex !== -1) {
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
      if (charBefore === " " || charBefore === "\n" || atIndex === 0) {
        const textAfterAt = textBeforeCursor.substring(atIndex + 1);
        if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
          setMentionQuery(textAfterAt);
          setMentionStartPos(atIndex);
          setShowSuggestions(true);
          setSelectedIndex(0);
          return;
        }
      }
    }

    setShowSuggestions(false);
    setMentionQuery("");
    setMentionStartPos(-1);
  };

  const insertMention = useCallback(
    (member: TeamMember) => {
      if (mentionStartPos === -1) return;

      const beforeMention = value.substring(0, mentionStartPos);
      const afterMention = value.substring(
        mentionStartPos + mentionQuery.length + 1
      );
      const mentionText = `@[${member.id}:${member.name}]`;
      const newValue = beforeMention + mentionText + " " + afterMention;

      onChange(newValue);
      setShowSuggestions(false);
      setMentionQuery("");
      setMentionStartPos(-1);

      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = beforeMention.length + mentionText.length + 1;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          textareaRef.current.focus();
        }
      }, 0);
    },
    [mentionStartPos, mentionQuery, value, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions || filteredMembers.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredMembers.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filteredMembers[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowSuggestions(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (suggestionsRef.current && showSuggestions) {
      const selectedElement = suggestionsRef.current.children[
        selectedIndex
      ] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, showSuggestions]);

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
        disabled={disabled}
        data-testid={testId}
      />
      {showSuggestions && filteredMembers.length > 0 && (
        <Card
          ref={suggestionsRef}
          className="absolute z-50 w-64 max-h-48 overflow-y-auto mt-1 p-1"
          data-testid="mention-suggestions"
        >
          {filteredMembers.slice(0, 8).map((member, index) => (
            <div
              key={member.id}
              className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                index === selectedIndex
                  ? "bg-accent"
                  : "hover-elevate"
              }`}
              onClick={() => insertMention(member)}
              data-testid={`mention-option-${member.id}`}
            >
              <Avatar className="w-6 h-6">
                <AvatarFallback className="text-xs">
                  <User className="w-3 h-3" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{member.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {member.role}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

export function renderMentionedText(text: string): React.ReactNode {
  const mentionRegex = /@\[([^:]+):([^\]]+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const [, userId, userName] = match;
    parts.push(
      <span
        key={`mention-${match.index}`}
        className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium text-sm"
        data-user-id={userId}
      >
        @{userName}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
