export function DateioLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Dateio">
      {/* top half: lavender */}
      <path d="M14 4C10.5 4 7 6.5 7 10.5C7 12.5 8 14 9.5 15.2L14 14L18.5 15.2C20 14 21 12.5 21 10.5C21 6.5 17.5 4 14 4Z" fill="#c4b7e0"/>
      {/* bottom half: dark navy */}
      <path d="M9.5 15.2C11 16.5 12.5 18 14 24C15.5 18 17 16.5 18.5 15.2L14 14L9.5 15.2Z" fill="#202932"/>
      {/* zigzag / ECG line */}
      <polyline points="7,14 9.5,14 11,11 12.5,17 14,13 15.5,15 17,14 18.5,14 21,14" stroke="white" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" fill="none"/>
    </svg>
  );
}
