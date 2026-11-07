# Research: linijki, przyciąganie i pomiary w edytorze (biblioteka czy własna implementacja)

Status: needs-research

Pytanie: edytor ma dostać narzędzia jak w Figmie albo Canvie: linijki, przyciąganie Layerów do siebie (smart guides), przyciąganie do prowadnic z linijek, pokazywanie odległości między Layerami, a dalej wyrównywanie i rozkładanie, siatkę, transformację wielu zaznaczonych Layerów i obrót. Czy warto do tego dołożyć biblioteki, czy takie biblioteki w ogóle istnieją, czy lepiej napisać to samemu?

Odpowiedź wstępna: **hybryda, w praktyce prawie wszystko własne.** Fabric 7 (ADR 0002) już obsługuje to, co naprawdę trudne: uchwyty obróconych obiektów, transformację wielu zaznaczonych (`ActiveSelection`), obrót i przyciąganie kąta. Brakuje tylko geometrii przyciągania, pomiarów i rysowania linijek. To jest prosta matematyka na Boxach i najlepiej, żeby była czystym modułem TS testowanym w Vitest. Biblioteki DOM-owe (Moveable, Selecto, interact.js) nie pasują do edytora na `<canvas>` i dublowałyby właściciela interakcji. Pełne SDK edytorów (tldraw, Excalidraw, Konva jako zamiennik) oznaczałyby wymianę Fabric. Jedyny zewnętrzny kandydat do rozważenia to sama linijka `@scena/react-ruler`, ale jest nieutrzymywana od 2023 i łatwo ją napisać samemu.

Oznaczenia: **[źródło]** to fakt z kodu repo albo z pierwotnego źródła (link obok). **[ocena]** to mój osąd.

## Jak edytor działa dziś (to decyduje o zgodności) [źródło: kod repo]

- **Render: Fabric 7.4.0 na `<canvas>`, React 19 tylko na chrome.** `packages/web/package.json` (`fabric` 7.4.0, `react` 19.3.1). Moduł edytora jest niezależny od frameworka i jako jedyny trzyma `fabric.Canvas`. Obiekty Fabric nie wychodzą z niego jako stan (`packages/web/src/editor/index.ts:1-3`). React montuje go przez `createEditor()` i `editor.mount(host)` (`packages/web/src/App.tsx:59-60`). Canvas siedzi w `<main className="viewport">` z `overflow: auto` (`App.tsx:268-269`, `styles.css:37-44`). Nie ma DOM-owych elementów na Layer, które biblioteka DOM mogłaby chwycić.
- **Przeciąganie, skalowanie i obrót robi Fabric.** Edytor słucha tylko końca modyfikacji: `object:modified` z `transform`, `text:editing:exited` i zdarzeń selekcji (`index.ts:319-332`). `commit` czyta obiekty z powrotem przez `objectToLayer`, zaokrągla do pełnych pikseli (`wholePixels`, `index.ts:426-431`), nakłada ponownie przez `applyLayer` i emituje dokładnie jeden `change` (`index.ts:174-197`). Na `change` wiszą historia, autosave i live reload.
- **Wiele zaznaczonych Layerów:** natywne `ActiveSelection` Fabric. Przed zapisem jest rozwiązywane i tworzone na nowo (`index.ts:176-191`, `select` w `index.ts:358-369`).
- **Własne uchwyty tekstu:** `textControls` (`packages/web/src/editor/controls.ts:11-26`). Tylko boki i dół, `actionName: 'resizing'`, handler `resizeText` zmienia Box przez `resizeTextLayer` i `applyLayer` w trakcie przeciągania (`index.ts:262-269`, `mapper.ts:105-124`). Uchwyt obrotu to domyślny `mtr`.
- **Nudge strzałkami** zmienia `left/top` aktywnego obiektu i robi `commit(..., 'nudge')` (`index.ts:290-300`).
- **Zoom:** `canvas.setZoom(zoom)` plus zmiana wymiarów elementu na Canvas × zoom (`index.ts:302-310`), dopasowanie w `fitZoom` (`editor/zoom.ts:4-7`), sterowanie z Reacta (`App.tsx:163-184`). Nie ma pan/viewportTransform z przesunięciem: Canvas Dokumentu zaczyna się w (0,0) elementu `<canvas>`, a przewijanie robi CSS `overflow: auto`. Przeliczenie scena → ekran to po prostu `× zoom` plus offset elementu w viewporcie. Dobra wiadomość dla linijek.
- **Box Dokumentu ≠ obrys obiektu Fabric.** Obraz `contain` ma uchwyty na narysowanym obrazie, a nie na Boxie (`mapper.ts:151-172`). Textbox może być szerszy niż Box przy za długim słowie (`mapper.ts:174-180`). Przyciąganie do „obiektów Fabric” (`getCoords()`) przyciągałoby więc do czegoś innego niż `x/y/width/height` w JSON. **[ocena]** Przyciąganie musi liczyć na Boxach Layerów (słownik: Box), a nie na obrysach Fabric.
- **Geometria w core już jest:** `Box`, `boxTransform`, `applyMatrix`, `boxExtent` (osiowy obrys obróconego Boxa) w `packages/core/src/geometry.ts:23-70`, z testami w `packages/core/test/geometry.test.ts`.
- **Testy:** Vitest + jsdom + node-canvas, interakcje przez prawdziwe zdarzenia myszy na `canvas.upper-canvas` (`packages/web/vitest.config.ts`, `packages/web/test/interaction.test.ts:1-60`). Czysty moduł geometrii testuje się bez DOM, jak `core`.
- **Live reload i zapisy warunkowe** (`packages/web/src/live-reload.ts:1-15`) widzą tylko `change` po commicie. Wszystko, co dzieje się w trakcie przeciągania, jest dla nich niewidoczne.

