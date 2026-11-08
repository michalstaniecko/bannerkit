# Grillowanie spec M2 (#3): decyzje

Sesja przeprowadzona samodzielnie przez agenta. W każdym pytaniu przyjęto rekomendowaną odpowiedź. Wynik trafił do treści #3 (spec po grillowaniu).

## Runda 1: fundamenty

**Q1. Walidacja plików v1.** Plik z `version: 1` sprawdzamy zamrożonym schematem v1. Pole z v2 (`group`, `textTransform`, `fontStyle`, `guides`) w pliku v1 to błąd z podpowiedzią „wymaga `version: 2`; uruchom `bannerkit migrate`”. Dopiero poprawny v1 jest podnoszony do v2.
→ Tak.

**Q2. Przechodzenie po drzewie.** Przed zmianą schematu robimy prefactor: core dostaje funkcje do chodzenia po drzewie Layerów (przejście w kolejności rysowania, szukanie po id z rodzicem i pozycją, podmiana Layera w drzewie). Każda reguła walidacji, operacja serwera i akcja edytora, która dziś iteruje po `document.layers`, przechodzi na te funkcje. Ścieżki w Issues mają postać `layers[1].layers[0].fontWeight`.
→ Tak, jako pierwszy ticket, bez zmiany zachowania.

**Q3. Gdzie żyje v2.** `validateDocument` i odczyt Dokumentu po stronie serwera zawsze zwracają v2. Każdy zapis pisze `version: 2`. `doc new` i `doc duplicate` tworzą v2. REST GET zwraca podniesiony Dokument i hash bajtów z dysku, więc `expectedHash` dalej działa. Panel JSON przyjmuje v1 i v2.
→ Tak.

**Q4. Determinizm `textTransform`.** `toUpperCase`/`toLowerCase` bez locale, takie samo w przeglądarce i Node. Zmiana długości tekstu (`ß` → `SS`) jest dozwolona. `inspect` pokazuje w `lines[].text` tekst przekształcony.
→ Tak.

**Q5. Edycja tekstu na Canvas z `textTransform`.** W trakcie edycji Textbox pokazuje tekst oryginalny. Po wyjściu z edycji transformacja wraca. Zapisywany jest zawsze tekst wpisany.
→ Tak.

**Q6. Manifest fontów.** `style: "normal" | "italic"`, unikalność po `family/weight/style`. `FontSpec` w pomiarze dostaje `style`. Brak kursywy to błąd z listą grubości, które mają kursywę. W Inspectorze przełącznik kursywy jest nieaktywny, gdy dla rodziny i grubości nie ma pliku. Pliki Inter Italic pochodzą z tego samego wydania Inter co obecne.
→ Tak.

**Q7. `guides`.** `{ x: number[], y: number[] }`, obie tablice wymagane (mogą być puste), skończone liczby, bez reguł kolejności i duplikatów. Zmiana rozmiaru Canvas z Anchor przesuwa Guides o tę samą deltę co Layery. `doc duplicate` kopiuje je bez zmian. Edytor zachowuje je przy każdym kroku (round-trip przez Fabric ich nie gubi).
→ Tak.

**Q8. Group w Fabric.** Każda Group to jeden `fabric.Group` z dziećmi w środku. Krycie Group działa jak w CSS dzięki wymuszonemu cache obiektu (dzieci rysowane na jedną powierzchnię). Mapper przelicza współrzędne dziecka przez transformację Group. Po commicie transformacji Group dzieci dostają pola bezwzględne, a Group jest odbudowywana z transformacją jednostkową. Eksport z przeglądarki używa tej samej sceny.
→ Tak.

**Q9. Group w skia-canvas.** Rysowanie rekurencyjne. Group z `opacity < 1` rysuje dzieci na pomocniczą powierzchnię o rozmiarze Canvas (w skali rysowania) i nakłada ją z `globalAlpha`. Group z `opacity` 1 rysuje dzieci bezpośrednio, bo wynik jest ten sam.
→ Tak.

## Runda 2: zachowanie Group

**Q10. Zmiana rozmiaru Group.** Tylko proporcjonalna: uchwyty narożne, bez uchwytów na krawędziach. Skalujemy `x`/`y` dzieci względem przeciwległego narożnika, `width`/`height` oraz pola wymiarowe: `fontSize`, `autoFit.minFontSize`, `letterSpacing`, `cornerRadius`, `shadow.blur`, `shadow.offsetX/Y`. Rotacje dzieci zostają, bo skala jest jednorodna. Zaokrąglanie: pola Boxa do pełnych px jak dziś, `fontSize`, `minFontSize`, `letterSpacing` i pola cienia do 0,1.
→ Tak.

**Q11. Obrót Group.** Środki dzieci obracają się wokół środka Boxa Group, a każde dziecko dostaje `rotation += kąt` (zaokrąglenie 0,1°, pozycje do pełnych px). Po commicie Box Group liczy się od nowa jako obrys osiowy. Obrót nie jest polem Group.
→ Tak.

**Q12. Box Group a ukryte dzieci.** Box obejmuje wszystkie dzieci, także ukryte, rekurencyjnie.
→ Tak.

**Q13. Group, która staje się pusta.** Operacja, która zostawiłaby pustą Group (usunięcie ostatniego dziecka, wyniesienie go), usuwa też Group w tym samym kroku. Group z jednym dzieckiem jest poprawna. Pusta Group w JSON-ie pozostaje błędem walidacji.
→ Tak.

