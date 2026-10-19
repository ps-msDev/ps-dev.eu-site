# ps-dev.eu

Minimaler Onepager mit eigener geometrischer SVG-Wortmarke in zwei Versionen. Die Palette kombiniert dunkles Graphit, Rotorange und Cremeweiß. HTML, CSS und JavaScript ohne Build, externe Schriften oder Abhängigkeiten. Ein Schalter oben rechts wechselt zwischen V1 und V2; V2 ist die Startseite.

## V2 · Systemkarte (`index.html`)

Isometrische Karte einer fiktiven IT-Landschaft im Stil eines U-Bahn-Plans: ein Event-Ring um den Plattform-Kern, davon ausgehend Linien für API, Datenbanken, Auth, KI, Sicherheit, Finanzen, Personal, CI/CD, Logistik und IoT. Datenpakete fahren die Linien entlang, Stationen leuchten bei Ankunft auf. Die Legende unten hebt einzelne Linien hervor, Mausrad oder −/+ zoomen. Topologie und Beschriftungen sind Beispiele, kein Live-System. Code in `systemkarte.js` und `systemkarte.css`.

## V1 · Datenfäden (`v1.html`)

40 feine Datenfäden verlaufen als kleines diagonales Bündel auf der rechten Seite. Lichtimpulse wandern entlang der Fäden, die sich in einer weichen räumlichen Welle bewegen. WebGL berechnet Geometrie und Verdeckung; die Perspektive reagiert sanft auf die Maus. Ein dezentes Zeichenraster bleibt im Hintergrund.

Die Schaltfläche rechts unten pausiert bzw. startet die Animation. Bei „Bewegung reduzieren“ startet die Seite statisch; in inaktiven Tabs pausiert sie. Die Pixeldichte sinkt auf langsameren Geräten automatisch. Ohne JavaScript oder WebGL bleibt eine statische SVG-Darstellung der Strings sichtbar.

## GitHub Pages

1. Dateien auf GitHub pushen.
2. Unter **Settings → Pages** die Quelle **Deploy from a branch** und den gewünschten Branch mit Ordner **/ (root)** wählen.
3. Unter **Custom domain** `ps-dev.eu` eintragen und die DNS-Einrichtung laut GitHub abschließen. Bestehende Subdomain-Einträge beibehalten.
4. Sobald verfügbar, **Enforce HTTPS** aktivieren.

Die Domain wurde aus dem Repositorynamen übernommen. Die sichtbare Wortmarke besteht aus eigenen SVG-Pfaden in `index.html` und `v1.html`; eine Domainänderung erfordert auch deren Anpassung. Titel, Beschreibung und Screenreader-Text stehen ebenfalls dort. Beide Seiten tragen `noindex`, damit Suchmaschinen sie nicht aufnehmen. DNS und Pages-Einstellungen werden durch diese Dateien nicht verändert.

[GitHub-Dokumentation zur eigenen Domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