Wniosek **[ocena]**: każda biblioteka, która sama robi przeciąganie elementów DOM albo ma własny model sceny, albo nie zadziała z tym edytorem, albo wymaga wymiany Fabric. Zgodne są tylko rzeczy, które (a) wpinają się w zdarzenia Fabric, albo (b) są czystą geometrią lub czystym rysowaniem obok canvasa.

## Przegląd bibliotek

Dane z npm i GitHub pobrane 2026-11-05 (`registry.npmjs.org/<pakiet>`, `api.github.com/repos/<repo>`).

### Fabric 7: to, co już mamy [źródło]
- Licencja MIT, ostatnie wydanie 7.4.0 (2026-05-18), commity codziennie (ostatni 2026-11-05), ok. 459 otwartych issues i PR. https://www.npmjs.com/package/fabric, https://github.com/fabricjs/fabric.js
- **Zdarzenia w trakcie transformacji:** `object:moving`, `object:scaling`, `object:rotating`, `object:resizing`, `before:transform` (`node_modules/fabric/src/EventTypeDefs.ts:154-159`). Tu wpina się przyciąganie: zmienia `left/top` (albo Box przez `applyLayer`), zanim Fabric narysuje klatkę.
- **Przyciąganie kąta wbudowane:** `snapAngle` i `snapThreshold` na obiekcie (`src/shapes/Object/InteractiveObject.ts:56-57`).
- **Rozszerzenie `AligningGuidelines`** w `fabric/extensions` (export `./extensions` w `package.json`, źródło: https://github.com/fabricjs/fabric.js/tree/master/extensions/aligning_guidelines). Dodane w v6 (CHANGELOG: „feat(): Add v6 aligning guidelines. #10033”), poprawiane później (#10120). Działa na `object:moving`, `object:scaling`, `object:resizing`, `mouse:up` i `before:render/after:render` (`extensions/aligning_guidelines/index.ts:75-80`). Ma ok. 750 linii.
  - Pokrywa: przyciąganie do narożników i środków innych obiektów oraz rysowanie linii z krzyżykami. Konfiguracja: `margin`, `getObjectsByTarget`, `getPointMap`, własne `drawLine` (`typedefs.ts`).
  - Nie pokrywa: odstępów i równych odstępów (gap/distribution), prowadnic z linijek, pokazywania odległości w px, siatki.
  - Punkty bierze z `object.getCoords()` i `getCenterPoint()` (`index.ts:95-107`), czyli z obrysu Fabric, a nie z Boxa Dokumentu. Przy skalowaniu z uchwytem `m*` pomija obrócone obiekty (`angle % 90 != 0`, `index.ts:151-153`). Przy akcji innej niż `scale*` (np. nasze `'resizing'` na tekście) sam ustawia `target.width` (`util/collect-point.ts`, gałąź `else`). To konfliktuje z `resizeText`, które zmienia Box przez `applyLayer`.
  - **[ocena, do sprawdzenia]** Tryb „skalowanie od środka” rozpoznaje po `transform.original.originX == 'center'` (`index.ts:177-179`). Nasz mapper zawsze ustawia origin `center` (`mapper.ts:3`), więc ten warunek może być zawsze prawdziwy. Trzeba to zweryfikować testem, zanim się na nim oprze.
  - **[ocena]** To dobry wzorzec, jak się wpiąć w Fabric, ale nie fundament: nie zna Boxów, nie zna tekstu i nie mierzy odstępów.

### Moveable / react-moveable / svelte-moveable (daybrush) [źródło]
- MIT. `moveable` 0.53.0, `react-moveable` 0.56.0, `svelte-moveable` 0.45.0. Wszystkie wydane 2023-12-03 i od tego dnia brak commitów na master. 454 otwarte issues i PR. https://www.npmjs.com/package/react-moveable, https://github.com/daybrush/moveable
- Otwarte issue #1156 (2026-09) z ofertą przejęcia opieki opisuje projekt jako „quiet”. Dwa wcześniejsze wątki „czy projekt żyje” (#1128, #1137) nie mają odpowiedzi. https://github.com/daybrush/moveable/issues/1156
- Funkcje snappable, najbogatsze ze wszystkich: `snapGap`, `snapDirections`, `elementSnapDirections`, `elementGuidelines`, `verticalGuidelines/horizontalGuidelines`, `maxSnapElementGuidelineDistance`, `isDisplaySnapDigit` (pokazywanie odległości), `snapDistFormat`, `snapRotationDegrees` (`packages/react-moveable/src/types.ts`, ok. linie 2592-2716: https://github.com/daybrush/moveable/blob/master/packages/react-moveable/src/types.ts).
- **Model:** `target?: SVGElement | HTMLElement` (`types.ts:62`), a `elementGuidelines` przyjmuje `element: Element` (`types.ts:2760-2764`). Moveable operuje na elementach DOM i ich CSS transform. Nie zna obiektów na `<canvas>`.
- `react-moveable` nie deklaruje `peerDependencies`, a ma 13 zależności (gesto, react-selecto, react-css-styled, …). Rozpakowany rozmiar ok. 4.6 MB (npm `dist.unpackedSize`).
- **[ocena]** Użycie z Fabric wymagałoby niewidocznych DOM-owych „proxy” nad każdym Layerem, synchronizowanych z zoomem i przewijaniem, oraz wyłączenia przeciągania w Fabric. Powstałyby dwa źródła prawdy o interakcji. Do tego biblioteka stoi od prawie 3 lat. Odradzam.

### @scena/guides, @scena/react-guides, @scena/ruler, @scena/react-ruler (daybrush) [źródło]
- MIT. `@scena/react-ruler` 0.19.0 (2023-06-02), `@scena/ruler` 0.20.0 (2023-06-02), `@scena/react-guides` 0.28.2 i `@scena/guides` 0.29.2 (2023-07-29). Od tamtej pory brak commitów. Otwarte: 21 (ruler), 48 (guides). https://github.com/daybrush/ruler, https://github.com/daybrush/guides
- Ruler rysuje skalę na własnym `<canvas>` (`packages/react-ruler/src/react-ruler/Ruler.tsx:49-58`). Propsy: `type`, `zoom`, `unit`, `scrollPos`, `range`, `negativeRuler`, `textFormat`, `marks`, `selectedRanges` (`packages/react-ruler/src/react-ruler/types.ts`). Rozmiar ok. 160 KB, zależności: `@daybrush/utils`, `framework-utils`.
- Guides: przeciąganie prowadnic z linijki, `snaps`, `snapThreshold`, `defaultGuides`, `lockGuides`, zdarzenie `onChangeGuides` (`packages/react-guides/src/react-guides/types.ts`). Sama prowadnica to element DOM.
- **[ocena]** Linijka jest kompatybilna, bo to tylko rysunek obok canvasa, sterowany `zoom` i `scrollPos`. Nie wymaga własności nad Layerami, a stan prowadnic może zostać w aplikacji (`onChangeGuides`). To jedyny kandydat „do kupienia”. Przeciw: brak utrzymania, brak deklarowanego wsparcia React 19 i wąska funkcja. Własna linijka (tick co 1/5/10/50/100 px zależnie od zoomu, etykiety, zaznaczony zakres) to jeden mały komponent z `<canvas>`.

### Selecto (daybrush) [źródło]
- MIT, `selecto`/`react-selecto` 1.26.3 (2023-12-03), 94 otwarte. Zaznaczanie prostokątem elementów DOM. https://github.com/daybrush/selecto
- **[ocena]** Niepotrzebne: Fabric ma już zaznaczanie prostokątem i Shift+klik na `<canvas>`.

### interact.js [źródło]
- MIT, 1.10.28 (2026-08-01), utrzymywany, 95 otwartych. https://github.com/taye/interact.js
- Modyfikatory `snap` (`targets`, `range`, `relativePoints`, `offset`), `snapSize`, `snapEdges` (`packages/@interactjs/modifiers/snap/pointer.ts:12-40`). Biblioteka podpina się pod elementy DOM i emituje zdarzenia z poprawionymi współrzędnymi.
- **[ocena]** Na naszym canvasie byłby jeden element (cały `<canvas>`), więc z biblioteki zostaje sama arytmetyka „snap do najbliższego celu w zasięgu”, czyli kilka linii. Niepotrzebne.

### Konva / react-konva [źródło]
- Kod MIT (plik LICENSE; GitHub pokazuje `NOASSERTION` z powodu dwóch nagłówków copyright). `konva` 10.9.1 (2026-10-31), `react-konva` 19.3.2. Bardzo dobrze utrzymana: 3 otwarte issues i PR. https://github.com/konvajs/konva
- Przyciąganie w Konvie to **przykład z kodem użytkownika, nie API**: `getLineGuideStops`, `getObjectSnappingEdges`, `getGuides` na `dragmove`, próg `GUIDELINE_OFFSET = 5`, linie jako `Konva.Line` (https://konvajs.org/docs/sandbox/Objects_Snapping.html). `Transformer` skaluje `scaleX/scaleY`, a nie `width/height` (https://konvajs.org/docs/select_and_transform/Basic_demo.html).
- **[ocena]** Przejście na Konvę nie daje przyciągania „za darmo”: dostalibyśmy ten sam algorytm, który i tak trzeba napisać. Kosztowałoby to porzucenie ADR 0002 i edycji `Textbox`, którą Konva wprost nie ma. Odrzucam jako zamiennik. Przykład jest za to dobrym, krótkim wzorcem algorytmu.

### tldraw SDK [źródło]
- `tldraw` 5.6.0 (2026-10-28), bardzo aktywny. Licencja własna: „Not to use the Software in Production Environments” bez klucza (`LICENSE.md`: https://github.com/tldraw/tldraw/blob/main/LICENSE.md). Produkcja wymaga klucza trial (100 dni), komercyjnego albo hobby (niekomercyjny, ze znakiem wodnym „made with tldraw”). „Source available”, nie open source (https://tldraw.dev/community/license).
- **[ocena]** Ma najlepsze gotowe narzędzia (snapping, rozkład, obrót grup), ale posiada własny store i model kształtów. Odrzucony już w ADR 0002, a licencja to dodatkowy powód. Odrzucam.

### Excalidraw [źródło]
- MIT, `@excalidraw/excalidraw` 0.18.1 (2026-04-20), opis: „Excalidraw as a React component”, peer React 17–19. Repo bardzo aktywne. https://www.npmjs.com/package/@excalidraw/excalidraw
- Ma rozbudowane przyciąganie: punkty, odstępy, siatkę (`packages/excalidraw/snapping.ts`, ok. 1400 linii: `getVisibleGaps`, `snapDraggedElements`, `snapResizingElements`, `getSnapDistance(zoom)`. https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/snapping.ts). Kod jest jednak związany z `AppClassProperties` i modelem elementów Excalidraw.
- **[ocena]** Jako zależność się nie nadaje (cała aplikacja z własną sceną). Jako **lektura referencyjna** algorytmu odstępów (gap snapping) jest wartościowa, licencja MIT pozwala na inspirację i z atrybucją nawet na przeniesienie fragmentów.

### dnd-kit [źródło]
- MIT, `@dnd-kit/core` 6.3.1 (2024-12), `@dnd-kit/react` 0.5.3 (2026-10-31), `@dnd-kit/modifiers` 9.0.0 („Translate modifier presets”). https://github.com/clauderic/dnd-kit
- **[ocena]** Drag and drop list i kontenerów DOM. Mogłoby pomóc najwyżej przy liście Layerów (`LayerList.tsx`), nie przy canvasie.

### Inne
- **Leafer UI** (`leafer-ui` / `@leafer-in/editor` 2.3.3, MIT, aktywny: https://github.com/leaferjs/leafer-ui) to osobny silnik canvas z własnym edytorem. **[ocena]** Byłby zamiennikiem Fabric, więc nie wchodzi w grę z tych samych powodów co Konva.
- **svg.js** (MIT, 3.2.8) to model SVG. Nie pasuje do renderu na `<canvas>`.
- **[ocena]** Nie znalazłem utrzymywanej, niezależnej od frameworka biblioteki „czystej geometrii przyciągania” (Boxy na wejściu, przesunięcie i linie na wyjściu). Wszystkie znane implementacje są wpięte w model własnej sceny (Moveable, Excalidraw, tldraw, Fabric extension).

## Tabela zbiorcza

| Biblioteka | Funkcje z listy | Zgodność z Fabric/`<canvas>` | Utrzymanie | Licencja | Kto trzyma stan |
|---|---|---|---|---|---|
| Fabric (mamy) | multi-select, uchwyty, obrót, snap kąta | natywna | aktywne | MIT | aplikacja (mapper, ADR 0001) |
| `fabric/extensions` AligningGuidelines | smart guides (narożniki i środki) | wpina się w zdarzenia | w repo Fabric | MIT | obiekty Fabric (nie Boxy) |
| Moveable | wszystko: gap, odległości, guides, obrót | DOM, nie canvas | stoi od 2023-12 | MIT | biblioteka (DOM/CSS) |
| @scena/react-ruler + guides | linijka, prowadnice | obok canvasa, OK | stoi od 2023-06/07 | MIT | aplikacja (`onChangeGuides`) |
| Selecto | zaznaczanie prostokątem | DOM | stoi od 2023-12 | MIT | – |
| interact.js | snap do celów i siatki | DOM | aktywne | MIT | aplikacja |
| Konva | Transformer; snapping tylko jako przykład | zamiennik Fabric | bardzo aktywne | MIT | własna scena |
| tldraw | wszystko | zamiennik | bardzo aktywne | własna, płatna w produkcji | własny store |
| Excalidraw | wszystko (whiteboard) | zamiennik | bardzo aktywne | MIT | własna scena |
| dnd-kit | – (listy DOM) | nie dotyczy | aktywne | MIT | aplikacja |

## Build vs buy dla tego repo [ocena]

**Proste do posiadania (czysta matematyka, dziesiątki do kilkuset linii, łatwe testy):**
- Kandydaci przyciągania: dla każdego Layera (oprócz przeciąganych, ukrytych i opcjonalnie zablokowanych) 3 linie pionowe i 3 poziome z `boxExtent` (krawędzie i środek), do tego krawędzie i środek Canvas oraz prowadnice z linijek. Szukanie najbliższej linii w progu `threshold / zoom` osobno w osi X i Y. Złożoność O(n) na klatkę dla dziesiątek Layerów, bez potrzeby indeksu.
- Równe odstępy (gap snapping, „distribute”): sortowanie po osi, odstępy między sąsiadami na zachodzących pasach, dopasowanie do istniejącego odstępu. Najtrudniejszy z prostych kawałków, ale wciąż czysta funkcja. Wzorzec: Excalidraw `getVisibleGaps`.
- Pomiar odległości (Alt + najechanie jak w Figmie): odległość krawędź–krawędź dwóch osiowych prostokątów albo do Canvas. Kilka przypadków.
- Wyrównanie i rozkład (przyciski): funkcje `Box[] → Box[]` przechodzące przez `editor.apply(..., { cause: 'layers' })` jako jeden krok undo, jak inne akcje Layerów (`layer-actions.ts`).
- Siatka: zaokrąglenie do `step`. Linijka: dobór kroku ticków do zoomu i rysowanie na `<canvas>` z offsetem przewijania.

**Kłopotliwe, ale Fabric już to robi:** uchwyty obróconych obiektów, transformacja grupy (`ActiveSelection`), obrót z `snapAngle`, kursory uchwytów, odwrócone strony. Tego nie warto ani pisać, ani kupować drugi raz.

**Kłopotliwe i zostaje do zrobienia u nas (każda biblioteka miałaby z tym ten sam problem):**
- Przyciąganie przy zmianie rozmiaru: zmienia się tylko przeciągana krawędź, przeciwna stoi. Dla tekstu wpięcie idzie w `resizeText` (`index.ts:262-269`): przyciągnąć `point` albo wynikowy Box przed `applyLayer`. Dla rect i obrazów: w `object:scaling`, przeliczając `scaleX/Y` z docelowej krawędzi.
- Obrócone Layery: rozsądna konwencja (jak Figma) to przyciągać osiowy obrys (`boxExtent`) przy przesuwaniu i nie przyciągać krawędzi przy skalowaniu obróconego obiektu. To samo upraszczenie robi Fabric extension (`angle % 90`).
- `ActiveSelection`: przy przesuwaniu grupy przyciągać obrys całej grupy (suma `boxExtent` zaznaczonych), a wykluczać z kandydatów zaznaczone Layery.
- Zoom: próg i grubość linii w px ekranu, czyli `/ zoom` w scenie. Rysowanie linii po `after:render` na kontekście górnym (`contextTop`) albo w osobnej nakładce, żeby nie trafiły do eksportu (`export.ts` renderuje offscreen, ale to warto sprawdzić testem).
- Zaokrąglanie: `commit` i tak robi `wholePixels`, a przyciąganie do linii z ułamkiem (środek nieparzystej szerokości) może po zaokrągleniu „odskoczyć” o 0.5 px. Trzeba zdecydować: przyciągać do wartości już zaokrąglonych albo zaokrąglać po przyciągnięciu.

**Interakcja ze stanem (najważniejszy argument):** przyciąganie, które tylko modyfikuje `left/top`/Box w trakcie przeciągania, niczego nie zmienia w ścieżce `object:modified → commit → change → autosave/live reload/409`. Historia nadal dostaje jeden krok na gest, a Dokument nadal jest źródłem prawdy (ADR 0001). Biblioteka, która sama porusza elementami (Moveable, interact.js) albo trzyma scenę (Konva, tldraw, Excalidraw), dokłada drugiego właściciela interakcji i stanu. Wtedy trzeba ją synchronizować przy `apply(…, 'reload')`, który w trakcie gestu robi `discardActiveObject` i podmienia obiekty (`index.ts:203-227`).

**Testowalność:** czysty rdzeń (Boxy na wejściu, przesunięcie i linie na wyjściu) testuje się w Vitest bez jsdom, z tabelą przypadków (zoom, obrót, grupa, próg, remis). Integrację z Fabric testuje się tak jak dziś: zdarzenia myszy na `upper-canvas` w `interaction.test.ts`, a sprawdza `getDocument()` po puszczeniu. Pomiary w px nie zależą od fontów, więc nie wymagają Playwrighta (ADR 0002, aneks).

## Rekomendacja [ocena]

1. **Zostać przy Fabric.** Nie dokładać żadnej biblioteki interakcji (Moveable, Selecto, interact.js) ani zamiennika silnika (Konva, Leafer, tldraw, Excalidraw).
2. **Napisać rdzeń przyciągania i pomiarów jako czysty TS**, bez zależności od Fabric, i wpiąć go cienkim adapterem w zdarzenia Fabric.
3. **`AligningGuidelines` z `fabric/extensions` nie używać jako zależności.** Liczy na obrysach Fabric zamiast na Boxach, nie ma odstępów ani prowadnic i konfliktuje z `resizing` tekstu. Można się na nim wzorować przy wpięciu i rysowaniu.
4. **Linijkę napisać samemu** (mały komponent React z `<canvas>`). `@scena/react-ruler` jest dopuszczalny jako skrót, bo nie posiada stanu Layerów, ale stoi od 2023. Własna linijka od razu korzysta z tych samych typów co rdzeń (prowadnice, zaznaczony zakres).
5. **Jako lekturę referencyjną** (nie zależność) brać Excalidraw `snapping.ts` (odstępy, MIT) i przykład Konvy (wzorzec algorytmu).

## Proponowany szew modułów

```
packages/core/src/snap.ts            // albo packages/web/src/editor/snap/, patrz otwarte pytania
  type Rect = { x, y, width, height }           // osiowy; z boxExtent(Box)
  type Guide = { axis: 'x' | 'y'; value: number; source: 'canvas' | 'layer' | 'ruler'; layerId?: string }
  type SnapTargets = { lines: Guide[]; rects: Rect[] }   // zbudowane raz na początku gestu
  buildTargets(doc: Document, exclude: string[], rulerGuides: Guide[]): SnapTargets
  snapMove(moving: Rect, targets, opts: { threshold: number /* px sceny = px ekranu / zoom */ }):
    { dx: number; dy: number; lines: SnapLine[]; gaps: GapMark[] }
  snapEdge(moving: Rect, edge: 'left'|'right'|'top'|'bottom', targets, opts): { value: number; lines: SnapLine[] }
  measure(a: Rect, b: Rect | 'canvas'): Measurement[]       // Alt-hover
  align(boxes: Box[], how): Box[]; distribute(boxes: Box[], axis): Box[]

packages/web/src/editor/snapping.ts   // adapter Fabric
  - before:transform → buildTargets (z documentNow(), wyklucza zaznaczone)
  - object:moving → snapMove na obrysie aktywnego (pojedynczy lub ActiveSelection) → przesuwa left/top
  - object:scaling + resizeText → snapEdge dla nieobróconych
  - after:render → rysuje SnapLine/GapMark na contextTop w px ekranu
  - mouse:up → czyści
  - Editor API: setSnapping({ layers, canvas, guides, grid }), setRulerGuides(guides)

packages/web/src/Rulers.tsx           // React: linijki (zoom, scroll z viewportu), przeciąganie prowadnic → editor.setRulerGuides
```

**[ocena]** `core` ma sens, jeśli z tej samej geometrii skorzysta CLI lub agent (np. `bannerkit align`, sprawdzanie odstępów w `inspect`). Wtedy `align`/`distribute` byłyby też operacjami w `ops` (ADR 0005). Jeśli nie, rdzeń zostaje w `packages/web/src/editor/snap/`.

## Szacunek [ocena]

- Rdzeń przyciągania (linie, Canvas, prowadnice) z adapterem przesuwania i rysowaniem: 1–2 dni z testami.
- Odstępy i równe odstępy: ok. 1–2 dni.
- Przyciąganie przy zmianie rozmiaru (rect, obraz, tekst): ok. 1 dzień.
- Linijki z prowadnicami: ok. 1–2 dni.
- Pomiary Alt-hover, wyrównanie i rozkład: ok. 1 dzień.

Biblioteka nie skróciłaby tego istotnie, bo koszt integracji z Fabric i Boxami Dokumentu zostaje taki sam.

## Otwarte pytania

- Gdzie trzymać prowadnice z linijek: lokalnie w edytorze (np. `localStorage` na Dokument), w `.state.json` obok Selection (widoczne dla agenta) czy w Dokumencie? Dokument wymagałby zmiany schematu (ADR 0001, `"version"`), więc raczej nie.
- Czy agent ma dostać `align`/`distribute` jako komendy CLI? To decyduje, czy rdzeń idzie do `core`.
- Przyciągać do zablokowanych i ukrytych Layerów? (Propozycja: do zablokowanych tak, do ukrytych nie.)
- Konwencja dla obróconych Layerów: obrys osiowy (`boxExtent`) czy narożniki obróconego Boxa?
- Zaokrąglanie przy przyciąganiu do środka o nieparzystej szerokości (odskok o 0.5 px po `wholePixels`).
- Pan i scroll: czy przy linijkach przejść z `overflow: auto` na własny `viewportTransform` Fabric (pan spacją jak w Figmie)? To zmienia przeliczenie scena → ekran dla linijek.
- Do sprawdzenia testem: czy linie rysowane na `contextTop` na pewno nie trafiają do eksportu (`editor/export.ts`).