**Q14. Dziedziczenie `locked`/`visible`.** Layer jest efektywnie zablokowany lub ukryty, gdy on albo którykolwiek przodek jest. Na Canvas taki Layer nie jest trafiany. Z listy da się go zaznaczyć, ale nie ma uchwytów (jak dziś zablokowane Layery). Inspector pokazuje własną flagę dziecka i informację, że blokuje/ukrywa je Group.
→ Tak.

**Q15. Id w drzewie.** `nextLayerId` liczy po całym drzewie, Group dostaje `group-<n>`. Duplikat Group kopiuje poddrzewo i nadaje nowe id wszystkim potomkom.
→ Tak.

**Q16. Kształt Selection.** Selection może łączyć Layery z różnych rodziców, ale nigdy przodka razem z potomkiem: zaznaczenie dziecka zdejmuje z Selection jego przodka i odwrotnie. `group` wymaga wspólnego rodzica. W core to błąd, w edytorze nieaktywna akcja.
→ Tak.

## Runda 3: interakcje w edytorze

**Q17. Kliknięcia.** Klik zaznacza najwyższą Group nad trafionym Layerem. Gdy zaznaczone jest dziecko Group G, klik w inne dziecko G zaznacza je (zostajemy w kontekście G). Dwuklik na zaznaczonej Group zaznacza dziecko pod kursorem (o jeden poziom niżej). Dwuklik na zaznaczonym tekście startuje edycję. Cmd+klik zaznacza od razu najgłębszy Layer. Shift+klik dodaje do Selection w bieżącym kontekście. Escape przy zaznaczonym dziecku zaznacza jego Group. Zaznaczanie prostokątem (marquee) łapie Layery najwyższego poziomu.
→ Tak.

**Q18. Gdzie trafiają nowe Layery.** Dodanie Layera, gdy zaznaczony jest Layer w Group, wstawia nowy do tego samego rodzica, tuż nad najwyższym zaznaczonym. Gdy zaznaczona jest Group, nowy trafia nad nią, na jej poziom. Bez Selection trafia na szczyt korzenia (jak dziś).
→ Tak.

**Q19. Lista Layerów.** Zwinięcie Group to stan UI na czas sesji, nie trafia do Dokumentu. Domyślnie Group jest rozwinięta. Zaznaczenie dziecka na Canvas rozwija jego przodków. Strefy upuszczania: górna i dolna część wiersza wstawia przed lub za wierszem w jego rodzicu, środek wiersza Group wstawia na szczyt jej dzieci. Nie można przeciągnąć Group do jej własnego potomka. Przeciąga się jeden wiersz, jak dziś.
→ Tak.

**Q20. Skróty.** Cmd+G grupuje Selection (co najmniej jeden Layer, wspólny rodzic). Po grupowaniu Selection to nowa Group. Cmd+Shift+G rozgrupowuje każdą zaznaczoną Group, a Selection to jej byłe dzieci. Oba skróty blokują domyślne zachowanie przeglądarki. Nowa Group nie dostaje `name`, a lista pokazuje wtedy jej id.
→ Tak.

**Q21. Inspector dla Group.** Pola: `name` (puste usuwa klucz), `opacity`, `visible`, `locked`, `x`/`y` Boxa (przesuwają dzieci), `width`/`height` tylko do odczytu. Brak `rotation`. Przy kilku Layerach z Group: część wspólna, czyli `opacity`, `visible`, `locked` i `x`/`y` Selection Box.
→ Tak.

**Q22. Inspector tekstu.** `textTransform` jako przełącznik segmentowy (brak / WERSALIKI / małe), `fontStyle` jako przełącznik kursywy. Oba obsługują stan Mixed.
→ Tak.

## Runda 4: agenci i CLI

**Q23. `layer group` / `layer ungroup`.** Wynik jak w `doc new` (`{ project, name, path, document, warnings, hash }`) plus `id` nowej Group albo `ids` byłych dzieci. Nieznane id daje `NOT_FOUND`, różni rodzice albo `ungroup` na Layerze innym niż Group dają `INVALID_INPUT`. Zapis bezwarunkowy, jak `doc resize`. `moveIntoGroup` i `moveOutOfGroup` są tylko w core; agenci przenoszą Layery edycją JSON.
→ Tak.

**Q24. `inspect` jako drzewo.** Wpis Group: `{ index, id, type: "group", name?, extent, placement, selected, layers: [...] }`, zagnieżdżony. `index` to pozycja w rodzicu. W tekście wcięcie według głębokości. Ostrzeżenie „poza Canvas” dotyczy tylko liści, bo Box Group jest pochodną.
→ Tak.

**Q25. `bannerkit migrate`.** Wynik `{ project, migrated: [{ name, path }], unchanged: [...], invalid: [{ name, path, errors }] }`. Niepoprawnych v1 nie zapisuje. Exit 1, jeśli jakiś jest niepoprawny. Komenda jest idempotentna. Zmienia tylko `version`; `$schema` zostaje, formatowanie normalizuje zwykły zapis JSON. Otwarty edytor dostaje live reload, ale treść jest ta sama, więc nic się nie zmienia.
→ Tak.

**Q26. Przykłady i dokumentacja.** `examples/demo/documents/hero.json` zostaje w v1 i sprawdza odczyt v1. Nowy Dokument demo w v2 pokazuje Guides, Group z kryciem, wersaliki i kursywę. Każdy ticket aktualizuje swoją część `docs/agents/bannerkit.md` i JSON Schema.
→ Tak.
