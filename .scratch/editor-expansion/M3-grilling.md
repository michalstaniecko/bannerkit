# Grillowanie spec M3 (#4): decyzje

Sesja przeprowadzona samodzielnie przez agenta. W każdym pytaniu przyjęto rekomendowaną odpowiedź. Wynik trafia do treści #4 (spec po grillowaniu).

## Runda 1: fundamenty

**Q1. Gdzie żyje geometria.** Snapping i pomiar to czysty moduł TS w `packages/web/src/editor/snapping/` (bez importu Fabric, bez DOM), bo korzysta z niego tylko edytor. Align i Distribute to czyste funkcje w core (`packages/core/src/align.ts`), bo używa ich też CLI. Cienki adapter Fabric (`snapping.ts` w edytorze) wpina moduł w zdarzenia Fabric.
→ Tak.

**Q2. Prefactor: Selection Box w core.** Core dostaje `selectionBox(layers, measure)`: osiową sumę `layerExtent` podanych Layerów. Zastępuje `sharedBox` z `packages/web/src/inspector/inspect.ts`, który dziś powtarza logikę `layerExtent` (wysokość tekstu z `textLayout`, Group jako suma dzieci). Z tej jednej funkcji korzystają Inspector, Align/Distribute, Snapping i pomiar. Pierwszy ticket, bez zmiany zachowania.
→ Tak.

**Q3. Co jest „Boxem” dla geometrii.** Zawsze core `layerExtent`: obrys osiowy obróconego Boxa (`boxExtent`), tekst bez `height` z wysokością Text Layout (measure edytora po stronie web, `measureText` z `render/fonts.ts` po stronie serwera), Group jako suma dzieci łącznie z ukrytymi (M2 Q12). Nigdy obrys Fabric: obraz `contain` liczy się Boxem, a nie narysowanym obrazem, a Textbox poszerzony przez za długie słowo liczy się Boxem.
→ Tak.

**Q4. Powierzchnie rysowania.** Guides, linie Snapping, znaczniki równych odstępów i pomiar rysuje moduł edytora na `contextTop` Fabric (wzorzec z `AligningGuidelines`: czyszczenie w `before:render`, rysowanie w `after:render`), w px ekranu. Kolory pochodzą z tokenów CSS (`--guide`, `--snap`, `--measure` w `tokens.css`), odczytanych z kontenera przy `mount`, więc `tokens.css` zostaje jedynym miejscem literałów. Export rysuje przez `toCanvasElement` (`editor/export.ts`), który nie dotyka `contextTop`; potwierdza to test. Linijki to osobne elementy `<canvas>` w Reakcie, w gutterach `CanvasArea`.
→ Tak.

**Q5. Viewport bez zmian.** Zostaje przewijanie CSS (`overflow: auto` na `.viewport`, Canvas wyśrodkowany przez `place-items: safe center`), bez `viewportTransform` i bez panowania spacją. Przeliczenie scena → ekran to `× zoom` plus offset elementu `canvas-host`. Token `--ruler-size` (dziś `0px`) dostaje 20 px. Gutter linijek istnieje zawsze; bez otwartego Dokumentu linijki są puste.
→ Tak.

## Runda 2: linijki i Guides

**Q6. Podziałka.** Krok etykiet to najmniejsza wartość z ciągu 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000…, dla której `krok × zoom ≥ 50` px ekranu. Kreski pośrednie co krok/10, krok/5 albo krok/2 (najgęstsze, które dają co najmniej 5 px ekranu). Etykiety w px Canvas, także ujemne poza Canvas. Linijka rysuje cały widoczny zakres viewportu, w rozdzielczości `devicePixelRatio`. Dobór kroku i kresek to czysta funkcja z testami.
→ Tak.

**Q7. Synchronizacja linijek z widokiem.** Początek układu liczony z `getBoundingClientRect()` elementu `canvas-host` względem linijki. Przeliczenie po przewinięciu viewportu, zmianie zoomu, zdarzeniu `canvas` edytora i przez `ResizeObserver` (viewport i host), raz na klatkę (`requestAnimationFrame`).
→ Tak.

**Q8. Podświetlenie zaznaczenia.** Linijki podświetlają zakres Selection Box. Edytor dostaje zdarzenie `selectionBox` (`{ box: Rect | null }`), wysyłane przy zmianie Selection, po każdym kroku i w każdej klatce przesuwania lub zmiany rozmiaru, więc podświetlenie podąża za gestem na żywo.
→ Tak.

