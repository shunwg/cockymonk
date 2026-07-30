// Copied verbatim from ../../assets/nesen.svg (see the-daily-cock/ASSETS.md)
// as an inline XML string — SvgXml parses it at runtime, no build-time SVG
// transformer needed. Same "Nesen" mark used throughout the web app's
// screens via <img class="mascot">.
import { SvgXml } from "react-native-svg";

const NESEN_XML = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Cocky Monk">
  <defs>
    <clipPath id="squircle"><rect width="512" height="512" rx="112"/></clipPath>
  </defs>
  <g clip-path="url(#squircle)">
    <rect width="512" height="512" fill="#1B1B2E"/>
    <circle cx="470" cy="52" r="150" fill="#9B6DFF" opacity=".20"/>
    <circle cx="40" cy="470" r="140" fill="#FF5C97" opacity=".16"/>
  </g>
  <g transform="translate(256 256) scale(6.1) translate(-24 -19)">
    <g fill="#141425">
      <circle cx="22.8" cy="21.3" r="16"/>
      <rect x="22" y="20.2" width="30" height="7.7" rx="3.85"/>
    </g>
    <circle cx="24" cy="19.5" r="16" fill="#E8D5AE"/>
    <circle cx="25.4" cy="18.1" r="14.3" fill="#FFF6E8"/>
    <circle cx="24" cy="19.5" r="16" fill="none" stroke="#23233B" stroke-width="2.8"/>
    <g stroke="#23233B" stroke-linecap="round" fill="none">
      <path d="M15 10 19.2 10.6" stroke-width="2"/>
      <path d="M31.4 10 27.2 10.6" stroke-width="2"/>
      <path d="M19 27.2q3.2 3.4 6.6-.6" stroke-width="2.5"/>
    </g>
    <circle cx="17.3" cy="14.9" r="1.7" fill="#23233B"/>
    <circle cx="29.1" cy="14.9" r="1.7" fill="#23233B"/>
    <rect x="23.2" y="18.4" width="30" height="5.2" rx="2.6" fill="#FF5C97" stroke="#23233B" stroke-width="2.5"/>
  </g>
</svg>
`;

export function Mascot({ size = 96 }: { size?: number }) {
  return <SvgXml xml={NESEN_XML} width={size} height={size} />;
}
