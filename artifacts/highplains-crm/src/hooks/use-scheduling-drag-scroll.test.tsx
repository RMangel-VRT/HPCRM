// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useSchedulingDragScroll } from "./use-scheduling-drag-scroll";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("bounded scheduling pane auto-scroll", () => {
  it("continues without pointer movement, clamps at pane bounds, and stops on cancellation", () => {
    let next = 0;
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", vi.fn((cb: FrameRequestCallback) => { frames.set(++next, cb); return next; }));
    const cancel = vi.fn((id: number) => frames.delete(id));
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const tick = (time: number, animationTimestamp = time) => {
      clock = time;
      const [id, cb] = [...frames.entries()][0]!;
      frames.delete(id);
      act(() => cb(animationTimestamp));
    };
    const pane = (left: number, right: number) => {
      const el = document.createElement("div");
      Object.defineProperties(el, {
        clientWidth: { value: right - left }, scrollWidth: { value: 1800 },
        clientHeight: { value: 400 }, scrollHeight: { value: 2000 },
      });
      el.getBoundingClientRect = () => ({ left, right, top: 0, bottom: 400 } as DOMRect);
      return el;
    };
    const queue = { current: pane(0, 300) };
    const board = { current: pane(320, 1000) };
    const pointer = { current: { x: 800, y: 400 } };
    function Harness({ active }: { active: boolean }) {
      useSchedulingDragScroll(active, pointer, [queue, board]);
      return null;
    }
    const view = render(<Harness active />);
    tick(0); tick(16); tick(32);
    expect(board.current.scrollTop).toBe(8);
    expect(queue.current.scrollTop).toBe(0);
    pointer.current = { x: 800, y: 401 };
    tick(48);
    expect(board.current.scrollTop).toBe(8);
    pointer.current = { x: 150, y: 400 };
    tick(64); tick(80);
    expect(queue.current.scrollTop).toBe(8);
    expect(board.current.scrollTop).toBe(8);
    board.current.scrollTop = 1599;
    board.current.scrollLeft = 1119;
    pointer.current = { x: 1000, y: 400 };
    tick(96); tick(112);
    expect(board.current.scrollTop).toBe(1600);
    expect(board.current.scrollLeft).toBe(1120);
    pointer.current = { x: 3000, y: 400 };
    tick(128);
    board.current.scrollTop = 0;
    pointer.current = { x: 1000, y: 400 };
    tick(144, 100000);
    expect(board.current.scrollTop).toBe(4);
    tick(10000, 200000);
    expect(board.current.scrollTop).toBe(12); // A paused tab does not accumulate a large scroll jump.
    view.rerender(<Harness active={false} />);
    expect(cancel).toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("integrates a bounded rate despite integer rounding and external scroll drift", () => {
    let clock = 0, callback!: FrameRequestCallback;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.stubGlobal("requestAnimationFrame", vi.fn((cb: FrameRequestCallback) => { callback = cb; return 1; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const el = document.createElement("div");
    let actual = 0;
    Object.defineProperties(el, {
      clientWidth: { value: 300 }, scrollWidth: { value: 300 },
      clientHeight: { value: 400 }, scrollHeight: { value: 2000 },
      scrollTop: { get: () => actual, set: value => { actual = Math.round(value); } },
    });
    el.getBoundingClientRect = () => ({ left: 0, right: 300, top: 0, bottom: 400 } as DOMRect);
    const pane = { current: el }, empty = { current: null };
    const pointer = { current: { x: 150, y: 394 } }; // 218.75px/s.
    function Harness() { useSchedulingDragScroll(true, pointer, [pane, empty]); return null; }
    render(<Harness />);
    for (let i = 1; i <= 60; i++) {
      clock = i * 1000 / 60;
      act(() => callback(clock * 5)); // Animation timestamp is not the budget clock.
      expect(Math.abs(actual - 218.75 * clock / 1000)).toBeLessThanOrEqual(.5);
      if (i === 30) actual += 100; // An external adjustment cannot compound the scroll loop.
    }
    expect(actual).toBe(219);
  });
});
