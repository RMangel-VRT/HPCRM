import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface CrewSelectOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface CrewSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  crews: CrewSelectOption[];
  placeholder?: string;
  testId?: string;
  disabled?: boolean;
}

const NONE = "__none__";

export function CrewSelect({
  value,
  onChange,
  crews,
  placeholder = "No crew",
  testId = "select-crew",
  disabled,
}: CrewSelectProps) {
  const [open, setOpen] = useState(false);

  // Show inactive crews only if currently selected (so the value is still visible).
  const visibleCrews = useMemo(
    () => crews.filter((c) => c.isActive || c.id === value),
    [crews, value],
  );

  const selected = useMemo(() => crews.find((c) => c.id === value) ?? null, [crews, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-testid={testId}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
          )}
        >
          {selected ? (
            <span>
              {selected.name}
              {!selected.isActive ? (
                <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
              ) : null}
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search crews…" data-testid={`${testId}-search`} />
          <CommandList>
            <CommandEmpty>No matching crews.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={placeholder}
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn("mr-2 h-4 w-4", value === null ? "opacity-100" : "opacity-0")}
                />
                <span className="text-muted-foreground">{placeholder}</span>
              </CommandItem>
              {visibleCrews.map((crew) => (
                <CommandItem
                  key={crew.id}
                  value={`${crew.name} ${crew.id}`}
                  onSelect={() => {
                    onChange(crew.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === crew.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span>
                    {crew.name}
                    {!crew.isActive ? (
                      <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { NONE as CREW_SELECT_NONE };
