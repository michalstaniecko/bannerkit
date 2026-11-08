# Research: Bannerkit jako aplikacja desktopowa (Electron)

Status: moved to GitHub — https://github.com/michalstaniecko/bannerkit/issues/1 (the issue is the source of truth; this file is an archive)

Pytanie: czy Bannerkit (spec: `.scratch/bannerkit-v1/spec.md`) da się dostarczyć jako aplikację Electron, która uruchamia się jak zwykła aplikacja na Windows, macOS i Ubuntu, a lokalnie udostępnia sterowanie agentowi AI: teraz przez pliki JSON, w przyszłości przez lokalny serwer MCP.

Odpowiedź wstępna: **tak**. Architektura v1 dobrze do tego pasuje, nic nie trzeba przepisywać. Dochodzi nowa warstwa `packages/desktop`. Kilka rzeczy (głównie Windows, Ubuntu i spójność renderów) wymaga świadomych decyzji. Ten dokument zbiera ustalenia do dalszego badania. Nie jest to jeszcze specyfikacja.

## Dlaczego to pasuje

- **Hono serwuje edytor, API i Assety z jednego adresu (US 70).** Okno Electrona może wczytać `http://127.0.0.1:<port>`. REST, SSE i ładowanie obrazów z tego samego originu działają bez zmian.
- **Warstwa ops (ADR 0005)** to czyste funkcje Node bez `console` i `process.exit`. Główny proces Electrona może je wywoływać bezpośrednio, tak jak CLI i REST.
- **Chromium w zestawie.** Electron ma ten sam silnik na wszystkich trzech systemach, a Fabric i testy S3 i tak zakładają Chromium. Tauri odrzucone: używa WebKit na macOS i Linuksie, a serwer Node z skia-canvas i sharp musiałby działać jako osobny proces dodatkowy.
- **Natywne zależności używają N-API.** sharp 0.35 (`@img/sharp-<platform>`) i skia-canvas 4 (`@skia-canvas/<platform>`) mają gotowe binarki jako zależności opcjonalne dla każdej platformy. Nie trzeba ich przebudowywać pod ABI Electrona.

## Proponowany kształt

1. **Proces główny Electrona** uruchamia serwer Hono w tym samym procesie albo w `utilityProcess`. Serwer nasłuchuje na `127.0.0.1` na losowym porcie, a potem otwiera się `BrowserWindow` na ten adres. Okno: `contextIsolation: true`, `nodeIntegration: false`, preload niepotrzebny albo minimalny.
2. **Sterowanie przez pliki JSON** już istnieje w v1: Dokumenty na dysku, watcher z SSE i `.state.json`. Działa tak samo, gdy aplikacja jest uruchomiona. Do dodania: plik wykrywania, np. `<userData>/runtime.json` z `{ port, token, pid }`. Dzięki niemu agent wie, czy aplikacja działa, i może wywołać REST (np. „otwórz dokument X”).
3. **CLI dla agenta po spakowaniu.** Ten sam plik wykonywalny Electrona z `ELECTRON_RUN_AS_NODE=1` uruchamia zbudowany `cli.js`. Do tego skrypt w `PATH`, jak `code` w VS Code: `.cmd` na Windows, symlink na macOS, `/usr/bin` z paczki `.deb`. US 65 („CLI działa bez serwera”) pozostaje spełnione.
4. **MCP (v2).** Główna droga: **MCP przez stdio** jako trzeci adapter nad ops (`bannerkit mcp`, rejestrowany przez `claude mcp add`). Nie wymaga uruchomionej aplikacji. Opcjonalnie endpoint Streamable HTTP w Hono, gdy aplikacja działa, obowiązkowo z tokenem i sprawdzaniem nagłówków `Origin` i `Host` (ochrona przed DNS rebinding).

## Do rozwiązania

### Budowanie i pakowanie
- `packages/server/bin/bannerkit.js` uruchamia TypeScript przez `tsx`, a `@bannerkit/core` eksportuje `./src/index.ts`. Do Electrona trzeba to zbundlować do JS, np. esbuild z `sharp` i `skia-canvas` jako `external`.
- Natywne binarki muszą trafić do `asarUnpack`.
- Budować na każdym systemie osobno: macOS arm64/x64, Windows x64, Linux x64. Spec v1 mówi „There is no CI”, a tu potrzebna jest macierz w GitHub Actions. Pakowanie krzyżowe przez `supportedArchitectures` w pnpm jest możliwe, ale bardziej kruche.
- Narzędzie: electron-builder albo Electron Forge (do wyboru). Formaty: dmg, NSIS na Windows, `.deb` i ewentualnie AppImage na Ubuntu.

### Ścieżki i lokalizacja danych
- Domyślne `./projects` zależy od katalogu roboczego, który w spakowanej aplikacji nic nie znaczy. Potrzebny jest domyślny katalog, np. `~/Documents/Bannerkit` przez `app.getPath('documents')`, który wskazuje też CLI. `--root` i `BANNERKIT_ROOT` zostają.
- Fonty (`fonts/fonts.json` i TTF) trafiają do `process.resourcesPath`. `FontLibrary.use()` z bezwzględnymi ścieżkami działa bez zmian.

