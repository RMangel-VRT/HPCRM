import { fireEvent, screen, within } from "@testing-library/react";

export async function openEstimatePicker(type: string, query: string, section = "s1") {
  fireEvent.change(screen.getByTestId(`input-section-search-${section}`), { target: { value: query } });
  const panel = within(await screen.findByTestId(`panel-section-search-${section}`));
  fireEvent.click(await panel.findByTestId(type === "custom" ? "search-create-custom" : `search-see-all-${type}`));
  return screen.findByTestId("dialog-add-line");
}

export function openEstimateLineMenu(id: string) {
  fireEvent.keyDown(screen.getByTestId(`button-line-menu-${id}`), { key: "Enter", code: "Enter" });
}
