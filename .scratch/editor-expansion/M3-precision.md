# Spec M3: linijki, Guides, Snapping, pomiar, Align i Distribute

**Blokowane przez:** M2

## Problem

Precyzyjne układanie Layerów wymaga dziś wpisywania liczb. Nie ma linijek, prowadnic, przyciągania, pomiaru odległości ani wyrównywania i rozkładania.

## Rozwiązanie

Narzędzia precyzji jak w Figmie, zgodnie z badaniem `.scratch/editor-guides-snapping/research.md`: prawie wszystko własne, geometria liczona na Boxach (a nie na obrysach Fabric) i podpięta pod zdarzenia Fabric, bez Moveable, @scena i bez zamiany Fabric. Align i Distribute zmieniają Dokument, więc są też w core i w CLI.

## Decyzje

### Linijki i Guides
- Własna linijka na `<canvas>` u góry i z lewej. Krok podziałki zależy od zoomu (1/5/10/50/100 px…). Linijka podąża za przewijaniem i podświetla zakres zaznaczenia.
- Przeciągnięcie z linijki tworzy Guide w `document.guides`. Guide można przesunąć albo usunąć, wyciągając ją z powrotem na linijkę. Każda zmiana to jeden krok cofania.
- Guides są rysowane nad Canvas w edytorze i nigdy nie trafiają do Renderu ani do Exportu (test).

### Snapping (tylko UI, nic nie jest zapisywane)
- Cele: krawędzie i środki widocznych Layerów (także zablokowanych; bez ukrytych i bez przeciąganych), krawędzie i środek Canvas, Guides oraz równe odstępy między sąsiadami.
- Działa przy przesuwaniu (także Group i wielu zaznaczonych, wtedy przyciąga się wspólny obrys, a zaznaczone Layery nie są celami) i przy zmianie rozmiaru (tylko przeciągana krawędź; obrócone Layery przy zmianie rozmiaru się nie przyciągają). Przy przesuwaniu obrócony Layer przyciąga się osiowym obrysem (`boxExtent`).
- Próg to 6 px ekranu, czyli w scenie `6 / zoom`.
- Przyciągamy do wartości już zaokrąglonych do pełnych pikseli, więc po zapisie nie ma odskoku o 0,5 px.
- Domyślnie włączone. Przytrzymanie Cmd/Ctrl wyłącza je na czas gestu. Przełącznik w górnym pasku wyłącza je na stałe (stan edytora, nie Dokumentu).
- Obrót przyciąga co 15° z Shiftem (`snapAngle` w Fabric).
- Linie przyciągania i znaczniki równych odstępów rysujemy nad Canvas (`contextTop` albo nakładka), poza Renderem.
- Geometria to czysty moduł TS z testami w Vitest. Wejście: Boxy i ruch, wyjście: poprawka i linie do narysowania. Ścieżka `object:modified → commit → change` się nie zmienia: jeden gest to dalej jeden krok cofania.

### Pomiar
- Przytrzymanie Alt przy zaznaczonym Layerze i najechanie na inny Layer albo na Canvas pokazuje odległości krawędź–krawędź w px.

### Align i Distribute (core + CLI + Inspector)
- Align: lewa, środek poziomo, prawa, góra, środek pionowo, dół. Jeden zaznaczony Layer wyrównuje się do Canvas, kilka do ich wspólnego Boxa.
- Distribute: „równo” (co najmniej 3 Layery) albo „o odstęp N px” (co najmniej 2), osobno w poziomie i w pionie. Kolejność bierze się z pozycji na osi, nie ze stosu.
- Zaznaczona Group liczy się jako jeden Layer z obrysem dzieci. Żeby rozłożyć jej dzieci, zaznacza się dzieci.
- Czyste funkcje w core. CLI z `--json`: `layer align <project> <doc> <ids…> --edge left|hcenter|right|top|vcenter|bottom` i `layer distribute <project> <doc> <ids…> --axis x|y [--gap N]`.
- W Inspectorze: przyciski Align i Distribute oraz pole odstępu. Każda operacja to jeden krok cofania.

## Kryteria akceptacji
- [ ] Linijki zgodne z zoomem i przewijaniem; Guides tworzone, przesuwane i usuwane z linijek, zapisane w `document.guides`, nieobecne w Renderze.
- [ ] Snapping do Layerów, Canvas, Guides i równych odstępów przy przesuwaniu i zmianie rozmiaru, zgodnie z regułami wyżej (obrót, Group, wiele zaznaczonych, próg zależny od zoomu, pełne piksele, Cmd/Ctrl, przełącznik, 15° z Shiftem).
- [ ] Pomiar odległości z Alt.
- [ ] Align i Distribute w core, w CLI (`--json`) i w Inspectorze, każda operacja jako jeden krok cofania.
- [ ] Jeden gest z przyciąganiem daje dokładnie jedno zdarzenie `change`.
- [ ] Badanie `research.md` przeniesione do śledzonej lokalizacji i podlinkowane.

## Testy
- Czysty moduł Snapping: krawędzie, środki, Guides, równe odstępy, próg przy różnych zoomach, zaokrąglanie, obrócone Layery, wykluczenia.
- Core: Align i Distribute (w tym z Group i z odstępem).
- Web: przeciąganie z prawdziwymi zdarzeniami myszy kończy się na wartości przyciągniętej; Cmd/Ctrl wyłącza przyciąganie; Guides nie trafiają do Exportu.
- CLI: `layer align` i `layer distribute`.

## Poza zakresem
- Siatka (grid).
- Auto layout w Group.
- Przyciąganie przy zmianie rozmiaru obróconych Layerów.
