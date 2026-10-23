import { useEffect, useState } from "react";
import { ApiError, api } from "../api";
import { kolkataClock, kolkataTime, metres } from "../format";

type Point = { at: string; distanceM: number };
type PunchState = {
  site: { name: string; address: string; latitude: number; longitude: number; radiusM: number };
  today: string;
  status: string | null;
  checkIn: Point | null;
  checkOut: Point | null;
};

export function PunchCard({ layout = "full", onPunched }: { layout?: "full" | "strip"; onPunched?: () => void }) {
  const [state, setState] = useState<PunchState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    api<PunchState>("/api/attendance/punch")
      .then(setState)
      .catch((caught) => setError(caught.message));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function punch(action: "in" | "out") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const position = await readPosition();
      const next = await api<PunchState>("/api/attendance/punch", {
        method: "POST",
        body: JSON.stringify({
          action,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      });
      setState(next);
      setReading(action === "in" ? next.checkIn?.distanceM ?? null : next.checkOut?.distanceM ?? null);
      setNotice(action === "in" ? "Checked in inside the studio fence." : "Checked out inside the studio fence.");
      onPunched?.();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        if (caught.distanceM != null) setReading(caught.distanceM);
      } else if (isGeoError(caught)) {
        setError(geoMessage(caught));
      } else {
        setError("Could not punch.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <p className="boot">Opening the studio clock…</p>;
  const clock = kolkataClock(now);
  const distance = reading ?? state.checkOut?.distanceM ?? state.checkIn?.distanceM ?? null;
  const outside = distance != null && distance > state.site.radiusM;
  const ratio = distance == null ? 0 : Math.min(distance / state.site.radiusM, 1);

  return (
    <section className={layout === "strip" ? "punch punch-strip" : "punch"}>
      <div>
        <p className="eyebrow">{state.site.name}</p>
        <p className="punch-clock">
          {clock.hours}
          <small>{clock.seconds}</small>
        </p>
        <p className="lede">
          {state.checkOut
            ? `Out at ${kolkataTime(state.checkOut.at)} · ${metres(state.checkOut.distanceM)} from the pin.`
            : state.checkIn
              ? `In since ${kolkataTime(state.checkIn.at)} · ${metres(state.checkIn.distanceM)} from the pin.`
              : `Punches are accepted within ${state.site.radiusM} m of ${state.site.address}. Location is read only when you punch.`}
        </p>
      </div>
      {layout === "full" ? (
        <div className="fence" aria-hidden="true">
          <span className={outside ? "fence-dot outside" : "fence-dot"} style={{ top: `calc(50% + ${ratio * 42}%)` }} />
        </div>
      ) : null}
      <div className="punch-actions">
        {error ? <p className="banner">{error}</p> : null}
        {notice ? <p className="note">{notice}</p> : null}
        <button className="primary" type="button" disabled={busy || Boolean(state.checkIn)} onClick={() => punch("in")}>
          {busy ? "Reading location…" : "Check in"}
        </button>
        <button type="button" disabled={busy || !state.checkIn || Boolean(state.checkOut)} onClick={() => punch("out")}>
          Check out
        </button>
      </div>
    </section>
  );
}

function readPosition() {
  if (!navigator.geolocation) return Promise.reject(new Error("This browser has no location service."));
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });
}

function isGeoError(error: unknown): error is GeolocationPositionError {
  return typeof error === "object" && error != null && "code" in error && "PERMISSION_DENIED" in error;
}

function geoMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return "Allow location for this site. The fence can only be checked from the punch itself.";
  if (error.code === error.TIMEOUT) return "The location fix took too long. Move nearer a window and try again.";
  return "Location is unavailable on this device.";
}
