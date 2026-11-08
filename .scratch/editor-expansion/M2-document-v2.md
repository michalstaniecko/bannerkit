# Spec M2: Dokument v2 (Group, nowe właściwości tekstu, Guides)

**Blokowane przez:** M1

## Problem

Nie da się połączyć kilku Layerów w nazwaną całość, która przesuwa się, ukrywa i blokuje razem. Tekst nie ma wersalików ani kursywy. Schemat v1 jest zamrożony, więc każda z tych rzeczy wymaga nowej wersji Dokumentu.

## Rozwiązanie

Dokument v2 dodaje Layer typu `group`, pola tekstu `textTransform` i `fontStyle` oraz `guides` na poziomie Dokumentu. Model jest opisany w ADR 0007 (Group bez własnej transformacji, v2 jako nadzbiór v1, leniwa migracja). Edytor dostaje grupowanie, drzewo na liście Layerów i zaznaczanie wewnątrz Group. Pola `guides` pojawiają się w schemacie, a ich UI dochodzi w M3.

## Decyzje

### Schemat v2
- `version: 2`.
- Layer `group`: `id`, `type: "group"`, `name?`, `visible?`, `locked?`, `opacity?` oraz `layers` (dzieci, od dołu do góry). Nie ma `x/y/width/height/rotation/shadow`. Zagnieżdżanie do dowolnej głębokości. Pusta Group jest błędem walidacji.
- Dzieci mają współrzędne bezwzględne w px Canvas. Box Group to obrys Boxów dzieci (osiowy obrys obróconych), liczony na bieżąco.
- Krycie Group jak w CSS: dzieci są rysowane na jedną powierzchnię i dopiero ona dostaje `opacity`. `visible: false` lub `locked: true` na Group działa na całe poddrzewo.
- Tekst: `textTransform?: "none" | "uppercase" | "lowercase"` (bez `capitalize`). Text Layout w core stosuje transformację przed pomiarem, więc AutoFit i łamanie wierszy liczą się na przekształconym tekście. W Dokumencie zostaje tekst oryginalny.
- Tekst: `fontStyle?: "normal" | "italic"`. Kursywa wymaga pliku w `fonts/fonts.json` dla danej rodziny i grubości. Bez niego jest błąd walidacji z podpowiedzią. Nigdy nie pochylamy tekstu sztucznie (ADR 0003). Do repo dochodzą pliki Inter Italic we wszystkich grubościach (OFL).
- Dokument: `guides?: { x: number[], y: number[] }` we współrzędnych Canvas. Nigdy nie trafiają do Renderu.
- Unikalność `id` obejmuje całe drzewo.
- `layout` na Group jest zarezerwowany na przyszły auto layout i **nie** wchodzi do v2.

### Migracja
- Core czyta v1 i v2. v1 jest podnoszony do v2 w pamięci.
- Plik zapisuje się jako v2 dopiero przy zapisie zmiany. Samo otwarcie, `validate`, `inspect`, `preview` i `render` nie przepisują go na dysku i nie wywołują live reload.
- `bannerkit migrate <project>` podnosi wszystkie Dokumenty Projektu i zwraca listę zmienionych plików (`--json`).
- Generowany JSON Schema i `docs/agents/bannerkit.md` są zaktualizowane do v2.

### Renderery
- Oba renderery (Fabric w przeglądarce, skia-canvas na serwerze) rysują Group rekurencyjnie, z kryciem złożonym na powierzchni pośredniej. Test zgodności Renderów obejmuje Group z kryciem < 1, w której dzieci na siebie zachodzą.
- `textTransform` i `fontStyle` są objęte testem zgodności łamania wierszy z Fabric (ADR 0004).

### Operacje (core + CLI)
- Czyste funkcje w core: `group(ids)` tworzy Group w miejscu najwyższego zaznaczonego Layera i zachowuje kolejność dzieci; `ungroup(id)` wstawia dzieci w miejsce Group bez zmiany ich współrzędnych; `moveIntoGroup` i `moveOutOfGroup` zmieniają rodzica i pozycję w stosie.
- Grupować można tylko Layery z tego samego rodzica. Przy różnych rodzicach operacja zwraca błąd.
- CLI z `--json`: `layer group <project> <doc> <ids…> [--name N]` i `layer ungroup <project> <doc> <id>`.
- Selection zapisana dla agentów może zawierać id Group. `inspect` pokazuje drzewo.

### Edytor
- Cmd+G grupuje, Cmd+Shift+G rozgrupowuje (oraz przyciski).
- Kliknięcie na Canvas zaznacza najwyższą Group nad trafionym Layerem. Dwuklik albo Cmd+klik zaznacza bezpośrednio dziecko. Kolejny dwuklik wchodzi poziom głębiej.
- Przesuwanie, zmiana rozmiaru i obrót Group zmieniają pola dzieci (obrót wokół wspólnego środka) jako jeden krok cofania.
- Lista Layerów to zwijane drzewo z drag and drop do Group, z Group i między poziomami.
- Inspector: dla Group nazwa, `opacity`, `visible`, `locked` oraz `x/y` obrysu (przesuwają dzieci). Dla tekstu dochodzą `textTransform` i `fontStyle`.

## Kryteria akceptacji
- [ ] Schemat v2 z Group, `textTransform`, `fontStyle` i `guides`; walidacja: unikalne id w drzewie, pusta Group, kursywa bez pliku.
- [ ] Inter Italic (wszystkie grubości) w `fonts/` i w manifeście.
- [ ] Odczyt v1 → v2 w pamięci, zapis jako v2 dopiero przy zmianie, `bannerkit migrate --json`.
- [ ] Oba renderery rysują Group (z kryciem), `textTransform` i kursywę, a testy zgodności Renderów i łamania wierszy przechodzą.
- [ ] Funkcje w core i CLI `layer group` / `layer ungroup` z `--json`; `inspect` pokazuje drzewo.
- [ ] Edytor: skróty, zaznaczanie w Group, transformacje Group jako jeden krok cofania, drzewo z drag and drop, Inspector dla Group i nowych pól tekstu.
- [ ] Zaktualizowane `docs/agents/bannerkit.md` i wygenerowany JSON Schema.

## Testy
- Core: walidacja v2, migracja, `group`/`ungroup`/przenoszenie (zachowanie kolejności i współrzędnych), obrys Group, `textTransform` w Text Layout.
- Render: zgodność przeglądarka ↔ serwer dla Group z kryciem i dla kursywy.
- Web: zaznaczanie kliknięciem i dwuklikiem, przesunięcie i obrót Group jako jeden `change`, drag and drop na liście.
- CLI: `migrate` (v1 zostaje nietknięty, dopóki nie wywołasz komendy), `layer group/ungroup`.

## Poza zakresem
- UI Guides i Snapping (M3).
- Auto layout w Group (osobne badanie i ADR).
- `capitalize`, podkreślenie, `wordSpacing`, obrys tekstu, rich text.
