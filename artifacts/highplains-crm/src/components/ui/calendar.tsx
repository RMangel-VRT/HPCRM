import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "dropdown",
  startMonth,
  endMonth,
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames()
  const thisYear = new Date().getFullYear()
  const navButton = cn(
    buttonVariants({ variant: "ghost" }),
    "h-8 w-8 p-0 text-primary hover:bg-primary/10 hover:text-primary aria-disabled:opacity-40"
  )

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      startMonth={startMonth ?? new Date(thisYear - 10, 0)}
      endMonth={endMonth ?? new Date(thisYear + 10, 11)}
      className={cn("p-3", className)}
      classNames={{
        root: cn(defaults.root, "w-fit"),
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex w-full flex-col gap-3",
        nav: "absolute inset-x-0 top-0 flex w-full items-center justify-between",
        button_previous: navButton,
        button_next: navButton,
        month_caption: "flex h-8 w-full items-center justify-center px-9",
        dropdowns: "flex items-center gap-1.5 text-sm font-semibold",
        dropdown_root:
          "relative rounded-md border border-input bg-background px-2 py-1 shadow-sm hover:bg-primary/5 focus-within:ring-2 focus-within:ring-ring",
        dropdown: "absolute inset-0 cursor-pointer opacity-0",
        caption_label:
          "flex items-center gap-1 text-sm font-semibold [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-primary",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "w-9 text-center text-[0.7rem] font-semibold uppercase tracking-wide text-primary/80",
        week: "mt-1 flex w-full",
        day: "relative h-9 w-9 p-0 text-center text-sm",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 rounded-md p-0 font-normal hover:bg-primary/10"
        ),
        selected:
          "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        today:
          "[&>button]:font-semibold [&:not([data-selected])>button]:text-primary [&>button]:ring-2 [&>button]:ring-inset [&>button]:ring-primary/50",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass, ...rest }) => {
          const cls = cn("h-4 w-4", chevronClass)
          if (orientation === "left") return <ChevronLeft className={cls} {...rest} />
          if (orientation === "right") return <ChevronRight className={cls} {...rest} />
          return <ChevronDown className={cls} {...rest} />
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