**Q9. Właściciel Guides.** Guides należą do modułu edytora: rysuje je, trafia w nie i prowadzi ich przeciąganie. Kolejność trafień: uchwyty aktywnego obiektu, potem Guide (±3 px ekranu), potem Layery. Najechanie na Guide zmienia kursor (`ew-resize`/`ns-resize`) i ją podświetla. Uchwyty zmiany rozmiaru Canvas (DOM nad Fabric) wygrywają ze wszystkim. Uzasadnienie: Layer przyciągnięty do Guide ma uchwyty dokładnie na niej; nakładka DOM nad Fabric zasłoniłaby te uchwyty.
→ Tak. Zmienia szkic (Guides nie są nakładką DOM).

**Q10. Guides poza Canvas.** Element `<canvas>` Fabric ma rozmiar Canvas × zoom, więc wszystko poza Canvas jest dziś obcięte (także Layery). Linia Guide biegnie więc tylko przez Canvas. Każda Guide ma też znacznik na swojej linijce. Guide poza Canvas widać tylko jako znacznik i przeciąga się ją za znacznik.
→ Tak.

**Q11. Tworzenie, przesuwanie, usuwanie.** Jedno wejście w API edytora (`dragGuide`), z którego korzystają linijka i Canvas. Przeciągnięcie z górnej linijki tworzy Guide poziomą (`guides.y`), z lewej pionową (`guides.x`). Przeciąganie to Gesture preview przez `editor.preview()`, jak uchwyty Canvas. Puszczenie nad dowolną linijką usuwa Guide (albo jej nie tworzy). Puszczenie w innym miejscu daje jeden krok z nową przyczyną `guides`. Escape anuluje. Klik bez ruchu niczego nie tworzy. Przeładowanie z dysku w trakcie gestu go kończy (jak każdy preview). W trakcie przeciągania linijka pokazuje wartość obok znacznika.
→ Tak.

**Q12. Wartości i kolejność w JSON.** Guide z edytora ląduje na pełnym px, bez ograniczania do Canvas. Nowa Guide trafia na koniec swojej tablicy. Przesunięcie podmienia wartość pod tym samym indeksem, usunięcie usuwa ten wpis. Duplikaty są dozwolone, jak w schemacie. Bez klucza `guides` pierwsza Guide go tworzy. Gdy edycja w edytorze opróżni obie tablice, klucz znika (jak puste `name`). Dokument v1 jest w pamięci v2, więc pierwszy zapis Guide zapisuje v2.
→ Tak.

**Q13. Przyciąganie samej Guide.** Przeciągana Guide przyciąga się do krawędzi i środków widocznych Layerów (także zaznaczonych i zablokowanych) oraz do krawędzi i środka Canvas, nie do innych Guides. Próg, Cmd/Ctrl i przełącznik działają jak przy Layerach.
→ Tak.

**Q14. Wydajność relayoutu.** Gdy krok lub preview zmienia tylko `guides`, `relayout` nie układa Layerów od nowa (szybka ścieżka), więc przeciąganie Guide nie przelicza tekstu w każdej klatce.
→ Tak.

**Q15. Poza zakresem dla Guides.** Blokowanie i ukrywanie Guides, ukrywanie linijek (Shift+R), lista Guides i wpisywanie ich wartości w Inspectorze, „usuń wszystkie”. Agent zmienia Guides edycją JSON. Przesuwanie Guides przy zmianie rozmiaru Canvas dostarczyło już M2 (`resizeCanvas`).
→ Tak.

## Runda 3: Snapping

**Q16. Cele.** Każdy Layer (liść i Group) daje 3 linie pionowe i 3 poziome (krawędzie i środek `layerExtent`). Bierzemy Layery efektywnie widoczne (ukryte przez przodka odpadają), także zablokowane i wystające poza Canvas. Wykluczone: Layery z Selection, ich potomkowie i ich przodkowie (Box przodka zależy od przesuwanego dziecka, ADR 0007). Do tego krawędzie i środek Canvas oraz wszystkie Guides. Cele buduje się raz na początku gestu (`before:transform`) z `documentNow()`.
→ Tak.

