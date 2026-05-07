import { Image } from "expo-image";
import React from "react";
import { View } from "react-native";

import { useColors } from "@/hooks/useColors";

export function Logo({ size = 64, withBackground = true }: { size?: number; withBackground?: boolean }) {
  const colors = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: withBackground ? colors.primary : "transparent",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Image
        source={require("../assets/images/logo.png")}
        style={{ width: size * 0.78, height: size * 0.78 }}
        contentFit="contain"
      />
    </View>
  );
}
