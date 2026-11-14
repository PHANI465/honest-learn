// Motion kit: small, calm animations shared by every screen (see "Design direction" in docs/FIX_PLAN.md).
//
// Rules: motion explains (where something came from, that a tap was felt) and never plays on its own to pull
// attention. Only transform and opacity are animated. When the device asks for less motion, movement is
// replaced by a plain fade or nothing. Built on React Native's own Animated API, so phones and the website
// behave the same and no extra dependency is needed.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, type StyleProp, type ViewStyle } from "react-native";

/** Decelerating curve: things arrive quickly and settle gently (the same curve as the landing page). */
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);
/** The native animation thread is used on phones; the website animates in the browser. */
const NATIVE = Platform.OS !== "web";

/** True when the person has asked their device for less motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** Content fades in and rises a little, once, when it first appears. `delay` staggers items in a list. */
export function FadeInUp({ children, delay = 0, distance = 12, style }: { children: ReactNode; delay?: number; distance?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const t = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const anim = Animated.timing(t, { toValue: 1, duration: reduced ? 150 : 380, delay: reduced ? 0 : delay, easing: EASE, useNativeDriver: NATIVE });
    anim.start();
    return () => anim.stop();
  }, [t, delay, reduced]);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : distance, 0] });
  return <Animated.View style={[style, { opacity: t, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Delay for the nth item of a list: 50 ms apart, and never more than 8 steps so long lists don't feel slow. */
export const stagger = (index: number) => Math.min(index, 8) * 50;

/**
 * Press feedback: the element shrinks slightly while held and springs back on release.
 * Spread `handlers` on a Pressable and put `style` on an Animated.View around (or as) its content.
 */
export function usePressScale(to = 0.97) {
  const reduced = useReducedMotion();
  const scale = useState(() => new Animated.Value(1))[0];
  const onPressIn = useCallback(() => {
    if (reduced) return;
    Animated.timing(scale, { toValue: to, duration: 110, easing: EASE, useNativeDriver: NATIVE }).start();
  }, [reduced, scale, to]);
  const onPressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, speed: 18, bounciness: 6, useNativeDriver: NATIVE }).start();
  }, [scale]);
  return { handlers: { onPressIn, onPressOut }, style: { transform: [{ scale }] } };
}

/** A gentle side-to-side shake for "not quite" (a wrong answer or PIN). Under reduced motion nothing moves. */
export function useShake() {
  const reduced = useReducedMotion();
  const x = useState(() => new Animated.Value(0))[0];
  const shake = useCallback(() => {
    if (reduced) return;
    x.setValue(0);
    Animated.sequence(
      [6, -5, 4, -2, 0].map((toValue) => Animated.timing(x, { toValue, duration: 60, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE })),
    ).start();
  }, [reduced, x]);
  return { shake, style: { transform: [{ translateX: x }] } };
}

/** Appears with a small pop (scale 0.9 to 1 and a fade): a correct answer, a star, a finished lesson. */
export function Pop({ children, style, delay = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number }) {
  const reduced = useReducedMotion();
  const t = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const anim = reduced
      ? Animated.timing(t, { toValue: 1, duration: 150, useNativeDriver: NATIVE })
      : Animated.spring(t, { toValue: 1, delay, speed: 14, bounciness: 9, useNativeDriver: NATIVE });
    anim.start();
    return () => anim.stop();
  }, [t, delay, reduced]);
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 1 : 0.9, 1] });
  const opacity = t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] });
  return <Animated.View style={[style, { opacity, transform: [{ scale }] }]}>{children}</Animated.View>;
}

/** A soft breathing fade for loading placeholders. Still (no loop) under reduced motion. */
export function Pulse({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const t = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
        Animated.timing(t, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, reduced]);
  return <Animated.View style={[style, { opacity: t }]}>{children}</Animated.View>;
}

/** An animated number between 0 and 1 that glides to each new `value` (progress bars, switches). */
export function useGlide(value: number, duration = 450) {
  const reduced = useReducedMotion();
  const t = useState(() => new Animated.Value(value))[0];
  useEffect(() => {
    const anim = Animated.timing(t, { toValue: value, duration: reduced ? 0 : duration, easing: EASE, useNativeDriver: NATIVE });
    anim.start();
    return () => anim.stop();
  }, [t, value, duration, reduced]);
  return t;
}

/**
 * Entrance values for an element that animates itself (a card in a grid keeps its own width and flex styles).
 * With `delay` undefined nothing animates. Returns the opacity and vertical offset to put in the style.
 */
export function useEnter(delay: number | undefined, distance = 12) {
  const reduced = useReducedMotion();
  const on = delay !== undefined;
  const t = useState(() => new Animated.Value(on ? 0 : 1))[0];
  useEffect(() => {
    if (!on) return;
    const anim = Animated.timing(t, { toValue: 1, duration: reduced ? 150 : 380, delay: reduced ? 0 : delay, easing: EASE, useNativeDriver: NATIVE });
    anim.start();
    return () => anim.stop();
  }, [t, on, delay, reduced]);
  return { on, opacity: t, translateY: t.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : distance, 0] }) };
}