**Q17. Przesuwany obrys.** Selection Box z początku gestu przesunięty o bieżący offset. Każda z jego 3 linii w osi przyciąga się do każdej linii celu (każda do każdej: krawędź do środka też). Osie X i Y liczone niezależnie.
→ Tak.

**Q18. Próg i wybór.** Próg `6 / zoom` px sceny, włącznie. W każdej osi wygrywa najmniejsza odległość. Remis: Guide, potem Canvas, potem Layer, potem równy odstęp. Rysujemy każdą linię celu, która pokrywa się z wynikiem.
→ Tak.

**Q19. Pełne piksele.** Offset gestu względem startu jest zawsze całkowity, także bez przyciągania, więc to, co widać, jest dokładnie tym, co zapisze `commit`. Przyciąganie wybiera całkowity offset najbliższy celowi. Dla Layerów na pełnych px zapisana krawędź równa się celowi. Cel ułamkowy (środek nieparzystej szerokości) daje najbliższy pełny px (±0,5), a linia i tak się rysuje. Layery z ułamkowym `x`/`y` (od agenta) są zaokrąglane przy commicie jak dziś (`wholePixels`).
→ Tak.

**Q20. Równe odstępy.** Liczone osobno w osi X i Y. „Rząd” to cele, które zachodzą na przesuwany obrys w drugiej osi. (a) Pomiędzy: najbliższy sąsiad z lewej L i z prawej R w rzędzie; cel to położenie z równymi odstępami do L i R. (b) Kontynuacja: istniejący odstęp g między dwoma sąsiadującymi celami w rzędzie, gdy prawy z nich jest najbliższym lewym sąsiadem przesuwanego (albo symetrycznie z prawej); cel to odstęp g od tego sąsiada. Znaczniki: odcinki wszystkich równych odstępów z etykietą w px. Wzorzec: Excalidraw `getVisibleGaps` (MIT, lektura, nie zależność).
→ Tak.

**Q21. Wygląd linii.** Linia przyciągania biegnie od przesuwanego obrysu do najdalszego dopasowanego celu wzdłuż tej linii. Dla Canvas biegnie przez cały Canvas, dla Guide podświetla się sama Guide. Grubość 1 px ekranu, kolor z tokenu. Wszystko znika na `mouse:up`, na końcu gestu i przy każdym `show`.
→ Tak.

**Q22. Wpięcie w Fabric.** `before:transform` zakłada sesję. `object:moving` poprawia `left`/`top` celu: pojedynczy Layer, `DocumentGroup`, dziecko w Group (między gestami transformacja Group to tożsamość wokół jej Boxa, więc delta na `left`/`top` dziecka to delta w Canvas) i `ActiveSelection`. Edytor wysyła `selectionBox`. `apply(…, 'reload')` w trakcie gestu robi `discardActiveObject` i kończy sesję. Ścieżka `object:modified → commit → change` bez zmian: jeden gest to jeden `change`.
→ Tak.

**Q23. Cmd/Ctrl i przełącznik.** `metaKey || ctrlKey` jest sprawdzane przy każdym ruchu, więc naciśnięcie lub puszczenie w trakcie gestu działa od razu. Cmd przy wciśnięciu myszy dalej zaznacza najgłębszy Layer (M2 Q17), więc przeciąganie z Cmd to „zaznacz w głąb i przesuń bez przyciągania”. Przełącznik siedzi w zarezerwowanym już slocie `topbar-snapping` w `App.tsx` (ikona `Magnet` z lucide). Jego stan to stan sesji, jak Anchor, przekazywany przez `editor.setSnapping(on)`. Wyłączenie obejmuje przesuwanie, zmianę rozmiaru i Guides, ale nie obrót co 15° z Shiftem.
→ Tak.

**Q24. Snapping przy zmianie rozmiaru.** Tylko pojedynczy liść z `rotation` 0. Rect i obraz: w `object:scaling`, na krawędzi Boxa (z `objectToLayer`), a nie uchwytu, więc obraz `contain` przyciąga Box, choć uchwyt siedzi na narysowanym obrazie. Uchwyt boczny: jedna krawędź. Narożnik (Fabric domyślnie skaluje proporcjonalnie, `uniformScaling`): przyciąga oś z bliższym celem, druga idzie za proporcją. Narożnik z Shiftem (swobodny): każda oś osobno. Z Altem (od środka): przyciąga się przeciągana krawędź, przeciwna idzie symetrycznie. Tekst: w `resizeText` przed `resizeTextLayer` (krawędź lewa, prawa, dolna). Przyciągnięta krawędź ląduje na pełnym px.
→ Tak.

