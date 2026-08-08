import { useEffect } from "react";

interface UserGuideDialogProps {
  onClose: () => void;
}

const steps = [
  {
    number: "1",
    title: "Vytvorte projekt",
    body: <>Kliknite na názov projektu vľavo hore a zvoľte <b>New Project</b>. Projekt sa priebežne ukladá automaticky.</>,
  },
  {
    number: "2",
    title: "Nastavte Art-Net",
    body: <>Kliknite hore na <b>Art-Net</b>. Zadajte IP adresu DMX uzla a port <b>6454</b>, zapnite <b>Output enabled</b> a potvrďte cez <b>Apply &amp; restart output</b>.</>,
  },
  {
    number: "3",
    title: "Pridajte a patchnite svetlá",
    body: <>V režime <b>EDIT</b> otvorte vľavo <b>Fixtures</b> a stlačte <b>+</b>. Vyberte presný model a DMX režim. <b>Add &amp; Auto-patch</b> nájde voľnú adresu automaticky.</>,
  },
  {
    number: "4",
    title: "Rozmiestnite ich na pôdoryse",
    body: <>Svetlá presúvajte myšou v strede plochy. Voliteľný PNG/JPG pôdorys pridáte cez <b>Add Floor Plan</b>. Viac svetiel vyberiete so <b>Shift</b>.</>,
  },
  {
    number: "5",
    title: "Nastavte svetelný obraz",
    body: <>Vyberte svetlo a v pravom paneli nastavte <b>Intensity, Color, Pan, Tilt</b> alebo <b>Zoom</b>. Fyzické svetlo musí mať rovnaký DMX režim a adresu ako v LightHouse.</>,
  },
  {
    number: "6",
    title: "Uložte scénu",
    body: <>Dole otvorte <b>Scenes</b> a kliknite <b>Capture Scene</b>. Ak sú vybrané svetlá, uloží sa čiastočná scéna iba pre ne; bez výberu sa uložia všetky.</>,
  },
  {
    number: "7",
    title: "Pripravte prehrávanie",
    body: <>Pri scéne použite <b>+ Cue</b> pre poradie v Cue Liste alebo <b>+ Live</b> pre veľké spúšťacie tlačidlo. Efekty vytvoríte v karte <b>Effects</b>.</>,
  },
  {
    number: "8",
    title: "Spustite show",
    body: <>Prepnite hore na <b>LIVE</b>. Scény spúšťajte z Live Panelu alebo tlačidlom <b>GO</b>. <b>BLACKOUT</b> okamžite zhasne intenzitu všetkých svetiel.</>,
  },
];

export function UserGuideDialog({ onClose }: UserGuideDialogProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixture-dialog-backdrop guide-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="fixture-dialog guide-dialog" role="dialog" aria-modal="true" aria-label="Návod – prvá svetelná show" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><small>PRVÉ KROKY</small><h2>Prvá svetelná show</h2></div>
          <button type="button" aria-label="Zavrieť návod" onClick={onClose}>×</button>
        </header>

        <div className="guide-intro">
          Tento postup vás prevedie od prázdneho projektu až po spustenie prvej scény. Nastavenia, patch aj scény môžete pripraviť bez pripojených svetiel.
        </div>

        <div className="guide-steps">
          {steps.map((step) => (
            <article key={step.number}>
              <span>{step.number}</span>
              <div><h3>{step.title}</h3><p>{step.body}</p></div>
            </article>
          ))}
        </div>

        <div className="guide-safety">
          <strong>Pred prvým výstupom</strong>
          <span>Začnite s GRAND MASTER na 0 %, skontrolujte adresy a až potom pomaly pridávajte intenzitu. Červený BLACKOUT je dostupný stále.</span>
        </div>

        <footer><span /><button className="primary" type="button" onClick={onClose}>Rozumiem, začať</button></footer>
      </section>
    </div>
  );
}
