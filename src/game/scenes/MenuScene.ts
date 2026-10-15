import { addUIText } from '../rendering/UIText'
import * as Phaser from 'phaser'

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' })
  }

  create() {
    const centerX = this.cameras.main.width / 2
    const centerY = this.cameras.main.height / 2

    // 背景
    this.add.rectangle(centerX, centerY, 800, 800, 0x171426)

    // タイトル
    addUIText(this, centerX, 150, 'GTRトレーニングツール', {
      fontSize: '32px',
      color: '#f6f2ff',
      wordWrap: { width: this.cameras.main.width - 80, useAdvancedWrap: true }, align: 'center'
    }).setOrigin(0.5)

    // サブタイトル
    addUIText(this, centerX, 200, 'ぷよぷよGTR練習ゲーム', {
      fontSize: '18px',
      color: '#c4bfd3',
      wordWrap: { width: this.cameras.main.width - 80, useAdvancedWrap: true }, align: 'center'
    }).setOrigin(0.5)

    // メニュー項目
    const menuItems = [
      { text: '初心者用ガイド付きGTR練習', scene: 'GuidedPracticeScene', enabled: true },
      { text: 'フリープレイ', scene: 'FreePlayScene', enabled: false },
      { text: 'GTRスコアアタック', scene: 'ScoreAttackScene', enabled: false }
    ]

    let selectedIndex = 0
    const menuTexts: Phaser.GameObjects.Text[] = []

    menuItems.forEach((item, index) => {
      const y = 350 + index * 80
      const text = addUIText(this, centerX, y, item.text, {
        fontSize: '24px',
        color: item.enabled ? '#f6f2ff' : '#c4bfd3',
        wordWrap: { width: this.cameras.main.width - 80, useAdvancedWrap: true }, align: 'center'
      }).setOrigin(0.5)

      if (!item.enabled) {
        addUIText(this, centerX, y + 25, '（後日実装予定）', {
          fontSize: '14px',
          color: '#c4bfd3',
          wordWrap: { width: this.cameras.main.width - 80, useAdvancedWrap: true }, align: 'center'
        }).setOrigin(0.5)
      }

      if (item.enabled) {
        text.setInteractive()
        text.on('pointerover', () => {
          if (item.enabled) {
            selectedIndex = menuTexts.indexOf(text)
            updateSelection()
          }
        })
        text.on('pointerdown', () => {
          if (item.enabled) {
            this.startMode(item.scene)
          }
        })
        menuTexts.push(text)
      }
    })

    // 選択カーソル
    const cursor = addUIText(this, centerX - 150, 350, '→', {
      fontSize: '24px',
      color: '#ffff00',
      wordWrap: { width: this.cameras.main.width - 80, useAdvancedWrap: true }, align: 'center'
    }).setOrigin(0.5)

    const updateSelection = () => {
      if (menuTexts.length > 0) {
        cursor.y = menuTexts[selectedIndex].y
        cursor.x = menuTexts[selectedIndex].x - menuTexts[selectedIndex].width / 2 - 24
        menuTexts.forEach((text, index) => {
          text.setColor(index === selectedIndex ? '#ffff00' : '#f6f2ff')
        })
      }
    }

    // キーボード操作
    this.input.keyboard?.createCursorKeys()
    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

    this.input.keyboard?.on('keydown-UP', () => {
      if (menuTexts.length > 0) {
        selectedIndex = (selectedIndex - 1 + menuTexts.length) % menuTexts.length
        updateSelection()
      }
    })

    this.input.keyboard?.on('keydown-DOWN', () => {
      if (menuTexts.length > 0) {
        selectedIndex = (selectedIndex + 1) % menuTexts.length
        updateSelection()
      }
    })

    this.input.keyboard?.on('keydown-ENTER', () => {
      if (menuTexts.length > 0) {
        const enabledItems = menuItems.filter(item => item.enabled)
        if (enabledItems[selectedIndex]) {
          this.startMode(enabledItems[selectedIndex].scene)
        }
      }
    })

    this.input.keyboard?.on('keydown-SPACE', () => {
      if (menuTexts.length > 0) {
        const enabledItems = menuItems.filter(item => item.enabled)
        if (enabledItems[selectedIndex]) {
          this.startMode(enabledItems[selectedIndex].scene)
        }
      }
    })

    // 操作説明
    addUIText(this, centerX, 650, '↑↓: 選択  Enter/Space: 決定', {
      fontSize: '16px',
      color: '#c4bfd3',
      wordWrap: { width: this.cameras.main.width - 80, useAdvancedWrap: true }, align: 'center'
    }).setOrigin(0.5)

    updateSelection()
  }

  private startMode(sceneKey: string) {
    this.scene.start(sceneKey)
  }
}