**Q25. Bez przyciągania przy zmianie rozmiaru Group i wielu Layerów.** Skalowanie Group i Selection jest proporcjonalne, a `scaleGroup` zaokrągla każdy Layer osobno, więc krawędź nie wylądowałaby dokładnie na celu. W M3 nie przyciągamy; trafia do „Poza zakresem” obok obróconych Layerów.
→ Tak. Zawęża szkic.

**Q26. Obrót co 15°.** Z Shiftem obrót przyciąga co 15°, bez Shifta nie przyciąga. Wpięcie: opakowanie `actionHandler` uchwytu `mtr` (wzorzec `scaleProportionally` w `controls.ts`), które na czas ruchu ustawia `snapAngle = 15` i `snapThreshold = 7.5`. Domyślny próg Fabric równy `snapAngle` zawsze zaokrąglałby w dół. Działa dla liści, Group i `ActiveSelection`. Dla Group wielokrotnością 15° jest obrót względny, bo Group nie ma własnej `rotation`.
→ Tak.

**Q27. Nudge.** Strzałki nie przyciągają: przesuwają dokładnie o 1 px albo 10 px z Shiftem.
→ Tak.

## Runda 4: pomiar

**Q28. Kiedy działa.** Alt wciśnięty (`keydown` na dokumencie z `preventDefault`), niepusta Selection, żaden gest nie trwa, kursor nad Canvas. Pomiar używa ostatniej pozycji kursora, więc pojawia się od razu po wciśnięciu Alt. Znika po puszczeniu Alt, utracie fokusu okna, starcie gestu i opróżnieniu Selection. W trakcie skalowania Alt dalej znaczy „od środka” (Fabric `centeredKey`).
→ Tak.

**Q29. Co jest mierzone.** A to Selection Box. B to `layerExtent` Layera, którego wybrałby klik pod kursorem (reguły `clickTarget` z `picking.ts`). Gdy kursor jest nad pustym Canvas, nad Layerem z Selection albo nad Layerem nietrafialnym (zablokowanym, ukrytym), B to Canvas.
→ Tak.

**Q30. Przypadki i wyświetlanie.** W każdej osi: obrysy rozłączne dają jedną odległość między zwróconymi do siebie krawędziami. Obrysy zachodzące (częściowo albo jeden w drugim) dają odległości między krawędziami tej samej strony (lewa–lewa, prawa–prawa), bez zer. Odcinek leży na środku części wspólnej w drugiej osi, a bez części wspólnej na środku A z przerywanym przedłużeniem do B. Etykiety w px z dokładnością 0,1, bez końcówki „,0”. Obrys B jest podświetlony. Funkcja `measure(a, b)` jest czysta, w module Snapping, z testami w Vitest.
→ Tak.

## Runda 5: Align i Distribute

**Q31. Align w core.** `alignLayers(document, ids, edges, measure, { to })`. Każdy Layer przesuwa się przez `translateLayer` (Group przesuwa wszystkie liście), `rotation` zostaje. Delta Layera to `roundPx(cel − jego krawędź)`. Domyślne `to`: Canvas dla jednego Layera, Selection Box dla kilku. `to: 'canvas'` wyrównuje każdy Layer osobno do Canvas. Dziecko Group wyrównuje się do Canvas, nie do Group (Group nie ma własnej ramki, ADR 0007).
→ Tak.

**Q32. Distribute w core.** `distributeLayers(document, ids, axis, measure, { gap? })`. Kolejność po początku `layerExtent` na osi, przy remisie po środku, potem po kolejności rysowania. Tryb „równo”: pierwszy i ostatni stoją, odstęp `(rozpiętość − suma rozmiarów) / (n − 1)` może być ujemny, każda pozycja liczona od pierwszego i zaokrąglana osobno, więc błąd się nie kumuluje. Tryb „o odstęp N”: pierwszy stoi, każdy kolejny ląduje na końcu poprzedniego (już zaokrąglonego) plus N. Minimum 3 Layery dla „równo”, 2 dla „o odstęp”.
→ Tak.

