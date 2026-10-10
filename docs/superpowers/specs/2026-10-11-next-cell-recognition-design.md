# 次期セル認識方式と正式な採用条件（Issue #5）

## 状態・目的・範囲

設計提案。候補方式の選定は実測による採用ではない。新しい採否は #6 のデータ整備、#7 の期限付きspike、#8 の証拠レビューとADRによって決める。現時点では [ADR 0003](../../decisions/0003-reject-current-cell-recognition-candidates.md) のセル認識不採用と、[ADR 0004](../../decisions/0004-partially-adopt-fail-closed-grid-detection.md) の14/16グリッド部分採用を維持する。

Issue #5 の目的は、既存方式の失敗を区別して次に検証する方式を選び、正式評価、データ分離、ブラウザ実行、資産の扱い、停止・採否条件を先に固定すること。本書の数値は次期spikeの提案ゲートであり、達成済みの測定値ではない。候補実装、fixtureに合わせた調整、UI、solver、画像取得、既存コードの削除は本作業の対象外。

依存する #3 は完了済み。現在の製品は手動入力MVPであり、認識の成否で製品コアを停止しない。#13 の認識統合だけを #8 の採用判断でゲートする。

## 1. 既存方式の失敗分類

| 証拠 | 観測事実 | 分類・次期設計への含意 |
| --- | --- | --- |
| [初期spike報告](../spikes/2026-08-16-image-recognition-report.md) | 元画像1920/1920セルは正解。Sharp/Lanczos3縮小・拡大とJPEG-Q75で確信付き誤分類32件。数字3・5から旗への誤分類が反復し、候補閾値0.25〜0.50では解消しない | セル分類の耐性不足。グリッド不良やChromium Canvasの結果とは呼ばない。ラベルごとの分散で割る距離は比較尺度が異なり、相対距離差だけでは誤りを棄却できない可能性がある（原因仮説） |
| [multi-prototype報告](../spikes/2026-08-23-multi-prototype-recognition-report.md) | Chromiumの `1:canvas-scale-075` と `2:canvas-scale-075` でグリッドなし。238閾値ペアのうち利用可能な完全ケースで90ペアが通過したが、正式matrix未完了。共有閾値・正式bank hashはnull | 評価パイプラインの未完了。2画像の分類器の誤りは未測定であり、「multi-prototypeも32件誤分類した」と扱わない。90ペアを採用証拠へ転用しない |
| [グリッド部分採用設計](2026-08-24-canonical-grid-partial-adoption-design.md) | 11 direct、3 fallback、2 fail-closed | 意図された安全な棄却を維持。次期の条件付き認識契約を別に定義し、過去の16/16必須ゲートを遡及変更しない |
| 両方式のデータ | 既存4画面に7・8なし、6のscanline条件が不足。画面holdoutで6の訓練例がないfoldもある | ラベル被覆とデータ独立性の不足。距離が大きいだけで未知ラベルを必ず検出できるとは主張しない |

旧bankの学習画面上の成功は独立評価での汎化成功ではない。再設計では既存4画面を既知の回帰集合とし、新たな独立評価の代わりに使わない。

## 2. 候補3方式と選定

以下は設計上の比較・予測であり、精度・速度の実測比較ではない。

| 方式 | 手段 | 利点 | リスク・選ばない理由 |
| --- | --- | --- | --- |
| A: ルールベース | セル外周の立体境界、内部の色、連結成分・形状を組み合わせ、一致しないセルを棄却 | 追加推論依存が不要。旗と数字の形状差を説明できる | scanline、JPEG、縮小で連結性や色が変わり、例外規則が増えやすい。未知テーマへの強い断定を避ける必要がある。第一候補にはしない |
| **B: 特徴量再設計＋正則化した多クラス線形分類器** | 外周と内部を分離した色・輪郭・方向勾配の固定長特徴、共通scaler、多項ロジスティック回帰。スコア差と分布外距離で棄却 | 相対的な旗／数字判別を学習できる。重み・scaler・棄却資産を小さく保ち、TypeScriptでローカルCPU推論できる | 特徴が不十分なら線形分離できない。少量データでは過学習し得る。softmax値は正しさや未知入力の保証ではない |
| C: 軽量CNN | 小さなセル画像から学習し、ONNX等の形式でブラウザCPU推論 | 特徴を手設計せず形状と色を学習できる候補 | 独立画面数、未知入力評価、ランタイム配布・初期化の負担が増える。4画面由来の学習だけでは採用できない。B失敗後の別設計候補 |

