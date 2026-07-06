import logoAsset from "@/assets/solyn-logo.png.asset.json";

export function SolynLogo({ size = 40 }: { size?: number }) {
  return (
    <img
      src={logoAsset.url}
      alt="Solyn Global"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain" }}
      className="rounded-lg"
    />
  );
}
