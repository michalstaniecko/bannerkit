# Spec M1: UI na tokenach, Inspector i zmiana rozmiaru Canvas

## Problem

Edytor to goły HTML (`styles.css`: „no UI styling”). Poza dodawaniem, usuwaniem, duplikowaniem i przesuwaniem myszą Layer da się edytować tylko przez panel JSON. Dotyczy to też istniejących właściwości tekstu (`fontSize`, `lineHeight`, `letterSpacing`, `align`, `verticalAlign`, `autoFit`). Rozmiar Canvas ustawia się tylko przy tworzeniu Dokumentu (Preset albo „Duplicate to size”).

## Rozwiązanie

Podstawa UI zbudowana na tokenach, z której będą korzystać kolejne etapy. Nowy układ okna z panelem **Inspector**, który edytuje każdą właściwość Selection albo Dokumentu. Zmiana rozmiaru Canvas na otwartym Dokumencie, z **Anchor**, w edytorze i w CLI. Bez zmiany schematu Dokumentu (v1).

## Decyzje

### Tokeny i komponenty
- Tokeny to CSS custom properties w jednym pliku i w dwóch warstwach: **prymitywne** (`--color-gray-100`, `--space-2`, `--radius-1`, `--font-size-sm`, …) i **semantyczne** (`--surface-panel`, `--text-muted`, `--border-subtle`, `--accent`, …). Komponenty używają tylko tokenów semantycznych.
- Jeden jasny motyw. Ciemny ma się dać dodać później przez podmianę samej warstwy semantycznej, bez zmian w komponentach.
- Bez Tailwinda, bez biblioteki komponentów i bez Style Dictionary.
- Własny mały zestaw komponentów: Button, IconButton, NumberField (przeciąganie myszą po etykiecie zmienia wartość; strzałki: ±1, z Shiftem ±10), Select, ColorField, Panel/Section.
- Ikony z `lucide-react`.
- UI używa fontu systemowego. Inter zostaje fontem treści banerów.

### Układ okna
- Górny pasek: Projekt, Dokument, zoom, eksport, akcje Layerów.
- Po lewej lista Layerów.
- Na środku Canvas. Linijki dojdą w M3, więc układ zostawia na nie miejsce.
- Po prawej **Inspector**. Dzisiejszy panel JSON staje się w nim przełączaną zakładką.

### Inspector
- Nic nie jest zaznaczone: właściwości Dokumentu, czyli szerokość i wysokość Canvas, Anchor 3×3 oraz tło.
- Jeden Layer: `x`, `y`, `width`, `height`, `rotation`, `opacity`, `visible`, `locked`, cień oraz pola danego typu:
  - `rect`: `fill` (kolor albo LinearGradient), `cornerRadius`;
  - `image`: `fit`;
  - `text`: `fontFamily`, `fontWeight`, `fontSize`, `lineHeight` (mnożnik), `letterSpacing` (px), `fill`, `align`, `verticalAlign`, `autoFit.minFontSize`. Treść tekstu edytuje się dalej na Canvas.
- Przy włączonym AutoFit pole `fontSize` edytuje rozmiar zadeklarowany (maksymalny). Obok, tylko do odczytu, widać rozmiar faktycznie użyty, wzięty z Text Layout.
- Kilka zaznaczonych Layerów: pole z różnymi wartościami pokazuje „Mixed”, a wpisanie wartości ustawia ją wszystkim zaznaczonym. `x` i `y` dotyczą wspólnego Boxa i przesuwają całość. `width` i `height` są nieaktywne. Pokazujemy tylko pola wspólne dla typów w zaznaczeniu.
- Każda zmiana wartości to jeden krok cofania, który przechodzi zwykłą ścieżką `change` (autosave, live reload, konflikt 409). Przeciąganie po etykiecie NumberField to też jeden krok, liczony od puszczenia przycisku.

### Zmiana rozmiaru Canvas
- Czysta funkcja w `@bannerkit/core`: nowe `width`/`height` i Anchor (jeden z 9 punktów). Layery zachowują przesunięcie w px względem Anchor i **nigdy się nie skalują**. Mogą wystawać poza Canvas i wtedy są przycinane.
- Limity jak dziś (`MAX_CANVAS_SIDE`, liczby całkowite ≥ 1).
- W edytorze: uchwyty na krawędziach i narożnikach Canvas. Przeciąganie krawędzi zaczepia krawędź przeciwną, przeciąganie narożnika zaczepia narożnik przeciwny. Wartość i Anchor można też ustawić w Inspectorze.
- CLI: `doc resize <project> <doc> --size WxH [--anchor top-left|top|top-right|left|center|right|bottom-left|bottom|bottom-right]`. Domyślny Anchor to `top-left`. Zwraca to samo co `doc new`. Polecenie trafia do opisu w `docs/agents/bannerkit.md`.

## Kryteria akceptacji
- [ ] Plik tokenów z warstwą prymitywną i semantyczną. Żaden komponent nie używa koloru, odstępu ani promienia na sztywno (sprawdza to test lub lint, który szuka literałów kolorów w CSS komponentów).
- [ ] Komponenty Button, IconButton, NumberField, Select, ColorField i Panel/Section; NumberField obsługuje przeciąganie, strzałki i Shift.
- [ ] Nowy układ: górny pasek, lista Layerów, Canvas, Inspector, a panel JSON jako zakładka Inspectora.
- [ ] Inspector edytuje każde pole schematu v1 dla każdego typu Layer i dla Canvas.
- [ ] „Mixed” i zmiana wartości wielu Layerów naraz; `x`/`y` przesuwają wspólny Box.
- [ ] AutoFit: widać rozmiar zadeklarowany i rozmiar użyty.
- [ ] Zmiana rozmiaru Canvas: funkcja w core z testami dla wszystkich 9 punktów Anchor, uchwyty w edytorze, pola w Inspectorze i `bannerkit doc resize --json`.
- [ ] Każda zmiana z Inspectora i ze zmiany rozmiaru to dokładnie jeden krok cofania i jedno zdarzenie `change`.
- [ ] Istniejące testy (w tym e2e i zgodność Renderów) przechodzą.

## Testy
- Core: zmiana rozmiaru z Anchor jako czysta funkcja (Vitest).
- Web: Inspector w jsdom, czyli zmiana pola → Dokument → krok cofania; „Mixed”; AutoFit. Uchwyty Canvas przez prawdziwe zdarzenia myszy, jak w `interaction.test.ts`.
- CLI: `doc resize` w harnessie S1.
- E2E (Playwright): edycja `letterSpacing` w Inspectorze zmienia Render.

## Poza zakresem
- Zmiany schematu (M2), Group (M2), linijki, Guides, Snapping, Align i Distribute (M3).
- Skalowanie układu do nowego rozmiaru.
- Ciemny motyw.
