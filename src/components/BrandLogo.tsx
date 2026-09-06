import { Image } from "react-native";

type BrandLogoProps = {
  width?: number;
};

export default function BrandLogo({ width = 270 }: BrandLogoProps) {
  return (
    <Image
      source={require("../../assets/timebytes-app-icon.png")}
      style={{ width, height: width }}
      resizeMode="contain"
      accessibilityLabel="TimeBytes logo"
    />
  );
}