**Q33. Reguły wejścia.** Id są deduplikowane (jak w `group`). Nieznane id to `NOT_FOUND`. Layer razem ze swoim przodkiem, za mało Layerów i niepoprawny `gap` to `INVALID_INPUT`. Layery z różnych rodziców są dozwolone, bo trzymają współrzędne Canvas (ADR 0007). Zaznaczona Group liczy się jako jeden Layer. Core i CLI pomijają `locked` i `visible`: blokada chroni przed ręką na Canvas, a agent i tak edytuje JSON.
→ Tak.

**Q34. CLI.** `layer align <project> <doc> <ids…> --edge left|hcenter|right|top|vcenter|bottom [--edge …] [--to canvas|selection]`: `--edge` można podać dwa razy, raz na oś (`hcenter` + `vcenter` centruje). Dwie krawędzie tej samej osi to błąd użycia. `layer distribute <project> <doc> <ids…> --axis x|y [--gap N]`, gdzie N to pełne px ≥ 0 (`intFlag`; ujemny odstęp poza zakresem). Zła wartość enum to błąd użycia (exit 2) z podpowiedzią najbliższej, jak `--anchor`. Wynik jak przy `layer group`: `{ project, name, path, document, warnings, hash, moved }`. Gdy nic się nie rusza, plik nie jest zapisywany (v1 zostaje v1), `moved: []`, a `hash` to hash pliku z dysku. Opy `alignLayers`/`distributeLayers` w `ops/documents.ts` na wzór `writeTreeEdit`, tekst mierzony przez `measureText` z `render/fonts.ts`. Bez endpointu REST: edytor liczy lokalnie w core i zapisuje autosave'em, jak przy grupowaniu.
→ Tak. Rozszerza szkic o `--to` i powtarzalne `--edge`.

**Q35. Selection w CLI.** Komendy przyjmują tylko jawne id. Agent czyta Selection przez `inspect` (`result.selection.selectedLayerIds`) i przekazuje id dalej. Bez flagi `--selected`.
→ Tak.

**Q36. Inspector.** Sekcja „Align” na górze zakładki Properties przy niepustej Selection, także dla Group. Zawiera 6 przycisków Align (ikony lucide `Align*`), 2 przyciski Distribute (poziomo, pionowo) i pole „Gap” (puste oznacza „równo”; wartość to stan sesji, nie Dokumentu). Podpowiedzi mówią, do czego się wyrównuje („to Canvas” albo „to Selection”). Przyciski są nieaktywne, gdy Selection zawiera Layer efektywnie zablokowany albo ukryty (jak nudge, `selectionFrozen`) albo gdy brakuje Layerów do Distribute. Każde kliknięcie to jedno `editor.update(recipe, { cause: 'inspector' })`, a Selection zostaje. Recepta potrzebuje measure, więc edytor udostępnia `measureText` (to samo, którym rysuje Canvas, ADR 0004).
→ Tak.

**Q37. Skróty klawiszowe Align.** Brak w M3 (Alt jest zajęty przez pomiar). Trafia do „Poza zakresem”.
→ Tak.

## Runda 6: API edytora, testy, dokumenty

**Q38. Nowe API edytora.** `setSnapping(on)`, `dragGuide(axis, index | 'new')` zwracające sterownik gestu (`move`, `end`, `cancel`), zdarzenie `selectionBox`, `measureText`, przyczyna `guides` w `ApplyCause`, oraz `marks()`: bieżące linie, odstępy i pomiary do testów (jak `objectFor`, „dla adapterów i testów”). Obiekty Fabric dalej nie wychodzą z modułu.
→ Tak.

**Q39. Testy.** Czysty moduł Snapping: tabele przypadków (krawędzie, środki, Guides, Canvas, równe odstępy w obu wariantach, próg przy kilku zoomach, remisy, pełne px, obrócone Layery, wykluczenia przodków i potomków, `measure`). Core: Align i Distribute z Group, obrotem, tekstem z Auto height, `to`, `gap`, zaokrąglaniem i błędami. Web, jsdom i prawdziwe zdarzenia myszy (`drag` z `interaction.test.ts`): przeciąganie kończy się na wartości przyciągniętej, z `metaKey` bez przyciągania, przełącznik wyłącza, jeden gest daje dokładnie jeden `change`, zmiana rozmiaru rect, obrazu `contain` i tekstu, Shift przy obrocie. Guides: tworzenie, przesuwanie i usuwanie z linijki i na Canvas, Escape, jeden krok, undo (wzorzec `canvas-handles.test.tsx`, rozbudowa `guides.test.ts`). Export z Guides i widocznymi liniami jest identyczny jak bez nich. CLI: wzorzec `cli-group.test.ts`, także brak zapisu przy braku ruchu.
→ Tak.

