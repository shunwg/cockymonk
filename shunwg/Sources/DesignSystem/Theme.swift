// GENERATED from DesignSystem/tokens.json — do not edit (run: node Tools/tokens-build.mjs)
// Source: DESIGN.md v3 + frozen demo (Reference/cocky-monk-demo.html — demo wins on conflict)
// Reduced Motion (DESIGN.md §9): hops → slides, pops/bobs → crossfades,
// nose growth → crossfade to final length. Check accessibilityReduceMotion
// before using Springs.* and fall back to .easeOut or a crossfade.

import SwiftUI

extension Color {
    /// 24-bit RGB hex initializer, e.g. `Color(hex: 0x1B1B2E)`.
    init(hex: UInt32, opacity: Double = 1.0) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0,
            opacity: opacity
        )
    }
}

/// Design tokens — the only place visual constants live. Never inline hexes or timings in Views.
enum Theme {

    enum ColorToken {

        // Core palette (DESIGN.md §2)
        static let inkNight = Color(hex: 0x1B1B2E)  // #1B1B2E
        static let paper = Color(hex: 0xFFF6E8)  // #FFF6E8
        static let inkText = Color(hex: 0x23233B)  // #23233B
        static let paperText = Color(hex: 0xF4EFE4)  // #F4EFE4
        static let truthGreen = Color(hex: 0x3BD489)  // #3BD489
        static let bluffPink = Color(hex: 0xFF5C97)  // #FF5C97
        static let turnYellow = Color(hex: 0xFFC53D)  // #FFC53D
        static let gmViolet = Color(hex: 0x9B6DFF)  // #9B6DFF
        static let mutedViolet = Color(hex: 0x8A87B8)  // #8A87B8
        static let mutedVioletText = Color(hex: 0xA6A2D4)  // #A6A2D4

        /// 8 fixed saturated avatar colors (demo AVA[]) — used as fills with ink borders.
        static let avatarPalette: [Color] = [
            Color(hex: 0xFFB020),  // #FFB020
            Color(hex: 0x4FC3F7),  // #4FC3F7
            Color(hex: 0xFF7043),  // #FF7043
            Color(hex: 0x9CCC65),  // #9CCC65
            Color(hex: 0xBA68C8),  // #BA68C8
            Color(hex: 0x4DD0E1),  // #4DD0E1
            Color(hex: 0xF06292),  // #F06292
            Color(hex: 0xAED581),  // #AED581
        ]

        /// 5 confetti colors (demo confetti()).
        static let confettiPalette: [Color] = [
            Color(hex: 0xFFC53D),  // #FFC53D
            Color(hex: 0xFF5C97),  // #FF5C97
            Color(hex: 0x3BD489),  // #3BD489
            Color(hex: 0x9B6DFF),  // #9B6DFF
            Color(hex: 0x4FC3F7),  // #4FC3F7
        ]

        // Semantic roles (resolve to core — keep Views on these, not on core names)
        static let bg = inkNight  // #1B1B2E
        static let surface = paper  // #FFF6E8
        static let textOnSurface = inkText  // #23233B
        static let textOnBg = paperText  // #F4EFE4
        static let textSecondary = mutedVioletText  // #A6A2D4
        static let border = inkText  // #23233B
        static let accentTruth = truthGreen  // #3BD489
        static let accentBluff = bluffPink  // #FF5C97
        static let accentGm = gmViolet  // #9B6DFF
        static let accentTurn = turnYellow  // #FFC53D
        static let statusSuccess = truthGreen  // #3BD489
        static let statusWarning = turnYellow  // #FFC53D
        static let statusError = bluffPink  // #FF5C97
        static let statusInfo = gmViolet  // #9B6DFF
        static let timerCalm = mutedViolet  // #8A87B8
        static let timerWarn = turnYellow  // #FFC53D
        static let timerUrgent = bluffPink  // #FF5C97
        static let bgLayersGlowViolet = Color(hex: 0x9B6DFF, opacity: 0.149)  // #9B6DFF26
        static let bgLayersGlowPink = Color(hex: 0xFF5C97, opacity: 0.133)  // #FF5C9722
        static let bgLayersDotGrid = Color(hex: 0xFFFFFF, opacity: 0.035)  // #FFFFFF09
    }

