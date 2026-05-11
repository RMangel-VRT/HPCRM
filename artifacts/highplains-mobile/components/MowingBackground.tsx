import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import Svg, { Circle, Line, Rect } from "react-native-svg";
import { useFocusEffect } from "expo-router";

import { useColors } from "@/hooks/useColors";

const STRIPE_COUNT = 8;
const PASS_DURATION = 4000;
const TURN_DURATION = 400;
const EDGE_PAUSE = 150;
const HOLD_AFTER_FINISH = 800;
const FADE_BACK_DURATION = 600;
const MOWER_WIDTH = 36;
const MOWER_HEIGHT = 44;

type Props = {
  reduceMotion?: boolean;
};

const AnimatedView = Animated.createAnimatedComponent(View);

export function MowingBackground({ reduceMotion: reduceMotionProp }: Props) {
  const colors = useColors();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [osReduceMotion, setOsReduceMotion] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setOsReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (v: boolean) => setOsReduceMotion(v),
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      setAppActive(s === "active");
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  const reduceMotion = !!reduceMotionProp || osReduceMotion;
  const shouldAnimate = !reduceMotion && isFocused && appActive && !!size;

  return (
    <View
      style={[styles.root, { backgroundColor: colors.grassUnmowed }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (
          !size ||
          Math.abs(size.w - width) > 0.5 ||
          Math.abs(size.h - height) > 0.5
        ) {
          setSize({ w: width, h: height });
        }
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {size ? (
        <MowingScene
          width={size.w}
          height={size.h}
          colors={colors}
          animate={shouldAnimate}
          reduceMotion={reduceMotion}
        />
      ) : null}
    </View>
  );
}

function MowingScene({
  width,
  height,
  colors,
  animate,
  reduceMotion,
}: {
  width: number;
  height: number;
  colors: ReturnType<typeof useColors>;
  animate: boolean;
  reduceMotion: boolean;
}) {
  const stripeHeight = height / STRIPE_COUNT;

  const sp0 = useSharedValue(reduceMotion ? 1 : 0);
  const sp1 = useSharedValue(reduceMotion ? 1 : 0);
  const sp2 = useSharedValue(reduceMotion ? 1 : 0);
  const sp3 = useSharedValue(reduceMotion ? 1 : 0);
  const sp4 = useSharedValue(reduceMotion ? 1 : 0);
  const sp5 = useSharedValue(reduceMotion ? 1 : 0);
  const sp6 = useSharedValue(reduceMotion ? 1 : 0);
  const sp7 = useSharedValue(reduceMotion ? 1 : 0);
  const stripeProgress = [sp0, sp1, sp2, sp3, sp4, sp5, sp6, sp7];
  const stripesOpacity = useSharedValue(1);
  const mowerX = useSharedValue(-MOWER_WIDTH);
  const mowerY = useSharedValue(stripeHeight / 2 - MOWER_HEIGHT / 2);
  const mowerRotation = useSharedValue(90);
  const mowerOpacity = useSharedValue(reduceMotion ? 0 : 1);

  const runningRef = useRef(false);
  const stoppedRef = useRef(false);

  const resetState = useCallback(() => {
    stripeProgress.forEach((sv) => {
      cancelAnimation(sv);
      sv.value = 0;
    });
    cancelAnimation(stripesOpacity);
    cancelAnimation(mowerX);
    cancelAnimation(mowerY);
    cancelAnimation(mowerRotation);
    cancelAnimation(mowerOpacity);
    stripesOpacity.value = 1;
    mowerOpacity.value = 1;
    mowerX.value = -MOWER_WIDTH;
    mowerY.value = stripeHeight / 2 - MOWER_HEIGHT / 2;
    mowerRotation.value = 90;
  }, [
    mowerOpacity,
    mowerRotation,
    mowerX,
    mowerY,
    stripeHeight,
    stripeProgress,
    stripesOpacity,
  ]);

  const runLoop = useCallback(() => {
    if (stoppedRef.current) return;
    let stripeIdx = 0;
    const goingRight = (i: number) => i % 2 === 0;

    const startStripe = () => {
      if (stoppedRef.current) return;
      if (stripeIdx >= STRIPE_COUNT) {
        // Hold then fade back
        stripesOpacity.value = withDelay(
          HOLD_AFTER_FINISH,
          withTiming(0, { duration: FADE_BACK_DURATION }, (finished) => {
            if (!finished) return;
            // Reset stripes
            for (let i = 0; i < STRIPE_COUNT; i++) {
              stripeProgress[i].value = 0;
            }
            stripesOpacity.value = 1;
            mowerX.value = -MOWER_WIDTH;
            mowerY.value = stripeHeight / 2 - MOWER_HEIGHT / 2;
            mowerRotation.value = 90;
            stripeIdx = 0;
            runOnJS(scheduleNext)();
          }),
        );
        return;
      }

      const i = stripeIdx;
      const right = goingRight(i);
      const startX = right ? -MOWER_WIDTH : width;
      const endX = right ? width : -MOWER_WIDTH;
      const yCenter = i * stripeHeight + stripeHeight / 2 - MOWER_HEIGHT / 2;

      mowerX.value = startX;
      mowerY.value = yCenter;
      mowerRotation.value = right ? 90 : -90;

      // Drive stripe wipe in lockstep with mower pass
      stripeProgress[i].value = 0;
      stripeProgress[i].value = withTiming(1, {
        duration: PASS_DURATION,
        easing: Easing.linear,
      });

      mowerX.value = withTiming(
        endX,
        { duration: PASS_DURATION, easing: Easing.linear },
        (finished) => {
          if (!finished || stoppedRef.current) return;
          // Edge pause + U-turn
          const nextI = i + 1;
          if (nextI >= STRIPE_COUNT) {
            stripeIdx = nextI;
            runOnJS(scheduleNext)();
            return;
          }
          const nextRight = goingRight(nextI);
          const nextYCenter =
            nextI * stripeHeight + stripeHeight / 2 - MOWER_HEIGHT / 2;
          mowerY.value = withDelay(
            EDGE_PAUSE,
            withTiming(nextYCenter, {
              duration: TURN_DURATION,
              easing: Easing.inOut(Easing.quad),
            }),
          );
          mowerRotation.value = withDelay(
            EDGE_PAUSE,
            withTiming(
              nextRight ? 90 : -90,
              { duration: TURN_DURATION, easing: Easing.inOut(Easing.quad) },
              (turnDone) => {
                if (!turnDone || stoppedRef.current) return;
                stripeIdx = nextI;
                runOnJS(scheduleNext)();
              },
            ),
          );
        },
      );
    };

    const scheduleNext = () => {
      if (stoppedRef.current) return;
      startStripe();
    };

    startStripe();
  }, [
    height,
    mowerOpacity,
    mowerRotation,
    mowerX,
    mowerY,
    stripeHeight,
    stripeProgress,
    stripesOpacity,
    width,
  ]);

  const stopAndCancel = useCallback(() => {
    stoppedRef.current = true;
    runningRef.current = false;
    cancelAnimation(mowerX);
    cancelAnimation(mowerY);
    cancelAnimation(mowerRotation);
    cancelAnimation(mowerOpacity);
    cancelAnimation(stripesOpacity);
    stripeProgress.forEach((sv) => cancelAnimation(sv));
  }, [
    mowerOpacity,
    mowerRotation,
    mowerX,
    mowerY,
    stripeProgress,
    stripesOpacity,
  ]);

  useEffect(() => {
    if (reduceMotion) {
      // Cancel any in-flight timeline first so callback chains can't keep
      // mutating shared values after we apply the static state.
      stopAndCancel();
      stripeProgress.forEach((sv) => {
        sv.value = 1;
      });
      stripesOpacity.value = 1;
      mowerOpacity.value = 0;
      return;
    }
    if (animate) {
      // Always start from a known initial state so a resume after blur /
      // background is a clean restart, not a half-finished field.
      stopAndCancel();
      resetState();
      stoppedRef.current = false;
      runningRef.current = true;
      mowerOpacity.value = withTiming(1, { duration: 200 });
      runLoop();
    } else {
      stopAndCancel();
    }
    return () => {
      stopAndCancel();
    };
  }, [
    animate,
    reduceMotion,
    runLoop,
    resetState,
    stopAndCancel,
    mowerOpacity,
    stripeProgress,
    stripesOpacity,
  ]);

  // Reset when size changes
  useEffect(() => {
    if (!reduceMotion) {
      resetState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  const stripesContainerStyle = useAnimatedStyle(() => ({
    opacity: stripesOpacity.value,
  }));

  const mowerStyle = useAnimatedStyle(() => ({
    opacity: mowerOpacity.value,
    transform: [
      { translateX: mowerX.value },
      { translateY: mowerY.value },
      { rotate: `${mowerRotation.value}deg` },
    ],
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <AnimatedView style={[StyleSheet.absoluteFill, stripesContainerStyle]}>
        {Array.from({ length: STRIPE_COUNT }).map((_, i) => (
          <StripeRow
            key={i}
            index={i}
            width={width}
            stripeHeight={stripeHeight}
            colors={colors}
            progress={stripeProgress[i]}
            goingRight={i % 2 === 0}
          />
        ))}
      </AnimatedView>

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <GrassTexture width={width} height={height} colors={colors} />
      </View>

      <AnimatedView
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            width: MOWER_WIDTH,
            height: MOWER_HEIGHT,
          },
          mowerStyle,
        ]}
      >
        <MowerSvg colors={colors} />
      </AnimatedView>
    </View>
  );
}

function StripeRow({
  index,
  width,
  stripeHeight,
  colors,
  progress,
  goingRight,
}: {
  index: number;
  width: number;
  stripeHeight: number;
  colors: ReturnType<typeof useColors>;
  progress: SharedValue<number>;
  goingRight: boolean;
}) {
  const stripeColor =
    index % 2 === 0 ? colors.grassStripeLight : colors.grassStripeDark;

  // The mower-cut "wipe": a full-width strip translated off-screen, sliding in
  // as the mower passes. translateX-only animation = native thread.
  const fillStyle = useAnimatedStyle(() => {
    const tx = goingRight
      ? -width + progress.value * width
      : width - progress.value * width;
    return {
      transform: [{ translateX: tx }],
    };
  });

  return (
    <View
      style={{
        position: "absolute",
        top: index * stripeHeight,
        left: 0,
        width,
        height: stripeHeight,
        overflow: "hidden",
      }}
    >
      <AnimatedView
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            width,
            height: stripeHeight,
            backgroundColor: stripeColor,
          },
          fillStyle,
        ]}
      />
    </View>
  );
}

function GrassTexture({
  width,
  height,
  colors,
}: {
  width: number;
  height: number;
  colors: ReturnType<typeof useColors>;
}) {
  // Deterministic scatter of small "blade" strokes across the field. Static
  // (no animation) so it composites cheaply over the animated stripe layer
  // and breaks up the flat color into something that reads as grass.
  const blades = React.useMemo(() => {
    const density = 0.012; // blades per square px
    const count = Math.min(900, Math.max(120, Math.round(width * height * density)));
    let seed = 1337;
    const rnd = () => {
      // Mulberry32 — small, deterministic
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const arr: { x: number; y: number; len: number; angle: number; opacity: number }[] = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        x: rnd() * width,
        y: rnd() * height,
        len: 2 + rnd() * 4,
        angle: -25 + rnd() * 50, // mostly upright, slight tilt
        opacity: 0.18 + rnd() * 0.22,
      });
    }
    return arr;
  }, [width, height]);

  return (
    <Svg width={width} height={height} pointerEvents="none">
      {blades.map((b, i) => {
        const rad = (b.angle * Math.PI) / 180;
        const x2 = b.x + Math.sin(rad) * b.len;
        const y2 = b.y - Math.cos(rad) * b.len;
        return (
          <Line
            key={i}
            x1={b.x}
            y1={b.y}
            x2={x2}
            y2={y2}
            stroke={colors.grassBlade}
            strokeWidth={0.9}
            strokeLinecap="round"
            opacity={b.opacity}
          />
        );
      })}
    </Svg>
  );
}

function MowerSvg({ colors }: { colors: ReturnType<typeof useColors> }) {
  // Top-down zero-turn mower silhouette. Faces "up" by default — rotation 90°
  // makes it face right.
  const body = colors.mowerBody;
  const wheel = "#1a1a1a";
  const seat = "#0d2a0d";
  return (
    <Svg width={MOWER_WIDTH} height={MOWER_HEIGHT} viewBox="0 0 36 44">
      {/* Deck */}
      <Rect x="4" y="10" width="28" height="26" rx="3" fill={body} />
      {/* Front casters */}
      <Circle cx="9" cy="8" r="3" fill={wheel} />
      <Circle cx="27" cy="8" r="3" fill={wheel} />
      {/* Rear drive wheels */}
      <Rect x="0" y="22" width="6" height="14" rx="1.5" fill={wheel} />
      <Rect x="30" y="22" width="6" height="14" rx="1.5" fill={wheel} />
      {/* Seat */}
      <Rect x="13" y="18" width="10" height="12" rx="2" fill={seat} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
});