**Q40. Badanie `research.md`.** `.scratch/` jest już śledzony w git (plik wszedł w 9acd44a), więc niczego nie przenosimy. Jak przy badaniu Electron (#1), plik dostaje na górze linię statusu wskazującą #4 i ADR 0008 i zostaje archiwum. Kryterium akceptacji w #4 zmienia się odpowiednio.
→ Tak.

**Q41. ADR 0008.** Tak, krótki: „Narzędzia precyzji liczą na Boxach Dokumentu i rysują poza Renderem; bez biblioteki przyciągania”. Powód: następca łatwo sięgnie po `AligningGuidelines` z `fabric/extensions` albo po Moveable, a odrzucenie ich jest nieoczywiste.
→ Tak.

**Q42. Dokumentacja dla agentów.** `docs/agents/bannerkit.md`: wiersze `layer align` i `layer distribute` w tabeli CLI, przepis „wyśrodkuj na Canvas” (`--edge hcenter --edge vcenter --to canvas`) i zdanie, że człowiek ustawia Guides w edytorze, a agent może do nich wyrównywać, czytając `guides` z JSON. `inspect` bez zmian.
→ Tak.

**Q43. Podział na tickety (kolejność).** (1) Prefactor: core `selectionBox` zamiast `sharedBox`, `measureText` w API edytora. (2) Core i CLI: Align i Distribute. (3) Inspector: sekcja Align. (4) Linijki ze zdarzeniem `selectionBox`. (5) Guides w edytorze (rysowanie, trafianie, `dragGuide`, przyczyna `guides`). (6) Snapping przy przesuwaniu (krawędzie, środki, Canvas, Guides, przełącznik, Cmd/Ctrl). (7) Równe odstępy. (8) Snapping przy zmianie rozmiaru i obrót co 15°. (9) Pomiar z Alt. Tickety 2–3 i 4–9 mogą iść równolegle po 1.
→ Tak.

## Propozycje do słownika (do wpisania później)

- **Ruler** (nowy): pasek u góry i z lewej Canvas z podziałką w px Canvas zależną od zoomu; podświetla Selection Box, z niego wyciąga się i do niego odkłada Guides. _Avoid_: miarka, scale bar.
- **Measurement** (nowy): odległości krawędź–krawędź w px między Selection Box a Layerem pod kursorem albo Canvas, pokazywane z wciśniętym Alt; nic nie jest zapisywane. _Avoid_: redlines, spacing overlay.
- **Snapping** (doprecyzowanie): przyciąga obrys przesuwanych Layerów (osiowy, `boxExtent`) albo przeciąganą krawędź pojedynczego nieobróconego Layera do krawędzi i środków Layerów, Canvas, Guides lub równego odstępu, w progu 6 px ekranu; Cmd/Ctrl wyłącza je na czas gestu. Obrót co 15° z Shiftem to osobne przyciąganie kąta.
- **Align** (doprecyzowanie): do Selection Box przy kilku Layerach, do Canvas przy jednym (albo na żądanie CLI `--to canvas`); liczy na obrysach osiowych.
- **Gesture preview** (doprecyzowanie): dopisać przeciąganie Guide jako przykład.

## ADR

Warto: **0008 „Precision tools compute on Document Boxes and draw outside the Render”**. Sedno: Snapping, pomiar, Align i Distribute liczą na `layerExtent` (Box Dokumentu, obrys osiowy), nigdy na obrysach Fabric (`getCoords`), bo obraz `contain` i poszerzony Textbox mają inne obrysy niż Box w JSON. Rdzeń to własny czysty TS, a nie Moveable, @scena czy `AligningGuidelines` (DOM, porzucone albo liczące na obrysach Fabric i kolidujące z `resizing` tekstu). Guides, linie i pomiar rysuje edytor na `contextTop`, poza `toCanvasElement`, więc nigdy nie trafiają do Exportu. Align i Distribute są w core, bo agenci (ADR 0005) potrzebują ich w CLI. Rozważane opcje: `fabric/extensions` AligningGuidelines, Moveable, wymiana Fabric na Konvę/tldraw (za `research.md`).