    /// Per-theme BACKGROUND-LAYER overrides only (DESIGN.md §3). Rules code never branches on theme.
    enum ThemeBackground {
        enum Salongen {
            static let boardBase = Color(hex: 0x6B4A2F)  // #6B4A2F
            static let boardAlt = Color(hex: 0x7A5636)  // #7A5636
            static let rail = Color(hex: 0x3C2817)  // #3C2817
        }
        enum Fjellet {
            static let sky = Color(hex: 0x39507A)  // #39507A
            static let skyLow = Color(hex: 0x4C6A8F)  // #4C6A8F
            static let forest = Color(hex: 0x5E7F74)  // #5E7F74
            static let forestLow = Color(hex: 0x6F8F6F)  // #6F8F6F
            static let snow = Color(hex: 0xE8EDF2)  // #E8EDF2
            static let snowPeak = Color(hex: 0xFFFFFF)  // #FFFFFF
            static let rail = Color(hex: 0x6B6558)  // #6B6558
        }
        enum Verdensrommet {
            static let space = Color(hex: 0x0D0D1F)  // #0D0D1F
            static let starBright = Color(hex: 0xFFFFFF, opacity: 0.4)  // #FFFFFF66
            static let starDim = Color(hex: 0xFFFFFF, opacity: 0.2)  // #FFFFFF33
            static let rail = Color(hex: 0x241A4A)  // #241A4A
        }
    }

    enum Radius {
        static let card: CGFloat = 22
        static let button: CGFloat = 16
        static let chip: CGFloat = 999
    }

    /// Hard offset shadows only — never soft material shadows (DESIGN.md §2).
    enum Shadow {
        static let hardOffsetX: CGFloat = 4
        static let hardOffsetY: CGFloat = 5
        static let hardBlur: CGFloat = 0
        static let hardColor = Color(hex: 0x0A0A18, opacity: 0.45)  // rgba(10,10,24,0.45)
        /// Mechanical press: translate 4 pt down, under-shadow compresses to 1 pt.
        static let pressTranslateY: CGFloat = 4
        static let pressedOffsetY: CGFloat = 1
    }

    /// Display face: Fredoka (weights 600/700, OFL); fallback SF Pro Rounded (ui-rounded).
    /// Body/UI: SF Pro — System font, Dynamic Type throughout — never bundled (DESIGN.md §2 Type).
    enum TypeScale {
        static let displayFamily = "Fredoka"
        static let cardWordSize: CGFloat = 52  // The hero. Scale toward 52 pt, slightly tight tracking (demo .word)
        static let cardWordTracking: CGFloat = -0.5  // pt
        static let h1Size: CGFloat = 38
        static let h1Tracking: CGFloat = -0.4  // pt
        static let h2Size: CGFloat = 22
        static let h2Tracking: CGFloat = -0.2  // pt
        static let bodySize: CGFloat = 17  // SF Pro, Dynamic Type
        static let subSize: CGFloat = 15
        static let eyebrowSize: CGFloat = 12  // Section labels like 'ORDET ER' — quiet structure without headers
        static let eyebrowTrackingEm: CGFloat = 0.14  // em (0.14em)
    }

    /// Fixed timings in seconds (tokens.json stores ms).
    enum Durations {
        static let buttonPress: TimeInterval = 0.08
        static let chipFlip: TimeInterval = 0.3
        static let optionStaggerGap: TimeInterval = 0.07
        static let optionRise: TimeInterval = 0.4
        static let revealPop: TimeInterval = 0.5
        static let noseGrow: TimeInterval = 0.5
        static let pawnHop: TimeInterval = 0.35
        static let pawnHopCadence: TimeInterval = 0.33
        static let fadeIn: TimeInterval = 0.35
        static let voteOpenDelay: TimeInterval = 1.2
        static let botRevealBeat: TimeInterval = 1.7
        static let revealToBoard: TimeInterval = 1.6
        static let armedPulse: TimeInterval = 1.4
        static let thinkPulse: TimeInterval = 1.2
        static let timerTick: TimeInterval = 0.25
        static let timerRingSweep: TimeInterval = 1
        static let timerUrgentPulse: TimeInterval = 0.7
        static let bobLoop: TimeInterval = 2.4
        static let goalPulse: TimeInterval = 2
        static let confettiFallMin: TimeInterval = 2
        static let confettiFallMax: TimeInterval = 4
        static let gmChuckleMax: TimeInterval = 0.8
        static let oneShotMax: TimeInterval = 1.5
        static let boardPhaseCap: TimeInterval = 20
        static let overtakeWobble: TimeInterval = 0.42
        static let countUp: TimeInterval = 0.28
        static let screenIn: TimeInterval = 0.24
        static let sirenHalfCycle: TimeInterval = 0.33
    }

