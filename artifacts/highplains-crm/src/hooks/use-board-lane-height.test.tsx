// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { useBoardLaneHeight } from "./use-board-lane-height";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup() {
  let pane = 900, header = 40;
  const observers: { callback: ResizeObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal("ResizeObserver", class {
    callback: ResizeObserverCallback;
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(callback: ResizeObserverCallback) { this.callback = callback; observers.push(this); }
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => pane);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ height: header } as DOMRect));
  function Harness({ crews = 5, frozen = false, ready = true }) {
    const ref = useRef<HTMLDivElement>(null);
    const { gridRef, headerRef, height } = useBoardLaneHeight(ref, crews, ready, frozen);
    return <div ref={ref} data-testid="pane">{ready && crews > 0 && <div ref={gridRef} style={{ rowGap: 10, paddingBottom: 12 }}>
      <div ref={headerRef} data-testid="header" /><output data-testid="height">{height}</output>
    </div>}</div>;
  }
  const resize = (p = pane, h = header) => {
    pane = p; header = h;
    act(() => observers.at(-1)?.callback([], {} as ResizeObserver));
  };
  return { Harness, resize, observers };
}

describe("board pane/header measurement", () => {
  it("observes only pane and header, updates on either resize and does not loop on identical sizes", () => {
    const { Harness, resize, observers } = setup();
    render(<Harness />);
    expect(screen.getByTestId("height").textContent).toBe("159.6");
    expect(observers[0].observe.mock.calls.map(([el]) => el)).toEqual([screen.getByTestId("pane"), screen.getByTestId("header")]);
    resize(1000);
    expect(screen.getByTestId("height").textContent).toBe("179.6");
    resize(1000, 90);
    expect(screen.getByTestId("height").textContent).toBe("169.6");
    resize();
    expect(observers).toHaveLength(1);
  });
  it("freezes through active drag AND deferred drop, then reads the latest dimensions on settlement", () => {
    const { Harness, resize } = setup();
    const view = render(<Harness />);
    view.rerender(<Harness frozen />);
    resize(1300, 50);
    expect(screen.getByTestId("height").textContent).toBe("159.6");
    // Active is now false but a pending drop still owns the presentation.
    view.rerender(<Harness frozen />);
    resize(700, 60);
    expect(screen.getByTestId("height").textContent).toBe("159.6");
    view.rerender(<Harness />);
    expect(screen.getByTestId("height").textContent).toBe("120");
    view.rerender(<Harness frozen />);
    resize(1500, 40);
    view.rerender(<Harness />); // cancellation also settles without needing another observer delivery
    expect(screen.getByTestId("height").textContent).toBe("220");
  });
  it("handles loading, zero crews, crew-count changes, unmeasured panes and cleanup", () => {
    const { Harness, resize, observers } = setup();
    const view = render(<Harness ready={false} />);
    expect(observers).toHaveLength(0);
    view.rerender(<Harness crews={0} />);
    expect(observers).toHaveLength(0);
    view.rerender(<Harness />);
    expect(screen.getByTestId("height").textContent).toBe("159.6");
    resize(0);
    expect(screen.getByTestId("height").textContent).toBe("159.6");
    resize(900);
    view.rerender(<Harness crews={18} />);
    expect(screen.getByTestId("height").textContent).toBe("120");
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    view.unmount();
    expect(observers.at(-1)?.disconnect).toHaveBeenCalledOnce();
  });
});
