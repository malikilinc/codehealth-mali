# codehealth — Astro (v5 / v6 / v7.4+) Geliştirme Planı ve Yapılan İşlemler Raporu

> **Proje Kaynağı:** Bu çalışma, [EsraMulkpinar/codehealth](https://github.com/EsraMulkpinar/codehealth) açık kaynak projesi temel alınarak **Astro** ekosistem desteğini kazandırmak amacıyla geliştirilmiştir. Test ve doğrulama süreçleri tamamlandığında asıl (upstream) projeye Pull Request (PR) olarak dahil edilmesi hedeflenmektedir.

---

## 1. Tespit Edilen Mevcut Durum (Sorun Analizi)

Orijinal `codehealth` (v1.1.1) kod tabanı incelendiğinde Astro projelerinin neden React üzerinden tarandığı tespit edildi:
1. **`src/scanner.ts` Dosya Filtresi:** `GLOB_PATTERNS` yalnızca `['**/*.tsx', '**/*.ts', '**/*.jsx', '**/*.js']` uzantılarını tarıyordu; `.astro` uzantılı dosyalar ve `astro.config.mjs` dosyaları tamamen atlanıyordu.
2. **Framework Profilleri (`src/rules/types.ts` & `src/profiles.ts`):** Yalnızca `react`, `next`, `react-native` ve `expo` profilleri tanımlıydı.
3. **İnteraktif Menü (`src/prompt.ts`):** Bayraksız çalıştırmada (`npx codehealth .`) imleç varsayılan olarak 1. sıradaki `React` üzerinde başlıyordu ve `package.json` üzerinden otomatik framework tespiti bulunmuyordu.
4. **Ayrıştırıcı (`src/parser.ts`):** `@typescript-eslint/typescript-estree` doğrudan çağrıldığı için `.astro` dosyalarının çok katmanlı yapısı (`---` frontmatter + HTML/JSX şablonu + `<style>` + `<script>`) doğrudan parse edilemiyordu.

---

## 2. Alınan Mimari Kararlar (`/grill-me` Tasarım Ağacı)

1. **Hibrit Tarama (`.astro` + React Adacıkları + Config):**
   - `--astro` profili seçildiğinde `.astro`, `.tsx`, `.ts`, `.jsx`, `.js` ve `astro.config.{mjs,mts,ts,js,cjs}` dosyaları birlikte taranır.
   - Astro'nun ürettiği `**/.astro/**` dizini (`scanner.ts` ve `watcher.ts` içinde) tarama dışı bırakıldı.
2. **Sıfır Ek Bağımlılıklı, 3 Katmanlı Gerçek AST Ayrıştırıcı (`src/astro-parser.ts`):**
   - Projeyi ağırlaştıracak harici WASM paketleri eklemek yerine, Astro 7'nin yeni katı HTML/JSX derleyici kurallarıyla uyumlu 3 katmanlı ayrıştırıcı geliştirildi:
     - **Katman 1 — Frontmatter (`--- ... ---`):** Satır numaraları birebir korunarak saf TypeScript AST'si olarak ayrıştırılır. Astro frontmatter'ına özgü üst seviye `return Astro.redirect(...)` ifadeleri satır kaydırmayan asenkron sarmalayıcı (`__astro_fm__`) ile desteklenir.
     - **Katman 2 — Template (HTML + JSX İfadeleri + Direktifler):** `<style>` ve `<script>` iç metinleri satır sonları (`\n`) korunarak boşluklarla maskelenir; `<!DOCTYPE>`, `<!-- yorum -->`, HTML void etiketleri (`<img>`, `<input>`, `<meta>`, `<link>`, `<br>`, `<hr>` vb.) ve Astro `{shorthand}` ifadeleri normalize edilerek `typescript-estree` JSX AST'sine dönüştürülür. JSX dışı sıra dışı HTML kullanımlarında dahi sahte `parse-error` fırlatmayan etiket bazlı yedek (fallback) ayrıştırıcı devreye girer.
     - **Katman 3 — Client `<script>` Blokları:** JSON olmayan (`application/ld+json` hariç) tüm `<script>` bloklarının içerikleri gerçek satır/sütun ofsetleriyle ayrı birer TypeScript AST'si olarak ayrıştırılır ve ana AST gövdesine eklenir.
3. **Otomatik Astro Sürüm Algılama (v5 / v6 / v7.4+) + CLI Override (`src/project-detector.ts`):**
   - Taranan projenin `package.json` dosyasındaki `"astro"` bağımlılığı okunarak ana sürüm (`5`, `6` veya `7`) otomatik tespit edilir (bulunamazsa varsayılan `7`).
   - CLI'a eklenen `--astro-version <5|6|7>` bayrağı ile istenirse manuel sürüm zorlaması yapılabilir.
   - Bayraksız çalıştırmada (`npx codehealth .`) interaktif menüde imleç otomatik olarak tespit edilen framework (`❯ Astro (detected · v7)`) üzerinde başlar; CI / Non-TTY ortamında ise otomatik seçilir.

---

## 3. Dosya Bazlı Yapılan Tüm Değişiklikler

### A. Yeni Eklenen Dosyalar (10 Dosya)

1. **[`src/astro-parser.ts`](../src/astro-parser.ts):**
   - `.astro` kaynak kodunu Frontmatter, Template ve `<script>` bölgelerine ayıran ve tek bir `TSESTree.Program` AST'sinde birleştiren 3 katmanlı ayrıştırıcı.
2. **[`src/project-detector.ts`](../src/project-detector.ts):**
   - `package.json` ve `astro.config.*` dosyalarını tarayarak projenin framework'ünü (`astro`, `next`, `expo`, `react-native`, `react`) ve Astro ana sürümünü (`5 | 6 | 7`) tespit eden modül.
3. **[`src/rules/astro-v7-breaking.ts`](../src/rules/astro-v7-breaking.ts):**
   - Astro 6 ve Astro 7.0–7.4'te kaldırılan API ve ayarları sürüme duyarlı olarak yakalar:
     - `Astro.glob()` kullanımı → `getCollection()` veya `import.meta.glob()` düzeltmesi
     - `<ViewTransitions />` ve kaldırılan `astro:transitions` sabitleri → `<ClientRouter />` düzeltmesi
     - `astro:db` / `@astrojs/db` importları (Astro 7'de kaldırıldı) → `node:sqlite` / Drizzle ORM düzeltmesi
     - `astro.config.*` içindeki `experimental.rustCompiler`, `experimental.queuedRendering`, `experimental.advancedRouting`, `experimental.logger` ve `legacy.collections` bayrakları
4. **[`src/rules/astro-legacy-content-config.ts`](../src/rules/astro-legacy-content-config.ts):**
   - Eski `src/content/config.ts` dosya yolunu ve `defineCollection()` içinde Content Layer `loader` (`glob()` / `file()`) eksikliğini yakalar.
5. **[`src/rules/astro-client-directive-on-html.ts`](../src/rules/astro-client-directive-on-html.ts):**
   - `<div client:load>` veya `<button client:visible>` gibi standart küçük harfli HTML etiketlerine verilen `client:*` direktiflerini (`error`) yakalar.
6. **[`src/rules/astro-client-only-missing-framework.ts`](../src/rules/astro-client-only-missing-framework.ts):**
   - `<MyComponent client:only />` gibi framework adı belirtilmeden kullanılan `client:only` direktiflerini (`error`) yakalar (`client:only="react"` düzeltmesi sunar).
7. **[`src/rules/astro-hooks-in-astro.ts`](../src/rules/astro-hooks-in-astro.ts):**
   - `.astro` dosyası içinde doğrudan çağrılan React hook'larını (`useState`, `useEffect`, `useRef` vb.) yakalar ve `.tsx` adacığına (island) taşıma şablonu sunar.
8. **[`src/rules/astro-client-load-overuse.ts`](../src/rules/astro-client-load-overuse.ts):**
   - UI bileşenlerinde `client:load` kullanımını yakalayarak performans (TBT/LCP) için `client:visible` veya `client:idle` önerir.
9. **[`src/rules/astro-unsafe-set-html.ts`](../src/rules/astro-unsafe-set-html.ts):**
   - Dinamik ifadelerle `set:html={...}` kullanımında XSS / sanitize uyarısı verir.
10. **[`src/rules/astro-inline-script.ts`](../src/rules/astro-inline-script.ts):**
    - `define:vars` veya `src` olmadan kullanılan `<script is:inline>` etiketlerinin Astro'nun bundle, tree-shake ve tekilleştirme (deduplication) optimizasyonunu devre dışı bıraktığını raporlar.

### B. Güncellenen Mevcut Dosyalar (20 Dosya)

- **[`src/parser.ts`](../src/parser.ts) & [`src/component-detector.ts`](../src/component-detector.ts):** `.astro` dosyalarını `parseAstroSource` ile ayrıştıracak ve bileşen adını (`Hero.astro`) AST kökünden okuyacak şekilde güncellendi.
- **[`src/rules/types.ts`](../src/rules/types.ts) & [`src/rules/index.ts`](../src/rules/index.ts):** `Framework` tipine `'astro'` ve `RuleContext` (`framework`, `astroVersion`) eklendi; 8 yeni Astro kuralı kayıt altına alındı.
- **[`src/profiles.ts`](../src/profiles.ts), [`src/scanner.ts`](../src/scanner.ts), [`src/watcher.ts`](../src/watcher.ts):** Astro dosya uzantıları (`.astro`, `astro.config.*`), `**/.astro/**` ignore kuralı ve `RuleContext` aktarımı eklendi.
- **[`src/cli.ts`](../src/cli.ts), [`src/prompt.ts`](../src/prompt.ts), [`src/reporter.ts`](../src/reporter.ts), [`src/index.ts`](../src/index.ts):** `--astro`, `--astro-version <5|6|7>` bayrakları, interaktif menüde `(detected · v7)` gösterimi ve yeni kural özet mesajları eklendi.
- **Mevcut Kuralların Astro Uyarlamaları:**
  - [`src/rules/img-not-optimized.ts`](../src/rules/img-not-optimized.ts): Astro modunda `<img>` için `import { Image } from 'astro:assets'` düzeltmesi verir.
  - [`src/rules/a11y-autofocus.ts`](../src/rules/a11y-autofocus.ts) & [`src/rules/a11y-label.ts`](../src/rules/a11y-label.ts): HTML `autofocus` ve `<label for="...">` özniteliklerini destekler.
  - [`src/rules/heavy-import.ts`](../src/rules/heavy-import.ts) & [`src/rules/no-console-log.ts`](../src/rules/no-console-log.ts): Astro için `client:visible` ve `if (import.meta.env.DEV)` önerileri sunar.
  - [`fetch-in-effect.ts`](../src/rules/fetch-in-effect.ts), [`multiple-usestate.ts`](../src/rules/multiple-usestate.ts), [`effect-set-state.ts`](../src/rules/effect-set-state.ts), [`effect-as-handler.ts`](../src/rules/effect-as-handler.ts), [`index-as-key.ts`](../src/rules/index-as-key.ts): `--astro` profiline eklendi ancak yalnızca `.tsx/.jsx` (React island) dosyalarında çalışacak şekilde sınırlandırıldı.

---

## 4. Astro Sürüm Matrisi (v5 / v6 / v7.4+)

| Kural ID | Kontrol Edilen Yapı | Astro 5 (`--astro-version 5`) | Astro 6 (`--astro-version 6`) | Astro 7.4+ (Varsayılan) |
| :--- | :--- | :---: | :---: | :---: |
| `astro-v7-breaking` | `Astro.glob()`, `<ViewTransitions />`, `legacy.collections` | `warning` *(Deprecated)* | `error` *(Kaldırıldı)* | `error` *(Kaldırıldı)* |
| `astro-v7-breaking` | `astro:db`, `experimental.rustCompiler`, `experimental.queuedRendering`, `experimental.advancedRouting`, `experimental.logger` | *Atlanır (Geçerli)* | `warning` *(v7'de kaldırılacak)* | `error` *(v7'de kaldırıldı)* |
| `astro-legacy-content-config` | `src/content/config.ts` yolu veya `defineCollection` içinde `loader` eksikliği | `warning` | `error` | `error` |
| `astro-client-directive-on-html` | `<div client:load>` gibi standart HTML etiketlerinde `client:*` | `error` | `error` | `error` |
| `astro-client-only-missing-framework` | Framework belirtilmeden `<Comp client:only />` kullanımı | `error` | `error` | `error` |
| `astro-hooks-in-astro` | `.astro` dosyası içinde doğrudan React hook çağrılması | `error` | `error` | `error` |
| `astro-client-load-overuse` | Adacıklarda `client:load` kullanımı (`client:visible` / `client:idle` önerisi) | `warning` | `warning` | `warning` |
| `astro-unsafe-set-html` | Dinamik ifadelerle `set:html={...}` kullanımı (XSS uyarısı) | `warning` | `warning` | `warning` |
| `astro-inline-script` | `<script is:inline>` kullanımı (bundle/dedup kaybı) | `warning` | `warning` | `warning` |
| `img-not-optimized` | Ham `<img>` etiketi (`astro:assets` `<Image />` önerisi) | `warning` | `warning` | `warning` |

---

## 5. GitHub Üzerinden `npx` ile Çalıştırma Rehberi

1. **Repo Görünürlüğü:** Herhangi bir projede kimlik doğrulama (token/SSH) gerektirmeden doğrudan `npx` ile çalıştırabilmek için GitHub reposunun **Public** olması önerilir.
2. **Derlenmiş Dosyalar (`dist/`):** `dist/cli.js`, `dist/index.js` ve `dist/index.d.ts` dosyaları Git tarafından takip edilmektedir (`git add dist/`). Kodda bir değişiklik yaptığında commit öncesi `npm run build` çalıştırman yeterlidir; böylece `npx` paketi GitHub'dan çektiğinde derleme yapmasına gerek kalmadan anında çalışır.
3. **Çağrılma İsimleri ve Komutlar:**
   - **Bilgisayarındaki herhangi bir projede (`npm link` sonrası):**
     ```bash
     npx codehealth-mali .
     npx codehealth-mali . --astro
     codehealth-mali . --astro
     ```
   - **GitHub üzerinden doğrudan çalıştırmak için:**
     ```bash
     npx github:malikilinc/codehealth-mali .
     npx github:malikilinc/codehealth-mali . --astro
     npx github:malikilinc/codehealth-mali . --astro --astro-version 5
     ```
