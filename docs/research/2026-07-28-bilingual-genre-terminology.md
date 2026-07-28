# 中英雙語介面：小說題材、風格與章節節拍英文術語查證

日期：2026-07-28

## 研究目的

為目前內建的題材、風格與章節節拍選項選定自然、可辨識的英文介面名稱。本筆記查的是「英文出版／英語小說平台／敘事教學中實際使用的名稱」，不把中文詞逐字直譯成看似英文、實際上容易誤解的標籤。

主要依據：

- Book Industry Study Group（BISG）的 BISAC 是美國圖書供應鏈使用的正式英文主題分類；適合判斷主流出版類型名稱。[BISAC Subject Codes](https://www.bisg.org/BISAC-Subject-Codes-main)、[Fiction headings](https://www.bisg.org/fiction)
- Wuxiaworld 是以中文網路小說英譯出版為核心的平台；其 genre guides 由 Chinese licensing manager 撰寫，適合判斷中國網文術語在英文專業語境中的實際用法。[Xuanhuan guide](https://www.wuxiaworld.com/page/introduction-to-chinese-webnovel-genres-xuanhuan)、[Xianxia guide](https://www.wuxiaworld.com/page/introduction-to-chinese-webnovel-genres-xianxia)
- Seven Seas 是正式英文出版社，其出版頁與詞彙表可驗證 `xianxia` 在一般英語出版品中的使用。[Seven Seas Danmei glossary](https://sevenseasentertainment.com/danmeibooks/)
- 敘事節拍以大學寫作／教學資料交叉檢查。[Oregon State University narrative arc](https://liberalarts.oregonstate.edu/wlf/what-narrative-arc-cli-fi)、[Yale National Initiative](https://teachersinstitute.yale.edu/curriculum/units/2024/1/24.01.01/5)

## 建議採用的介面標籤

### 題材

| 穩定代碼 | 中文 | 建議英文介面 | 判斷 |
| --- | --- | --- | --- |
| `xuanhuan` | 玄幻 | **Xuanhuan (Eastern Fantasy)** | `Xuanhuan` 是英語專業圈實際使用的借詞，不是臨時音譯；加上解釋詞可降低陌生感。 |
| `urban` | 都市 | **Contemporary / Modern-Day** | 不建議單獨顯示 `Urban`，更不可譯成 `Urban Fantasy`；後者在英語出版中是特定奇幻類型。 |
| `xianxia` | 仙俠 | **Xianxia (Cultivation Fantasy)** | `Xianxia` 已由英文出版社與平台直接使用；括號補充可讓非網文讀者理解。 |
| `science_fiction` | 科幻 | **Science Fiction** | 主流出版標準名稱。 |
| `romance` | 言情 | **Romance** | 主流出版標準名稱。 |
| `mystery_suspense` | 懸疑 | **Mystery / Suspense** | 比只用 `Mystery` 或 `Suspense` 更能涵蓋中文網文中的推理、驚悚與氣氛取向。 |
| `custom` | 自定義 | **Custom** | 一般產品介面的自然用語，不是小說類型名稱。 |

### 風格

風格並不像 BISAC 題材那樣有統一的產業控制詞彙；下列選擇以自然英文語感及出版社／平台實際描述為準。

| 穩定代碼 | 中文 | 建議英文介面 | 判斷 |
| --- | --- | --- | --- |
| `lighthearted` | 輕鬆 | **Lighthearted** | 可直接描述作品基調；Cambridge 定義為有趣而不嚴肅。[Cambridge Dictionary](https://dictionary.cambridge.org/us/dictionary/english/lighthearted) |
| `somber` | 沉重 | **Somber** | 比逐字譯成 `Heavy` 更像作品基調；表示嚴肅、悲傷、缺少幽默。[Cambridge Dictionary](https://dictionary.cambridge.org/us/dictionary/english/somber) |
| `dark` | 黑暗 | **Dark** | 英文出版分類與作品介紹均實際使用，例如 BISAC 的 `Dark Fantasy`。[BISAC Fiction headings](https://www.bisg.org/fiction) |
| `high_energy` | 熱血 | **High-Energy** | 不建議 `Hot-Blooded`；英文中容易偏向人物性格或性意味。`High-Energy` 可自然描述充滿熱情、快節奏的作品；正式出版介紹也會以 `high-energy` 描述冒險小說。[Penguin Random House: The Hunted](https://www.penguinrandomhouse.com/books/211214/the-hunted-by-matt-de-la-pena/ebook/) |
| `humorous` | 幽默 | **Humorous** | 作為風格形容詞比類型名 `Comedy` 更準確；BISAC 亦使用 `Fantasy / Humorous`。[BISAC Fiction headings](https://www.bisg.org/fiction) |
| `wish_fulfillment` | 爽文 | **Wish-Fulfillment** | 沒有完全等價的標準英語類型。Wuxiaworld 在說明「爽點」與相關作品時實際使用 `instant gratification`、`wish-fulfillment`；此處選後者作為較可理解的風格名稱。[Wuxiaworld Xuanhuan guide](https://www.wuxiaworld.com/page/introduction-to-chinese-webnovel-genres-xuanhuan) |
| `custom` | 自定義 | **Custom** | 一般產品介面的自然用語。 |

## 題材逐項查證

### 玄幻：保留 Xuanhuan，但加英文解釋

`Xuanhuan` 是漢語拼音借詞，但已是英語中國網文圈中的實際類型名稱：

- Wuxiaworld 的英文指南直接把 `Xuanhuan (玄幻)` 列為主要類型，並解釋為難以明確歸入 science fiction、xianxia 或 Western fantasy 的廣泛幻想作品。[Wuxiaworld Xuanhuan guide](https://www.wuxiaworld.com/page/introduction-to-chinese-webnovel-genres-xuanhuan)
- Wuxiaworld 的英文詞彙表以 `Xuanhuan` 為詞條，簡述為揉合中國民間傳說／神話與外來元素、設定的廣泛幻想類型。[Wuxiaworld glossary](https://www.wuxiaworld.com/page/general-glossary-of-terms)
- Cambridge University Press 的同儕審查文章也直接使用 `xuanhuan`，並將其譯解為 `mysterious fantasy`，證明它不限於單一翻譯網站的內部用語。[Cambridge Core article](https://www.cambridge.org/core/journals/international-journal-of-asian-studies/article/materializing-the-digital-landscape-the-cinemaecology-complex-and-chinese-fantasy-media/0E465AF1006E9C9EC9AC3CBF2B2FBCD5)

但 BISAC 的正式英語出版分類沒有 `Xuanhuan`；`Eastern Fantasy` 也不是 BISAC heading。[BISAC Fiction headings](https://www.bisg.org/fiction) 因此：

- 不應假裝它有一個完全等價的主流西方類型名稱。
- 不建議只改成 `Fantasy`，那會丟失中國網文分類的差異。
- 英文介面建議顯示 `Xuanhuan (Eastern Fantasy)`；`Eastern Fantasy` 是解釋性 gloss，不宣稱兩者完全等價。

### 仙俠：Xianxia 是實際英文借詞

`Xianxia` 同樣是已進入專業英語使用的借詞：

- Wuxiaworld 直接以 `Xianxia` 作為類型名稱，定義其世界觀基礎為道教修煉思想與神話，角色藉修煉追求力量與成仙。[Wuxiaworld Xianxia guide](https://www.wuxiaworld.com/page/introduction-to-chinese-webnovel-genres-xianxia)
- Seven Seas 的正式英文出版詞彙表把 `Xianxia` 定義為具有強烈道教與 cultivation 主題、人物追求不朽的 fantasy subgenre；其出版頁也使用 `Chinese fantasy (xianxia)`。[Seven Seas Danmei glossary](https://sevenseasentertainment.com/danmeibooks/)、[The Husky and His White Cat Shizun](https://sevenseasentertainment.com/series/the-husky-and-his-white-cat-shizun-erha-he-ta-de-bai-mao-shizun-novel/)
- Tor Publishing Group 也在正式書介中使用 `xianxia-style martial arts`。[Navigational Entanglements](https://torpublishinggroup.com/navigational-entanglements/?format=hardback&isbn=9781250324887)

因此不必刪除此類型。英文介面建議顯示 `Xianxia (Cultivation Fantasy)`；括號是讀者提示，不是要用較寬泛的 `Fantasy` 取代它。

### 都市：避免 Urban Fantasy 的錯誤聯想

Wuxiaworld 的中國網文分類表確實直接將 `都市` 寫成 `Urban`，並與 Xuanhuan、Xianxia、Science Fiction 等並列。[Wuxiaworld Xuanhuan guide](https://www.wuxiaworld.com/page/introduction-to-chinese-webnovel-genres-xuanhuan) 但對不熟悉中國網文分類的英文使用者：

- BISAC 的 `Fantasy / Urban` 是一個明確的奇幻子類，不能拿來代表所有現代社會背景的都市小說。
- BISAC 的 `Urban & Street Lit` 也帶有特定出版脈絡，不等同中文網文的「都市」大類。[BISAC Fiction headings](https://www.bisg.org/fiction)

為避免誤導，建議英文介面用 `Contemporary / Modern-Day`；內部代碼仍可保留 `urban`。若產品主要面向已熟悉中國網文術語的使用者，才考慮顯示 `Urban (Modern-Day)`。

### 科幻、言情、懸疑

- `科幻`：使用 `Science Fiction`。Wuxiaworld 的中英分類表直接對應 `Science Fiction (科幻)`，BISAC 也有完整的 `FICTION / Science Fiction` 類別。[Wuxiaworld Xuanhuan guide](https://www.wuxiaworld.com/page/introduction-to-chinese-webnovel-genres-xuanhuan)、[BISAC Fiction headings](https://www.bisg.org/fiction)
- `言情`：使用 `Romance`。BISAC 採 `FICTION / Romance`；Seven Seas 的中文小說英文出版頁也直接以 `Romance` 作為類型。[BISAC Fiction headings](https://www.bisg.org/fiction)、[Seven Seas: Hidden Love](https://sevenseasentertainment.com/series/hidden-love-novel/)
- `懸疑`：建議 `Mystery / Suspense`。Wuxiaworld 將中國網文的 `懸疑` 譯為 `Suspense`，同時明確說明這類作品源自 detective 與 mystery fiction，且常混合 thriller、horror、grotesque、paranormal 元素；單一 `Mystery` 或 `Suspense` 都略窄。[Wuxiaworld Suspense guide](https://www.wuxiaworld.com/page/introduction-to-chinese-webnovel-genres-wuxia-suspense-and-realist) BISAC 則使用 `Mystery & Detective`、`Romance / Suspense` 等既有英語分類語彙。[BISAC Fiction headings](https://www.bisg.org/fiction)
- `自定義`：使用一般 UI 詞 `Custom`；此選項不是出版類型，不需要硬套 genre taxonomy。

## 風格逐項查證

- `輕鬆 → Lighthearted`：自然且精確；不建議 `Relaxed`，後者較像人的狀態或步調，不必然表示作品不嚴肅。[Cambridge Dictionary](https://dictionary.cambridge.org/us/dictionary/english/lighthearted)
- `沉重 → Somber`：比 `Heavy` 更適合獨立的 tone label。若未來希望強調嚴肅而不一定悲傷，可另設 `Serious`，但不宜把兩者視為完全相同。[Cambridge Dictionary](https://dictionary.cambridge.org/us/dictionary/english/somber)
- `黑暗 → Dark`：是英語作品風格與類型描述中的常用詞；BISAC 有 `Dark Fantasy`，出版社也常用 `dark` 描述作品調性。[BISAC Fiction headings](https://www.bisg.org/fiction)
- `熱血 → High-Energy`：`Hot-Blooded` 雖是字面翻譯，作為英文小說風格標籤不自然且容易產生不同聯想。`High-Energy` 已用於正式出版社的小說描述；若產品希望更強調戰鬥，也可用較窄的 `Action-Packed`。[Penguin Random House: The Hunted](https://www.penguinrandomhouse.com/books/211214/the-hunted-by-matt-de-la-pena/ebook/)、[The Forbidden Library](https://www.penguinrandomhouse.com/books/313010/the-forbidden-library-by-django-wexler/9781101604236/)
- `幽默 → Humorous`：作為 tone/style 形容詞自然；若欄位未來改成「類型」，才改用名詞 `Comedy`。BISAC 本身使用 `Fantasy / Humorous`。[BISAC Fiction headings](https://www.bisg.org/fiction)
- `爽文 → Wish-Fulfillment`：沒有一個能涵蓋所有爽文的英文出版類型。`Power Fantasy` 常能描述主角快速變強、碾壓對手的子型，但對戀愛、事業逆襲或其他「爽點」作品過窄。Wuxiaworld 對 `爽點` 使用 `instant gratification`，對相關創作方向使用 `wish-fulfillment`，故後者較適合作為本產品的廣義風格標籤。[Wuxiaworld Xuanhuan guide](https://www.wuxiaworld.com/page/introduction-to-chinese-webnovel-genres-xuanhuan)
- `自定義 → Custom`：一般 UI 詞彙。

## 章節節拍

| 穩定代碼 | 中文 | 建議英文介面 | 標準性 |
| --- | --- | --- | --- |
| `inciting_incident` | 引入 | **Inciting Incident** | 標準敘事術語。 |
| `rising_action` | 衝突升級 | **Rising Action** | 標準敘事術語。 |
| `midpoint` | 中點轉折 | **Midpoint** | 常見的故事結構轉折術語；不必固定寫 `Midpoint Twist`。 |
| `climax` | 高潮 | **Climax** | 標準敘事術語。 |
| `resolution` | 結局 | **Resolution** | 標準敘事術語。 |
| `setup_transition` | 鋪墊／過渡 | **Setup / Transition** | 實用的產品自訂分類，不是與前五者同一套模型中的標準節拍。 |

查證結果：

- Oregon State University 的 narrative arc 教材依序使用 exposition、inciting incident、rising action、climax、falling action、resolution。[Oregon State University](https://liberalarts.oregonstate.edu/wlf/what-narrative-arc-cli-fi)
- Yale National Initiative 的教材使用同一組核心詞，並另外指出故事中段的轉折可稱為 `midpoint`。[Yale National Initiative: plot mountain and midpoint](https://teachersinstitute.yale.edu/curriculum/units/2024/1/24.01.01/5)
- 因此 `Inciting Incident`、`Rising Action`、`Climax`、`Resolution` 是高度穩定的標準英文；`Midpoint` 也是常用詞，但屬較細的 beat／turning-point 模型。
- `Transition` 在寫作教學中通常指連接段落、場景或想法的橋梁，而不是 Freytag 式情節曲線中的固定節點。George Mason University Writing Center 即把 transitions 定義為文章各部分間的 bridges。[GMU Writing Center](https://writingcenter.gmu.edu/writing-resources/general-writing-practices/transitions) 因目前中文值同時包含「鋪墊／過渡」，英文宜保留為 `Setup / Transition`，並在規格中標記為產品自訂功能分類。

## 給實作規劃的結論

1. `Xuanhuan`、`Xianxia` 可以保留：兩者都是英語出版／翻譯領域實際使用的借詞，不是開發者自行造出的音譯。為一般英文使用者加上 `Eastern Fantasy`、`Cultivation Fantasy` 的括號解釋。
2. 不要把 `都市` 譯成 `Urban Fantasy`。建議顯示 `Contemporary / Modern-Day`，資料代碼可仍為 `urban`。
3. `爽文` 不宜寫成 `Shuangwen`，也不宜一律縮成 `Power Fantasy`；建議 `Wish-Fulfillment`。
4. `熱血` 不使用 `Hot-Blooded`；建議 `High-Energy`，若未來語意明確限定戰鬥作品再用 `Action-Packed`。
5. 前五個章節節拍可直接使用標準英文；`鋪墊／過渡` 應明示為產品自訂的 `Setup / Transition`。
6. 資料庫保存穩定代碼，中文與英文只作顯示字串；括號解釋詞不應成為持久化資料的一部分。