    /// Apple springs (duration, bounce). Reduced Motion: fall back per DESIGN.md §9.
    enum Springs {
        /// Mechanical press: translateY 4pt down, shadow 5→1pt (demo .btn transition .08s)
        static let buttonPress = Animation.spring(duration: 0.08, bounce: 0)
        /// Tick-in chip flips rotateX 360° to 'klar ✓' with a snap + .light haptic (demo .pchip transition .3s)
        static let chipFlip = Animation.spring(duration: 0.3, bounce: 0.15)
        /// Vote options stagger in ~70 ms apart, rising 10 pt (demo .stagger rise .4s, animation-delay i*70ms)
        static let optionStagger = Animation.spring(duration: 0.4, bounce: 0)
        /// Newest reveal card pops: scale .85→1 with −1.5° un-rotate (demo @keyframes pop, .5s cubic-bezier(.34,1.6,.64,1))
        static let revealPop = Animation.spring(duration: 0.5, bounce: 0.4)
        /// One springy notch per vote collected, rising boing pitch per notch (demo .nose width .5s cubic-bezier(.34,1.56,.64,1))
        static let noseGrow = Animation.spring(duration: 0.5, bounce: 0.37)
        /// One space per hop, interpolatingSpring ~0.35 s/hop + .soft haptic + theme hop sound (DESIGN §5); demo: .3s cubic-bezier(.34,1.4,.64,1) on a 330 ms cadence. Compresses under the 20 s board cap
        static let pawnHop = Animation.spring(duration: 0.35, bounce: 0.27)
        /// Dim → truth card settles scale 1.06→1.0, truthGreen glow + shadow, confetti, .success haptic (DESIGN §7)
        static let truthReveal = Animation.spring(duration: 0.5, bounce: 0.2)
        /// Screen tint pulses gmViolet + sting + .heavy haptic; chuckle ≤ 0.8 s (DESIGN §5/§7; demo sting ≈0.65 s)
        static let gmStealPulse = Animation.spring(duration: 0.6, bounce: 0)
        /// Waiting face bobs gently ±7 pt with −1°/+1.5° tilt, 2.4 s loop (demo .bob)
        static let bobIdle = Animation.spring(duration: 2.4, bounce: 0)
        /// Goal space pulses a slow gold ring, 2 s, until claimed — all themes inherit (demo @keyframes goalglow)
        static let goalPulse = Animation.spring(duration: 2, bounce: 0)
        /// Vote tally dot lands with a soft pop (DESIGN §7 'anonymous dots land per option with soft pops')
        static let tallyPop = Animation.spring(duration: 0.28, bounce: 0.35)

        // Companion constants for spring choreography
        static let optionStaggerGapSeconds: TimeInterval = 0.07
        static let optionStaggerRisePt: CGFloat = 10
        static let revealPopScaleFrom: CGFloat = 0.85
        static let revealPopUnRotateDeg: CGFloat = -1.5
        static let truthRevealScaleFrom: CGFloat = 1.06
        static let bobIdleAmplitudePt: CGFloat = 7
    }

    /// Sound grammar events (LANES.md seam 4): UI triggers by NAME, never by filename.
    /// File mapping lives in tokens.json → sound.grammar; lane C promotes files into Resources/Audio/.
    enum SoundEvent: String, CaseIterable {
        case voteCast  // AssetsIncoming/casino-audio/Audio/card-slide-1.ogg
        case cardDraw  // AssetsIncoming/casino-audio/Audio/cards-pack-take-out-1.ogg
        case cardShuffle  // AssetsIncoming/casino-audio/Audio/card-shuffle.ogg
        case tickIn  // AssetsIncoming/casino-audio/Audio/chips-collide-1.ogg
        case tallyPop  // AssetsIncoming/interface-sounds/Audio/drop_001.ogg
        case pawnHop  // AssetsIncoming/casino-audio/Audio/chip-lay-1.ogg
        case pawnHopFjellet  // TODO:original
        case pawnHopVerdensrommet  // TODO:original
        case error  // AssetsIncoming/interface-sounds/Audio/error_001.ogg
        case toggle  // AssetsIncoming/interface-sounds/Audio/toggle_001.ogg
        case back  // AssetsIncoming/interface-sounds/Audio/back_001.ogg
        case confirm  // AssetsIncoming/interface-sounds/Audio/confirmation_001.ogg
        case buttonTap  // AssetsIncoming/interface-sounds/Audio/click_001.ogg
        case select  // AssetsIncoming/interface-sounds/Audio/select_001.ogg
        case noseBoing  // TODO:original
        case truthChime  // TODO:original
        case fanfare  // TODO:original
        case gmSting  // TODO:original
        case chuckle  // TODO:original
        case overtakeWobble  // TODO:original
    }
}