### Windows
- `rename()` przy zapisie atomowym (`packages/server/src/ops/fs.ts`) potrafi rzucić `EPERM`/`EBUSY`, gdy plik trzyma antywirus, watcher albo edytor agenta. Potrzebna jest ponowna próba z odczekaniem.
- `fs.ts` używa też `link` (hard linków), których nie obsługują FAT i exFAT.
- Sanityzacja nazw plików musi odrzucać nazwy zarezerwowane (`CON`, `NUL`, `COM1`…), końcowe kropki i spacje. Do tego kolizje nazw różniących się tylko wielkością liter (dotyczy też macOS).
- Skrypt `UPDATE_SNAPSHOTS=1 vitest run` w głównym `package.json` nie zadziała w cmd/PowerShell. Rozwiązanie: `cross-env` albo flaga.
- Ścieżki są częściowo obsłużone (`split(sep).join('/')` w `validation.ts`, `\\` w `cli/main.ts`), ale trzeba to systematycznie przetestować.

### Ubuntu
- Ubuntu 24.04+ ogranicza przez AppArmor nieuprzywilejowane przestrzenie nazw, więc AppImage często nie wystartuje bez `--no-sandbox`. Paczka `.deb` (z `chrome-sandbox` z bitem SUID albo profilem AppArmor) jest bezpieczniejsza.
- Rekurencyjny `fs.watch` na Linuksie bywa zawodny, dochodzi limit `inotify`. Do rozważenia chokidar albo przynajmniej test e2e na Linuksie.

### Spójność renderów między systemami (największe ryzyko)
- Spec obiecuje, że wynik nie zależy od maszyny, a browser i serwer różnią się o mniej niż 1% pikseli (US 61). Wygładzanie i hinting glifów różnią się jednak między systemami: DirectWrite na Windows, CoreText na macOS, FreeType na Linuksie. Dotyczy to Chromium i, w mniejszym stopniu, skii.
- Dla podziału linii (US 32) ważniejsze są różnice w `measureText`. Słowo „na granicy” szerokości Boxa może się złamać inaczej na Windows niż na Macu.
- Kierunek: w `render` i `preview` traktować skia-canvas jako jedyne źródło prawdy (wynik zależy od binarki skii, nie od przeglądarki). Snapshoty S1 trzymać osobno dla każdego systemu albo z tolerancją, a test zgodności S3 uruchamiać na każdym systemie.
- Do zbadania: jak duże są faktyczne różnice `measureText` i rasteryzacji między systemami dla Inter (pomiar na korpusie z S3).

### Bezpieczeństwo lokalnego serwera
Istotne już w v1, nie tylko w Electronie.
- Każda strona otwarta w zwykłej przeglądarce może wysłać POST/PUT na `localhost:<port>`.
- Potrzebne są: nasłuch tylko na `127.0.0.1`, token sesji (przekazywany do okna Electrona i zapisywany w `runtime.json`) oraz sprawdzanie `Origin` i `Host`.

### Podpisywanie
- Bez notaryzacji Apple (99 USD rocznie) macOS ostrzega przez Gatekeeper, a Windows bez certyfikatu pokazuje SmartScreen. Do własnego użytku można pominąć, przy dystrybucji trzeba zaplanować.

## Wpływ na spec v1

- Wieloplatformowość to nowy wymóg. Spec v1 zakłada Apple Silicon (US 68), brak CI i `pnpm start` jako sposób uruchomienia.
- Dotyka US 61/62 (zgodność renderów), sanityzacji Assetów, zapisów atomowych i testów.
- Rekomendacja: dokończyć v1 w obecnym kształcie i dodać ADR 0007 „Desktop shell: Electron + loopback server + CLI shim”.
- Tanie rzeczy neutralne platformowo, które warto zrobić już w v1:
  - token i sprawdzanie `Origin`/`Host` w serwerze
  - ponowna próba `rename` przy zapisie atomowym
  - odrzucanie nazw zarezerwowanych w Windows przy sanityzacji
  - `cross-env` w skryptach
- Sama powłoka Electrona i MCP to v2.

## Szacunek

`packages/desktop` z bundlowaniem, pakowaniem na trzy systemy i skryptem CLI to kilka dni pracy. Najwięcej czasu zajmą CI, testy na Windows i Linuksie oraz dopięcie spójności renderów, a nie sam Electron.

## Otwarte pytania

- electron-builder czy Electron Forge?
- Serwer w procesie głównym czy w `utilityProcess` (izolacja awarii natywnych modułów vs prostota)?
- Instalacja skryptu CLI w `PATH`: automatycznie przy instalacji czy z menu aplikacji (jak „Install 'code' command” w VS Code)?
- Domyślny projects root: `~/Documents/Bannerkit` czy `userData`?
- Czy test zgodności browser vs serwer ma działać na wszystkich systemach, czy wystarczy jeden system referencyjny?
- Czy potrzebne jest macOS x64 (Intel), czy wystarczy arm64?
