> Specyfikacja po grillowaniu (zastępuje szkic; oryginał w `.scratch/editor-expansion/M2-document-v2.md`, decyzje z sesji w `.scratch/editor-expansion/M2-grilling.md`). Model opisuje ADR 0007.

## Problem Statement

Nie da się połączyć kilku Layerów w nazwaną całość, którą przesuwa się, ukrywa i blokuje razem. Projektant musi zaznaczać je za każdym razem od nowa, a agent musi pilnować każdego z osobna. Tekst nie ma wersalików ani kursywy, więc nagłówki w wersalikach trzeba przepisywać ręcznie, a kursywy nie ma wcale. Pozycji linii pomocniczych nie da się zapisać w Dokumencie. Schemat v1 jest zamrożony, więc każda z tych rzeczy wymaga nowej wersji Dokumentu, a istniejące pliki v1 muszą działać dalej bez ręcznej migracji.

## Solution

- **Dokument v2**: nadzbiór v1 z Layerem `group`, polami tekstu `textTransform` i `fontStyle` oraz `guides` na poziomie Dokumentu.
- **Leniwa migracja**: core czyta v1 i v2, a v1 podnosi do v2 w pamięci. Plik zapisuje się jako v2 dopiero przy zapisie zmiany. `bannerkit migrate` podnosi cały Projekt na żądanie.
- **Group** nie ma własnej transformacji. Dzieci trzymają współrzędne Canvas, a Box Group to obrys dzieci. Krycie Group działa jak w CSS. Oba renderery rysują to samo.
- **Edytor**: Cmd+G / Cmd+Shift+G, zaznaczanie wewnątrz Group (dwuklik, Cmd+klik, Escape), przesuwanie, proporcjonalna zmiana rozmiaru i obrót Group jako jeden krok cofania, lista Layerów jako zwijane drzewo z drag and drop, Inspector dla Group i nowych pól tekstu.
- **Agenci**: `layer group` / `layer ungroup` w CLI, `inspect` jako drzewo, zaktualizowane `docs/agents/bannerkit.md` i JSON Schema.
- UI Guides dochodzi w M3 (#4). W M2 Guides są tylko w schemacie i przeżywają każdą zmianę Dokumentu.

## User Stories

1. Jako projektant chcę zgrupować zaznaczone Layery skrótem Cmd+G, żeby traktować je jak jedną całość.
2. Jako projektant chcę rozgrupować Group skrótem Cmd+Shift+G, żeby znów edytować Layery osobno, bez zmiany ich położenia.
3. Jako projektant chcę mieć przyciski grupowania i rozgrupowania, żeby nie musieć pamiętać skrótów.
4. Jako projektant chcę, żeby po zgrupowaniu zaznaczona była nowa Group, a po rozgrupowaniu jej byłe dzieci, żeby od razu działać dalej.
5. Jako projektant chcę, żeby kliknięcie na Canvas zaznaczało całą Group, żeby przesuwać ją jednym ruchem.
6. Jako projektant chcę dwuklikiem wejść do Group i zaznaczyć dziecko pod kursorem, żeby poprawić jeden element bez rozgrupowywania.
7. Jako projektant chcę kolejnym dwuklikiem wchodzić głębiej w zagnieżdżone Group, a na tekście zacząć edycję treści.
8. Jako projektant chcę Cmd+klikiem zaznaczyć od razu najgłębszy Layer, żeby nie klikać kilka razy.
9. Jako projektant chcę, żeby po wejściu do Group klik w inne jej dziecko zaznaczał to dziecko, a nie całą Group.
10. Jako projektant chcę Escape przy zaznaczonym dziecku wrócić do zaznaczenia jego Group.
11. Jako projektant chcę przesunąć Group myszą, strzałkami albo polami `x`/`y` w Inspectorze, a cofnięcie ma to odwrócić jednym krokiem.
12. Jako projektant chcę proporcjonalnie zmienić rozmiar Group narożnym uchwytem, żeby powiększyć cały blok razem z tekstem.
13. Jako projektant chcę obrócić Group wokół jej środka, a cofnięcie ma to odwrócić jednym krokiem.
14. Jako projektant chcę ustawić krycie Group tak, żeby nachodzące na siebie dzieci nie prześwitywały przez siebie, tak jak w CSS.
15. Jako projektant chcę ukryć albo zablokować Group jednym przełącznikiem, żeby działało to na wszystkie jej dzieci.
16. Jako projektant chcę nadać Group nazwę, żeby rozpoznać ją na liście Layerów.
17. Jako projektant chcę widzieć Layery jako zwijane drzewo, żeby ogarnąć Dokument z wieloma Group.
18. Jako projektant chcę przeciągnąć Layer na liście do Group, z Group albo między poziomami, żeby zmienić strukturę bez JSON-a.
19. Jako projektant chcę, żeby zaznaczenie dziecka na Canvas rozwijało jego Group na liście, żeby widzieć, co jest zaznaczone.
20. Jako projektant chcę, żeby nowy Layer dodany przy zaznaczonym dziecku trafiał do tej samej Group, tuż nad nim.
21. Jako projektant chcę zduplikować Group razem z całą zawartością, z nowymi id.
22. Jako projektant chcę usunąć Group razem z dziećmi jednym krokiem.
23. Jako projektant chcę, żeby Group, z której wyniosłem ostatnie dziecko, znikała sama, a nie zostawała pusta i błędna.
24. Jako projektant chcę widzieć w Inspectorze, że Layer jest zablokowany albo ukryty przez swoją Group.
25. Jako projektant chcę zaznaczyć Group razem z innymi Layerami i zmienić im krycie, widoczność albo położenie naraz.
26. Jako projektant chcę ustawić tekst na WERSALIKI albo małe litery bez przepisywania treści, żeby zmieniać styl jednym kliknięciem.
27. Jako projektant chcę, żeby AutoFit i łamanie wierszy liczyły się na tekście po transformacji, żeby wersaliki mieściły się w Boxie tak, jak je widać.
28. Jako projektant chcę edytować na Canvas oryginalny tekst, a nie jego wersaliki, żeby nie stracić wielkości liter.
29. Jako projektant chcę włączyć kursywę przełącznikiem, gdy dla danej grubości jest plik kursywy.
30. Jako projektant chcę, żeby przełącznik kursywy był nieaktywny, gdy fontu kursywy nie ma, zamiast pochylać tekst sztucznie.
31. Jako projektant chcę, żeby eksport z przeglądarki i Render z serwera wyglądały tak samo dla Group z kryciem, wersalików i kursywy.
32. Jako projektant chcę otwierać stare Dokumenty v1 bez żadnej migracji i bez zmian na dysku, dopóki czegoś nie zmienię.
33. Jako projektant chcę, żeby zmiana rozmiaru Canvas z Anchor przesuwała też Guides zapisane w Dokumencie.
34. Jako agent chcę zapisać Group w JSON-ie z dziećmi we współrzędnych Canvas, żeby edytować każdy Layer bez przeliczania przodków.
35. Jako agent chcę, żeby `validate` zgłaszał pustą Group, powtórzone id w drzewie i kursywę bez pliku, z podpowiedzią.
36. Jako agent chcę, żeby pole v2 w pliku v1 dawało błąd z podpowiedzią o `version: 2` i `bannerkit migrate`.
37. Jako agent chcę, żeby ścieżki błędów wskazywały Layer w drzewie (`layers[1].layers[0].fontWeight`).
38. Jako agent chcę zgrupować Layery poleceniem `bannerkit layer group … --json` i dostać id nowej Group.
39. Jako agent chcę rozgrupować Group poleceniem `bannerkit layer ungroup … --json` i dostać id byłych dzieci.
40. Jako agent chcę, żeby `inspect` pokazywał drzewo Layerów z obrysem każdej Group i zaznaczeniem, żeby rozumieć strukturę.
41. Jako agent chcę, żeby Selection mogła zawierać id Group, żeby „to zaznaczone” działało także dla Group.
42. Jako agent chcę, żeby `inspect` pokazywał wiersze tekstu po transformacji, żeby widzieć to, co wyrenderuje się na obrazie.
43. Jako agent chcę podnieść cały Projekt do v2 poleceniem `bannerkit migrate --json` i dostać listę zmienionych, niezmienionych i niepoprawnych plików.
44. Jako agent chcę, żeby `validate`, `inspect`, `preview` i `render` nie przepisywały pliku v1 i nie wywoływały live reload.
45. Jako agent chcę zapisać Guides w Dokumencie, żeby projektant zobaczył je w M3, a Render ich nie rysował.
46. Jako agent chcę mieć w `docs/agents/bannerkit.md` i w JSON Schema pełny opis v2, żeby pisać poprawne pliki za pierwszym razem.
47. Jako opiekun projektu chcę, żeby testy zgodności Renderów i łamania wierszy obejmowały Group z kryciem, wersaliki i kursywę.

## Implementation Decisions

### Prefactor: drzewo Layerów w core
- Zanim zmieni się schemat, core dostaje funkcje do chodzenia po drzewie Layerów: przejście w kolejności rysowania (z rodzicem, pozycją w rodzicu i ścieżką), szukanie Layera po id, podmiana Layera w drzewie i ścieżka w formacie Issues.
- Wszystkie miejsca, które dziś iterują po `document.layers` (reguły walidacji, reguły fontów, `inspect`, ostrzeżenia o brakujących Assetach przy zapisie, zmiana rozmiaru Canvas, `nextLayerId`, akcje listy Layerów, Selection), przechodzą na te funkcje. Na płaskim Dokumencie v1 zachowanie się nie zmienia.

### Schemat v2
- `version: 2`. Schemat v1 zostaje zamrożony i nadal sprawdza pliki z `version: 1`. Pole z v2 w pliku v1 to błąd z podpowiedzią „wymaga `version: 2`; uruchom `bannerkit migrate`”.
- Layer `group`: `id`, `type: "group"`, `name?`, `visible?`, `locked?`, `opacity?` oraz `layers` (dzieci, od dołu do góry). Nie ma `x`, `y`, `width`, `height`, `rotation` ani `shadow`. Zagnieżdżanie do dowolnej głębokości.
- Reguły walidacji: pusta Group to błąd; unikalność `id` obejmuje całe drzewo; kursywa bez pliku w manifeście to błąd z listą grubości, które mają kursywę.
- Tekst: `textTransform?: "none" | "uppercase" | "lowercase"` (bez `capitalize`) oraz `fontStyle?: "normal" | "italic"`. Wartości domyślne usuwają klucz, jak w v1.
- Dokument: `guides?: { x: number[], y: number[] }`. Obie tablice są wymagane, mogą być puste, liczby skończone, we współrzędnych Canvas. Kolejność i duplikaty są dozwolone. Guides nigdy nie trafiają do Renderu.
- `layout` na Group jest zarezerwowany na przyszły auto layout i **nie** wchodzi do v2.
- Ścieżki Issues dla dzieci: `layers[1].layers[0].fontWeight`.
- `nextLayerId` liczy po całym drzewie, Group dostaje `group-<n>`.

### Migracja
- `validateDocument` i odczyt Dokumentu na serwerze zawsze zwracają v2. Podniesienie v1 to zmiana samego `version`.
- Każdy zapis pisze `version: 2`. `doc new` i `doc duplicate` tworzą v2. Pozostałe zapisy zmian (autosave edytora, `doc resize`, `layer group`/`ungroup`) zapisują v2.
- Samo otwarcie w edytorze, `validate`, `inspect`, `preview` i `render` nie przepisują pliku i nie wywołują live reload.
- REST GET zwraca podniesiony Dokument i hash bajtów z dysku, więc zapis z `expectedHash` i konflikt 409 działają bez zmian. Panel JSON przyjmuje v1 i v2.
- `bannerkit migrate <project> [--json]` → `{ project, migrated: [{ name, path }], unchanged: [{ name, path }], invalid: [{ name, path, errors }] }`. Niepoprawnych plików v1 nie zapisuje; exit 1, gdy jakiś jest niepoprawny. Jest idempotentne. `$schema` zostaje.

### Box Group i geometria
- Box Group to osiowy obrys `boxExtent` wszystkich dzieci (także ukrytych), liczony rekurencyjnie i na bieżąco. Czysta funkcja w core.
- Przesunięcie Group to przesunięcie każdego liścia o tę samą deltę.
- Proporcjonalna zmiana rozmiaru Group (czysta funkcja w core): skala jednorodna względem punktu zaczepienia. Skaluje `x`/`y` (względem punktu), `width`, `height`, `fontSize`, `autoFit.minFontSize`, `letterSpacing`, `cornerRadius`, `shadow.blur`, `shadow.offsetX/Y`. Rotacje dzieci zostają. Zaokrąglanie: pola Boxa do pełnych px, pozostałe do 0,1.
- Obrót Group (czysta funkcja w core): środek każdego dziecka obraca się wokół środka Boxa Group, a dziecko dostaje `rotation += kąt`. Zaokrąglanie rotacji do 0,1°, pozycji do pełnych px.
- Zmiana rozmiaru Canvas z Anchor przesuwa wszystkie liście drzewa i wszystkie Guides o tę samą deltę.

### Tekst
- Text Layout w core stosuje `textTransform` przed pomiarem (`toUpperCase`/`toLowerCase` bez locale). AutoFit, łamanie wierszy i `inspect` (`lines[].text`) używają tekstu przekształconego. W Dokumencie zostaje tekst oryginalny.
- `FontSpec` w pomiarze dostaje `style`. Oba renderery rysują kursywę z pliku. Nigdy nie pochylamy tekstu sztucznie (ADR 0003).
- Manifest fontów: `style: "normal" | "italic"`, unikalność po `family/weight/style`. Do repo dochodzą pliki Inter Italic we wszystkich grubościach (OFL), z tego samego wydania Inter co obecne.
- Edytor: Textbox pokazuje tekst przekształcony. W trakcie edycji na Canvas pokazuje oryginalny, a po wyjściu z edycji zapisuje wpisany tekst i znów pokazuje transformację.

### Renderery
- Serwer (skia-canvas) rysuje Group rekurencyjnie. Group z `opacity < 1` rysuje dzieci na pomocniczą powierzchnię w skali rysowania i nakłada ją z `globalAlpha`. Group z `opacity` 1 rysuje dzieci bezpośrednio.
- Edytor (Fabric): każda Group to jeden `fabric.Group` z dziećmi w środku, z wymuszonym cache obiektu, żeby krycie złożyło się na jednej powierzchni. Mapper przelicza współrzędne dziecka przez transformację Group w obie strony. Po commicie transformacji Group dzieci dostają pola bezwzględne, a Group jest odbudowywana z transformacją jednostkową. Eksport z przeglądarki używa tej samej sceny.
- `visible: false` na Group pomija całe poddrzewo w obu rendererach.

### Operacje (core + CLI)
- Czyste funkcje w core:
  - `group(ids)` tworzy Group w miejscu najwyższego zaznaczonego Layera i zachowuje kolejność dzieci;
  - `ungroup(id)` wstawia dzieci w miejsce Group bez zmiany ich współrzędnych;
  - `moveIntoGroup` i `moveOutOfGroup` zmieniają rodzica i pozycję w stosie.
- Grupować można tylko Layery z jednego rodzica (co najmniej jeden). Przy różnych rodzicach operacja zwraca błąd.
- Operacja, która zostawiłaby pustą Group, usuwa ją w tym samym kroku.
- Duplikat Group kopiuje poddrzewo z nowymi id dla wszystkich potomków. Usunięcie Group usuwa poddrzewo.
- CLI z `--json`:
  - `layer group <project> <doc> <ids…> [--name N]` → wynik jak w `doc new` plus `id` nowej Group;
  - `layer ungroup <project> <doc> <id>` → wynik jak w `doc new` plus `ids` byłych dzieci.

  Nieznane id daje `NOT_FOUND`. Różni rodzice albo `ungroup` na Layerze, który nie jest Group, dają `INVALID_INPUT`. Zapis jest bezwarunkowy, jak w `doc resize`.
- `inspect`: wpis Group to `{ index, id, type: "group", name?, extent, placement, selected, layers: [...] }`, zagnieżdżony; `index` to pozycja w rodzicu. W tekście wcięcie według głębokości. Ostrzeżenie „poza Canvas” dotyczy tylko liści.
- Selection zapisana dla agentów może zawierać id dowolnego Layera w drzewie, także Group.

### Edytor
- **Kształt Selection**: Layery mogą pochodzić z różnych rodziców, ale nigdy przodek razem z potomkiem. Zaznaczenie dziecka zdejmuje przodka i odwrotnie.
- **Kliknięcia**:
  - klik zaznacza najwyższą Group nad trafionym Layerem;
  - gdy zaznaczone jest dziecko Group G, klik w inne dziecko G zaznacza je;
  - dwuklik na zaznaczonej Group zaznacza dziecko pod kursorem (poziom niżej), a dwuklik na zaznaczonym tekście startuje edycję;
  - Cmd+klik zaznacza najgłębszy Layer;
  - Shift+klik dodaje do Selection w bieżącym kontekście;
  - Escape przy zaznaczonym dziecku zaznacza jego Group;
  - zaznaczanie prostokątem łapie Layery najwyższego poziomu.
- **Dziedziczenie flag**: Layer jest efektywnie zablokowany albo ukryty, gdy on albo którykolwiek przodek jest. Na Canvas nie jest trafiany. Z listy da się go zaznaczyć, ale nie ma uchwytów.
- **Skróty**: Cmd+G grupuje (Selection to potem nowa Group), Cmd+Shift+G rozgrupowuje każdą zaznaczoną Group (Selection to potem byłe dzieci). Do tego przyciski. Oba skróty blokują domyślne zachowanie przeglądarki. Nowa Group nie ma `name`.
- **Transformacje Group**: przesunięcie (mysz, strzałki), proporcjonalna zmiana rozmiaru (tylko narożne uchwyty) i obrót zmieniają pola dzieci przez funkcje z core i są jednym krokiem cofania i jednym `change`.
- **Nowe Layery**: przy zaznaczonym dziecku trafiają do tego samego rodzica, tuż nad najwyższym zaznaczonym. Przy zaznaczonej Group trafiają nad nią, na jej poziom. Bez Selection trafiają na szczyt korzenia.
- **Lista Layerów**: zwijane drzewo. Zwinięcie to stan UI na czas sesji, domyślnie rozwinięte. Zaznaczenie na Canvas rozwija przodków. Strefy upuszczania: góra i dół wiersza wstawiają przed lub za nim w jego rodzicu, środek wiersza Group wstawia na szczyt jej dzieci. Nie można upuścić Group w jej potomku. Przeciąganie pojedynczego wiersza.
- **Inspector**:
  - Group: `name` (puste usuwa klucz), `opacity`, `visible`, `locked`, `x`/`y` Boxa (przesuwają dzieci), `width`/`height` tylko do odczytu, bez `rotation`;
  - kilka Layerów z Group: `opacity`, `visible`, `locked` i `x`/`y` Selection Box;
  - dziecko zablokowanej albo ukrytej Group: pokazuje własną flagę i informację, że blokuje/ukrywa je Group;
  - tekst: `textTransform` jako przełącznik segmentowy, `fontStyle` jako przełącznik kursywy (nieaktywny bez pliku kursywy); oba ze stanem Mixed.
- Edytor zachowuje `guides` przy każdym kroku, choć ich jeszcze nie pokazuje.

### Dokumentacja i przykłady
- `docs/agents/bannerkit.md` opisuje schemat v2, Group, nowe pola tekstu, Guides, `migrate`, `layer group/ungroup` i drzewo w `inspect`. Każdy ticket aktualizuje swoją część.
- JSON Schema jest generowany na nowo z v2.
- `examples/demo/documents/hero.json` zostaje w v1 (sprawdza odczyt v1). Nowy Dokument demo w v2 pokazuje Guides, Group z kryciem, wersaliki i kursywę.

## Testing Decisions

- Testujemy zachowanie zewnętrzne: wejście i wyjście czystych funkcji core, wynik CLI `--json`, piksele Renderu, zdarzenia i Dokument edytora. Nie testujemy wewnętrznej struktury obiektów Fabric.
- **Core** (Vitest, wzór: `validate.test.ts`, `resize.test.ts`, `textLayout.test.ts`): walidacja v1 i v2 (pola v2 w v1, pusta Group, id w drzewie, kursywa bez pliku, ścieżki Issues), podniesienie v1, funkcje drzewa, `group`/`ungroup`/`moveIntoGroup`/`moveOutOfGroup` (kolejność, współrzędne, usuwanie pustej Group), Box Group, skala i obrót Group, Anchor z Guides, `textTransform` w Text Layout i AutoFit.
- **Serwer** (wzór: `cli.test.ts`, `documents.test.ts`, `snapshot.test.ts`, `inspect.test.ts`): `migrate` (v1 nietknięty, dopóki nie wywołasz komendy; `validate`/`inspect`/`preview`/`render` nie piszą), `layer group`/`ungroup` z kodami błędów, `inspect` jako drzewo, snapshoty Renderu dla Group z kryciem i nachodzącymi dziećmi, wersalików i kursywy.
- **Edytor** (jsdom z prawdziwym edytorem, wzór: `interaction.test.ts`, `editor-harness.ts`, `inspector-harness.tsx`): klik, dwuklik, Cmd+klik, Escape; przesunięcie, skala i obrót Group jako jeden `change`; Cmd+G / Cmd+Shift+G; Inspector Group i pól tekstu; zachowanie `guides`; edycja tekstu z `textTransform`.
- **E2E** (Playwright, wzór: `parity.spec.ts`, `layers.spec.ts`): zgodność przeglądarka ↔ serwer dla Group z kryciem < 1 i nachodzącymi dziećmi, wersalików i kursywy; drag and drop w drzewie Layerów.
- Test zgodności łamania wierszy z Fabric (ADR 0004) obejmuje `textTransform` i kursywę.

## Out of Scope

- UI Guides i Snapping (M3, #4).
- Auto layout w Group (`layout`; osobne badanie i ADR).
- Nieproporcjonalna zmiana rozmiaru Group.
- `capitalize`, podkreślenie, `wordSpacing`, obrys tekstu, rich text.
- Przeciąganie wielu wierszy naraz na liście Layerów.
- Polecenia CLI do przenoszenia Layerów między Group (agenci edytują JSON).

## Further Notes

- Spec #2 (M1) jest zamknięty, więc M2 nie ma blokad zewnętrznych.
- M3 (#4) zakłada Group przy Align i Distribute oraz `guides` z tego specu.
