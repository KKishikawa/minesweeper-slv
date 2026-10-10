# Windows Chrome実機検証の証跡（2026-10-10）

確認者提供の29枚の元画像を、ファイル名・バイト列を保持してコピーした。対象commitは `ba4aea80faac9214ad57a829dd8ff0dc0fc6c210`。MacからLAN配信したアプリをWindows Chromeで操作した証跡。

[確認票](../../../manual-mvp-windows-checklist.md) / [判定・改善仮説](../../../manual-mvp-windows-feedback-2026-10-10.md) / [寸法・ファイルサイズ・SHA-256](manifest.json)

この表は実際の画像内容で対応付けた。ファイル名と検証IDが一致しないものはリネームせず説明を残す。静止画で操作経路や通信の不在を補完して証明しない。画素寸法は表示領域のCSS寸法ではない。

| 対応ケース | 元ファイル | 画像で確認できる内容・限界 |
| --- | --- | --- |
| W1 / W2 | [w1.png](w1.png) | 3×1・1地雷、左0・安全S・地雷M。内容はW2。凡例との比較にも利用 |
| W2 / W12 | [w2.png](w2.png) | 9×9初期盤面。w12.pngとSHA-256が同一。W2の内容ではない |
| W3 | [w3-1.png](w3-1.png) | 中央1で矛盾・提案なし |
| W3 | [w3-2.png](w3-2.png) | 中央2へ修正し両端にM |
| W4 | [w4.png](w4.png) | 2×1・1地雷、同率の? |
| W5 | [w5-1.png](w5-1.png) | 旗を地雷扱いすると矛盾 |
| W5 | [w5-2.png](w5-2.png) | 再検討でS/M、選択中の旗の印が見づらい |
| W6 | [w6.png](w6.png) | 旗を地雷扱い＋自動再検討でS/M |
| W7 | [w7.png](w7.png) | 数字・旗・空き・提案を含む9×9 |
| W8 | [w8.png](w8.png) | 選択セルと編集状態。Tab経路の結果は確認者記録による |
| W9 | [w9.png](w9.png) | 操作後の盤面。修飾キーの経路は確認者記録による |
| W10 | [w10-1.png](w10-1.png) | 編集した9×9盤面 |
| W10 | [w10-2.png](w10-2.png) | 再作成後の編集盤面。連続編集の結果は確認者記録による |
| W11 | [w11-1.png](w11-1.png) | 高さ0の拒否 |
| W11 | [w11-2.png](w11-2.png) | 幅31の拒否 |
| W11 | [w11-3.png](w11-3.png) | 幅0の拒否 |
| W11 | [w11-4.png](w11-4.png) | 非整数の拒否 |
| W11 | [w11-5.png](w11-5.png) | 総地雷数がセル数を超える設定の拒否 |
| W12 / W1参考 | [w12.png](w12.png) | 9×9初期盤面。再読み込み結果の記録。初回表示の参考にも利用 |
| WV1 | [wv1-l.png](wv1-l.png) | 30×9。DevTools設定1920×1080、情報欄は右 |
| WV1 | [wv1-m.png](wv1-m.png) | 30×9。DevTools設定1280×800、情報欄は右 |
| WV1 | [wv1-s.png](wv1-s.png) | 30列。DevTools設定900×1080、情報欄は下。予定の960×1080ではない |
| WV3 | [wv3-l.png](wv3-l.png) | Console出力なし。DevTools Issues 3件は内容未記録 |
| WV4 | [wv4.png](wv4.png) | 30×9の盤面。Networkパネルは写っていない |
| WV5 | [wv5-1.png](wv5-1.png) | Service Worker一覧に登録表示なし |
| WV5補足 | [wv5-2.png](wv5-2.png) | Cookie一覧が空 |
| WV5 | [wv5-3.png](wv5-3.png) | No indexedDB detected |
| WV5 | [wv5-4.png](wv5-4.png) | sessionStorage一覧が空 |
| WV5 | [wv5-5.png](wv5-5.png) | localStorage一覧が空 |
