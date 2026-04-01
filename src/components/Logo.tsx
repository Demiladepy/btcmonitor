interface Props {
  size?: number;
}

export function Logo({ size = 28 }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="none"
      viewBox="0 0 48 48"
      style={{ flexShrink: 0 }}
    >
      {/* Shield */}
      <path
        d="M24 4 L42 12 L42 26 C42 35 33 42 24 46 C15 42 6 35 6 26 L6 12 Z"
        stroke="#F7931A"
        strokeWidth="2.8"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Eye outline */}
      <path
        d="M13 24 C13 24 17.5 17 24 17 C30.5 17 35 24 35 24 C35 24 30.5 31 24 31 C17.5 31 13 24 13 24 Z"
        stroke="#F7931A"
        strokeWidth="2.4"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Iris */}
      <circle cx="24" cy="24" r="4.2" stroke="#F7931A" strokeWidth="2.4" fill="none" />
    </svg>
  );
}
