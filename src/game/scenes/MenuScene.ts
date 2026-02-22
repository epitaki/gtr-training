import * as Phaser from 'phaser'

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' })
  }

  create() {
    const centerX = this.cameras.main.width / 2
    const centerY = this.cameras.main.height / 2

    // 背景
    this.add.rectangle(centerX, centerY, 800, 800, 0x1a1a1a)

    // タイトル
    this.add.text(centerX, 150, 'GTRトレーニングツール', {
      fontSize: '36px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5)

    // サブタイトル
    this.add.text(centerX, 200, 'ぷよぷよGTR練習ゲーム', {
      fontSize: '18px',
      color: '#888888',
      fontFamily: 'Arial, sans-serif'
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
      const text = this.add.text(centerX, y, item.text, {
        fontSize: '24px',
        color: item.enabled ? '#ffffff' : '#555555',
        fontFamily: 'Arial, sans-serif'
      }).setOrigin(0.5)

      if (!item.enabled) {
        const subText = this.add.text(centerX, y + 25, '（後日実装予定）', {
          fontSize: '14px',
          color: '#555555',
          fontFamily: 'Arial, sans-serif'
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
    const cursor = this.add.text(centerX - 150, 350, '▶', {
      fontSize: '24px',
      color: '#ffff00',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5)

    const updateSelection = () => {
      if (menuTexts.length > 0) {
        cursor.y = menuTexts[selectedIndex].y
        menuTexts.forEach((text, index) => {
          text.setColor(index === selectedIndex ? '#ffff00' : '#ffffff')
        })
      }
    }

    // キーボード操作
    const cursors = this.input.keyboard?.createCursorKeys()
    const enterKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    const spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

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
    this.add.text(centerX, 650, '↑↓: 選択  Enter/Space: 決定', {
      fontSize: '16px',
      color: '#888888',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5)

    updateSelection()
  }

  private startMode(sceneKey: string) {
    this.scene.start(sceneKey)
  }
}