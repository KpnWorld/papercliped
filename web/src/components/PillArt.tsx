import { useState } from "react";
import { cx } from "./cx";
import { Mascot } from "./Mascot";

/** The hero art: fifteen gradient pills with the mascot in the valley. Click (or tap) the art to send a wave through it. */
export function PillArt({ className }: { className?: string }) {
  const [wave, setWave] = useState(0);
  return (
    <div key={wave} className={cx("pill-art", wave > 0 && "pill-wave", className)} onClick={() => setWave((w) => w + 1)}>
      {Array.from({ length: 15 }, (_, i) => <span key={i} aria-hidden="true" className="pill" />)}
      <div className="pill-mascot">
        <Mascot size={132} hopOnClick title="Papercliped mascot. Click me." className="h-auto w-full cursor-pointer drop-shadow-xl" />
      </div>
    </div>
  );
}