**Bを #7 の第一候補に選ぶ。** 既存の数字→旗の失敗に形状と外周／内部の分離で対応し、プロトタイプ数を増やすだけの再試行を避ける。CPU推論に新しいブラウザ推論ランタイムを要求せず、比較基準に対して特徴変更の効果を検証できるためである。Aを補助規則として無制限に足したり、#7 の途中でCへ切り替えたりしない。Bが失敗したら証拠を残し、新しい設計で次方式を選ぶ。

多項ロジスティック回帰の係数・確率出力と学習再現性上の注意は [scikit-learn公式仕様](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html)を参照。Cのブラウザ実行可能性は [ONNX Runtime Web公式資料](https://onnxruntime.ai/docs/tutorials/web/)に基づくが、当プロジェクトでのサイズ・速度は未測定。ONNX採用や依存追加は今回決めない。

## 3. 第一候補の境界とconfidence契約

想定データフロー:

```text
RGBA＋利用者が入力した列数・行数
  -> 採用済みdirect-firstグリッド（変更しない）
  -> row-majorセルcrop
  -> 外周／内部を分けた特徴抽出
  -> 訓練集合だけでfitした共通scaler
  -> 固定された線形重みとラベル順でスコア計算
  -> 共通のスコア差・分布外距離ゲート
  -> recognized / needs-review / grid-not-found
```

特徴は色だけに依存せず、彩度・輝度の空間分布、輪郭の方向勾配、外周の境界信号を保持する。正規化方法と特徴の次元は #7 の評価開始前にfeature versionとして固定し、学習とブラウザで一致させる。グリッド再検出、セルごとの別スケール探索、solverによるラベル補完はしない。

スコアは `z = W x + b`。候補ラベルのsoftmax値の1位／2位の差と、訓練集合から作ったラベル中心への最小の共通尺度距離を用いる。両方の共有閾値を満たす場合だけ `certain` とする。確率を実際の正解率と呼ばず、スコアを地雷確率に使わない。較正候補は、スコア差 `{0.1, 0.2, …, 0.9}` と、訓練集合の正解ラベル中心距離の分位点 `{0.90, 0.95, 0.99, 1.00}` の直積36組に限る。正則化候補は `C ∈ {0.1, 1, 10}` の3組に限る。特徴設計の候補は2版まで（各fitに対して最大216組。fold数に応じた繰り返しは別記録）。較正の安全・uncertain条件を通過する組から、最大uncertain数、総uncertain数、特徴版番号、C昇順、スコア差降順、距離上限昇順の順で一意に選ぶ。通過組がなければ評価を開封せず棄却する。

成果物はラベル順、feature/scaler version、scaler、W、b、距離中心、共有閾値、訓練・較正manifest hash、生成環境、content hashを持つ。モデル再学習はランタイムで行わない。ブラウザはfixture ID、期待境界、truth、ブラウザ名を受け取らず、全正式ケースで同じ成果物を使う。

- `recognized`: 有効グリッドがあり、全セルがcertainで、未知／不正セルがない。正解保証とは呼ばない。
- `needs-review`: 有効グリッドがあり、1セル以上がuncertain。uncertainセルの公開labelはnullとし、候補は診断用に留める。自動確定やsolverへの転送をしない。
- `grid-not-found`: グリッドなし。公開geometryはnull、cellsは空。480個のuncertainセルに置換しない。
- モデル破損、version不一致、非有限数、入力shape不正は明示的エラー。部分的なcertain結果を返さず、評価ではケース失敗として数える。

[ADR 0005](../../decisions/0005-require-manual-confirmation-before-solving-uncertain-boards.md)に従い、不確実性や盤面矛盾を利用者が確認するまでsolverに渡さない。uncertainが4以下でも自動承認しない。幅・高さ・総地雷数の自動推定、製品状態・Worker APIへの統合は #8/#13 で別途確定する。

## 4. グリッド14/16と認識評価の契約

正式評価の1ケースは「1 source screen × 1 Chromium変換」。既存4画面のsource、Canvas 0.75x、Canvas 1.25x、Canvas JPEG quality 0.75の16ケースを残す。

| 集合 | 必須結果 | セル採用ゲートへの扱い |
| --- | --- | --- |
| 既存11 direct＋3 fallback | 採用済みgeometry許容差内で同じstage。実検出cropで分類する | 14ケースすべてでセル条件を判定。成功しないケースを分母から外さない |
| `1:canvas-scale-075`、`2:canvas-scale-075` | 決定的な `source-revalidation-rejected`、公開null、cells空 | **期待されたグリッド棄却2件**。セル正解／uncertainの分母には含めず、全16件のcase outcomeには必ず記録 |
| #6で追加する対応範囲内positive | 元画像と3派生すべてで正しいgridとセル条件 | 未検出・誤geometryは失敗。観測後に期待棄却へ移さない |
| #6のnegative・範囲外入力 | グリッド棄却、または未知セルがcertainにならないreview結果 | 安全性ゲートとして別表で判定。positiveのuncertain上限を適用しない |

この設計によって初めて「グリッドが安全に得られた範囲のセル認識＋期待棄却」を次期採用対象にできる。過去のmulti-prototype採否は変わらず、16/16の全画像自動認識を達成したとは表現しない。

2棄却ケースの分類原因を調べる必要があれば、ground truth geometryのセルcropを**oracle-crop診断**として別に評価できる。全480セルについてcertain誤り、uncertain、混同行列を記録するが、E2E採否・検出率・採用セル分母へ足さない。本番へgeometryを渡さない。

グリッド側のdirect優先、共有20,000 pair予算、曖昧候補最大8、元画像でsurvivorがちょうど1、各種strict閾値とnegative棄却は維持する。14/16のstage変化（2棄却の成功化を含む）や予算逸脱は停止し、別グリッド設計のレビューへ戻る。

## 5. 定量的なセル条件と未収録ラベル

記号: Nは検出gridのセル数、Uはuncertain数、Eはtruthと異なるcertainセル数。**高信頼度誤認識はE**と定義し、confidenceの表示値によって集計対象を変更しない。uncertainは正解扱いにせず、uncertain内の候補誤りも別集計する。

| 正式positiveの条件 | ゲート |
| --- | --- |
| 高信頼度誤認識 | 全ケース・全ラベルでE=0。1件でも棄却 |
| 元画像 | U=0（480セルすべてcertainかつ正解） |
| 各派生画像 | U≤4（30×16の480セル）。平均で相殺しない |
| 決定性 | 同一入力・固定成果物の3 fresh runでgeometry、stage、ラベル、certain、U/Eが一致 |
| 新データ被覆 | 訓練・較正・独立評価の各集合で全11ラベルを収録（closed、empty、flag、1〜8） |

初回の正式positive範囲は収録テーマの30×16、元解像度と上記3変換。その他の盤面サイズ、任意倍率／圧縮率、別テーマ、回転、遠近変形、途中で欠けた盤面、地雷・爆発・誤旗など終局表示は保証範囲外。手動MVPの1〜30セル寸法範囲を認識保証へ転用しない。

7・8およびscanline付き6は #6 の必須追加。各splitの各ラベルについて元画像セル10個以上かつ3独立screen group以上、6はscanlineあり／なし各3 group以上を必要とする。派生画像を元ラベル数の水増しに使わない。条件不足は `coverage-incomplete` として #7 開始を止め、既存のclosed〜6だけを全ラベル対応と呼ばない。

未収録の終局表示や未知テーマのnegativeは #6 で固定し、較正／評価それぞれ3独立group以上、各集合で未知セル30個以上を人手で注釈する。gridを棄却すれば安全なケース棄却、有効gridなら注釈された未知セルのcertain数=0を必要とする。既知セルまでuncertainにすることはnegativeでは許すが、その挙動を集計する。ラベル欠落モデルを強制的に作る診断では、欠落ラベルのセルが既知ラベルへcertain化された件数も報告する。

有限のnegative集合でcertain誤りが0でも、任意の未収録ラベル・未知テーマを完全に検出できるとは保証しない。未知データ不足を距離ゲートだけで補ったことにしない。全セルを棄却する方式はpositiveのU条件で不合格になる。

## 6. データ分離と #6 への引き渡し

分離の単位はセルではなく**screen group**。同一盤面の撮り直し、同一ゲーム進行の連続capture、同一元画面のcrop・変換・scanline加工は同じgroupへまとめる。画面全体のholdoutをしても派生元が同じなら独立とは数えない。

- 既存4画面と全派生: 既知の回帰専用。学習／較正／独立評価の最低数には含めない。
- 新positive: 最低12独立groupを、訓練6／較正3／独立評価3以上へ固定。上記ラベル・scanline被覆を満たすまで追加する。各sourceから4ケースを作り、最低48ケース。
- 新negative: positiveとは別のgroupを較正3／独立評価3以上へ固定。
- manifestは source/group ID、split、出典・利用権・公開可否、撮影条件、theme、scanline条件、truthとsource hash、変換パラメータ、RGBA hash、positive/negativeと期待stageを持つ。truthは2者確認する。既存truthは上書きしない。

scaler・重み・距離中心のfitは訓練集合だけ。訓練Canvas派生はaugmentationに使えるがgroupを越えない。較正集合は固定候補の選択・棄却閾値だけに使い、重みfitやモデル再学習には使わない。訓練＋較正を合併して最終モデルを作り直さない。

訓練集合内のleave-one-screen-group-outを特徴検証に使い、各foldのscaler・重み・中心は残る訓練groupだけでfitする。共有較正集合で同じ事前候補を選び、held-out訓練groupを評価する。全foldでE=0、source U=0、派生U≤4を必要とする。欠落ラベルがあるfoldは不完全として失敗に数え、別foldの学習データから例を足さない。#6では全foldの残存ラベル被覆も事前確認する。これは開発内検証であり、独立評価の代替ではない。

独立評価のtruthはモデル担当が特徴・係数・閾値を固定するまで開封しない。manifest、候補設定、成果物hashを凍結した後に一度の正式評価キャンペーン（同一成果物の再現性3回を含む）を行う。失敗を見て閾値を変えた場合、その集合は以後回帰／開発用とし、新しい独立評価groupを設ける。truthの誤注釈訂正は証拠と独立レビューを伴う新manifest版で全条件を再評価し、黙って同じ結果を合格化しない。

#6のfixture構成レビューで満たせない数値があれば、評価前に本設計の改訂をレビューする。#7の観測後に最低数やE/U条件を緩めない。

## 7. 正式ブラウザと参考評価

正式採否はChromiumのみ。[ADR 0006](../../decisions/0006-use-chromium-as-formal-recognition-evaluator.md)を維持する。Nodeで作った特徴の結果だけではブラウザ実行成功としない。

Chromiumのdecode、Canvas `drawImage` による0.75x／1.25x、Canvas JPEG quality 0.75のencode/decodeを使う。画像寸法の丸め、補間設定、Playwright／Chromium version、Node、OS、CPU、lockfile hash、sourceとRGBA hashを証拠へ記録する。browser versionやpixel hashが変わったら同一入力の再現性と混同せず、新しい評価環境として扱う。

Firefox、Playwright WebKitは同じ固定成果物と変換手順で全ケースを参考測定する。各エンジンのgrid成否、E、U、性能を分けて `safe-within-tested-cases` / `limited` / `unsafe` / `not-run` と報告する。certain誤りならunsafe、certain誤り0でもpositive未検出やU超過ならlimited。参考エンジンの成功でChromium失敗を覆さず、参考結果を理由に閾値を変えない。Playwright WebKitはSafari実機保証ではない。Sharp/Lanczos3は別のstress表としCanvasの証拠へ合算しない。

## 8. ブラウザ性能・資産サイズ・再現性

以下は初回spikeの上限。測定機のOS、CPU、メモリ、ブラウザ、電源・負荷条件を報告し、対象はデスクトップChromiumに限る。

| 対象 | 採用ゲート |
| --- | --- |
| グリッド単体 | [UX性能改訂](2026-08-24-canonical-grid-ux-performance-amendment-design.md)の方法でmedian≤500ms、worst≤1,000ms。既存の同一Node過程・paired測定を保持 |
| ブラウザ内crop＋特徴＋分類（480セル） | warm median≤100ms、worst≤250ms |
| ブラウザ内grid＋セル認識 | warm median≤600ms、worst≤1,250ms。期待グリッド棄却も含む |
| 固定資産からの初期化 | 初期化＋初回認識≤2,000ms（fetch／decodeを除外して別報告） |
| 認識資産 | 重み、scaler、距離中心、閾値、metadataの合計非圧縮≤256KiB |
| ブラウザ配布増分 | 認識専用JSと全モデル／ランタイム資産の合計gzip≤512KiB。学習ツールは含めず、共有依存の追加分は含める |

ブラウザ計時はRGBA取得後の認識処理を `performance.now()` で測る。fetch、decode／Canvas変換、hash、overlay、assertionを分離する。各caseを1回warm-up後、同一case順で3回計測し、全サンプルのmedian／worstとcase別値を出す。初期化は新しいブラウザcontext3回で測る。Node単体とブラウザ値を同じ表で平均しない。経過時間をラベルやconfidenceの分岐に使わない。

学習ツールのversion・seed・thread数・訓練環境を固定し、同一環境で再生成した成果物が3回byte一致すること。ブラウザと学習側の推論スコアの絶対差≤1e-6、ラベルとcertain一致を正式全セルで確認する。scikit-learnは環境差で係数が変わり得るため、異なる機械でのbyte一致を未検証の保証にしない。固定成果物のブラウザ実行では同一環境の3回結果一致を必須にする。

画像・特徴・学習・推論はローカル処理。外部推論APIや本番でのオンライン学習はしない。CPU経路を正式評価し、GPUや特定OSへの依存を導入しない。

## 9. 既存資産の棚卸しと退役条件

#5では区分・削除条件を定めるだけで、削除はしない。不採用の正本はspike報告とGit履歴。意図的に赤いテストをmainへ恒久保存する要件はない。

| 区分 | 対象 | 次期用途・保持／削除条件 |
| --- | --- | --- |
| 採用済み／再利用 | `test/resources/0.png`〜`3.jpg`、`test/recognition/ground-truth/`、`fixture-manifest.ts` | 改変せず既知回帰として保存。新fixtureは別manifest版で追加 |
| 採用済み／再利用 | `src/recognition/grid*.ts`、`pixels.ts`、geometryとPixelImage型、グリッドnegative・budget・決定性テスト | 採用済み14/16 fail-closedグリッドとcrop処理。分類器退役で削除しない |
| 再利用（適応が必要） | `test/recognition/browser-derive.ts`、`derive.ts`、`image-io.ts`、`overlay.ts`、artifact／formal-evidence directory、グリッド評価器 | ブラウザ変換・可視化・安全な証拠出力を利用。次期E/U集計は旧ラベル推論から分離して新候補へ接続 |
| 比較基準として一時保持 | `features.ts`、`normalize.ts`、`multi-classify.ts`、`prototype-bank.ts`、`prototype-bank-codec.ts` と対応unit tests | 新特徴と旧特徴の混同行列・拒否率を比較。正式bankがないため旧候補の採用成功は主張しない。#7では訓練／較正だけから作る比較用bankを使い、同じ独立評価splitで測る。#7報告の比較表・hash保存と #8 判断後に削除（候補が旧特徴を再利用すると決定した最小部分だけ保持） |
| 比較基準として一時保持 | `scripts/recognition/prototype-builder.ts`、`generate-prototype-bank.ts`、`encode-prototype-bank.ts`、`calibrate.ts`、`evaluate-folds.ts`、`test/recognition/samples.ts` と直接依存テスト | 上記比較用bank生成に必要な依存閉包のみ。旧「全画面でfit」経路を新採用評価に転用しない。分離した比較実行で使わない部分は退役。用途完了は同じ #7/#8 条件 |
| 退役対象 | `classify.ts`、`prototypes.ts`、`recognize.ts`、`infer.ts`、旧 `scripts/run-recognition-spike.ts` と単一方式だけを検証するtests | 旧判断再現以外の用途がない部分を退役。共有型・集計・cropが混在する箇所は先に再利用部分を分離し、依存参照確認後に削除 |
| 退役対象 | `multi-recognize.ts`、旧 `scripts/run-multi-prototype-spike.ts` と旧採用runner専用tests | 16/16必須の旧採用経路。次期runnerに読み替えない。比較に必要な最小呼出しはspike専用境界へ移し、報告／履歴への導線を確認して削除 |
| 退役対象 | `test/recognition/recognize.spike.test.ts`、`vitest.spike.config.ts`、`test:spike-evidence` | 意図的失敗の採用条件テスト。退役時にREADMEとpackage scriptsを同時更新。過去の失敗を通常CIのgreenと称さない |

`src/recognition`配下にあることを製品採用の根拠としない。旧テストのうち画素・グリッド・変換・cleanup・codec安全性の再利用部分は保持する。参照調査で共有依存が見つかった場合は保持／分離理由を退役変更へ記録し、盲目的に表のファイルを一括削除しない。

#7のthrowawayコードは `spikes/next-cell-recognition/` と `test/spikes/next-cell-recognition/` に隔離し、専用実行設定を持たせる。製品entrypointや通常CIから不採用候補をimportしない。実験資産は安全なignored artifact directoryへ出力し、#8で採用した場合だけreview済み境界へ移す。失敗時は製品用モデル／bankを生成・コミットしない。

## 10. spike停止条件・採否分岐

#7の実装・開発評価は最大5作業日、第一候補の特徴版2つ・C3つ・閾値36組まで。比較用旧bankは旧設定を一度固定して実行し、新候補の探索には混ぜない。開始日、消費作業日、設定数を報告する。次方式への切替、時間延長、候補追加を同じspikeで黙って行わない。

1. **開始前停止**: split漏洩、権利不明、ラベル／group被覆不足、未確認truth、正式変換／manifest未固定なら `next-cell-recognition-blocked`。#6へ戻り、採否は未判定。
2. **開発段階の棄却**: 固定候補のどれも較正・fold条件を満たさない、期限／候補数超過、fixture本番分岐・truth参照・グリッド閾値変更が必要なら `next-cell-recognition-rejected`。独立評価のtruthを開封しない。
3. **正式評価**: 固定した1成果物で全回帰・独立positive・negativeを評価。欠落／未実行／途中失敗を成功件数だけで隠さない。certain誤りは1件で棄却確定し、診断目的の残ケース実行は許すが調整しない。
4. **結果**: 全grid契約、E/U、被覆、negative、browser整合、決定性、速度・サイズを満たす場合だけ `next-cell-recognition-passed`。1条件でも未達なら `next-cell-recognition-rejected`。環境障害で評価不能ならblockedとして環境修復後、固定成果物の評価を再実行する。
5. **#8 の決定**: passedは採用候補としてレビューへ送る。#8は `next-cell-recognition-adopted` または `next-cell-recognition-rejected` の一方を新ADRに記録する。採用時は14/16制限と対応範囲を製品定義へ反映し #13 のゲートを開く。棄却時はモデルを製品化せず、再設計Issueを作り #13 のゲートを閉じたままにする。手動MVPをblockedにしない。

報告にはgateごとのpass/fail/not-run、全case outcome、検出成功・期待棄却・想定外失敗の数、実検出セル分母N、E/U、ラベル別混同行列（uncertainを別列）、未知セルcertain数、oracle診断、fold、資産hash、時間・サイズ、環境、全正式case overlayを含める。全overlayを確認し、geometryや注釈の誤りを数値だけで見逃さない。失敗でも報告と環境・設定・入力hashを保存する。正式終了codeはpassedで0、rejected/blockedで非0とし、理由を機械可読にする。

## 11. Issue受け入れ条件の対応

| #5 の条件 | 本書 |
| --- | --- |
| 2〜3方式比較、採用候補の理由 | §2（A/B/C、第一候補B） |
| 14/16部分採用時の認識評価契約 | §4（14分類＋2期待棄却、oracle別表） |
| 高信頼度誤認識・uncertain・未収録ラベルの定量化 | §3・§5（E=0、U=0/≤4、未知certain=0、被覆不足は開始停止） |
| 学習・較正・評価分離 | §6（screen group、12新positive、独立評価凍結、fold） |
| Chromium正式と参考ブラウザの区別 | §7・§8 |
| 採用・棄却・再設計の分岐 | §10（開始停止／棄却／passed／#8採否） |
| 追加コメントの資産3区分、比較用途と削除条件 | §9 |

設計レビュー後、#6でmanifestとfixture被覆を具体化し、#7で上記上限内の検証を行う。方式の製品採用は #8 まで行わない。
