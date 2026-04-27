import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerFieldProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

export function DatePickerField({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  "data-testid": testId,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (date: Date | undefined) => {
    onChange(date);
    setOpen(false);
  };

  const handleToday = () => {
    onChange(new Date());
    setOpen(false);
  };

  const handleClear = () => {
    onChange(undefined);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground"
          )}
          disabled={disabled}
          data-testid={testId}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="flex-1">{value ? format(value, "MMM d, yyyy") : placeholder}</span>
          {value && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date"
              className="ml-2 rounded-sm opacity-60 hover:opacity-100 focus:outline-none focus:opacity-100"
              data-testid={testId ? `${testId}-inline-clear` : "button-date-inline-clear"}
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleClear();
                }
              }}
            >
              <X className="h-4 w-4" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleSelect}
          initialFocus
        />
        <div className="border-t p-2 flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={handleToday}
            data-testid={testId ? `${testId}-today` : "button-date-today"}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={handleClear}
            data-testid={testId ? `${testId}-clear` : "button-date-clear"}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
