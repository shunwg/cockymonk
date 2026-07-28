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
        static let backdrop = Color(hex: 0x0B0B10)  // #0b0b10
        static let raised = Color(hex: 0x17171C)  // #17171c
        static let line = Color(hex: 0x2A2A2F)  // #2a2a2f
        static let sheet = Color(hex: 0xF4F4F9)  // #f4f4f9
        static let sheetSunk = Color(hex: 0xE4E4E9)  // #e4e4e9
        static let ink = Color(hex: 0x0B0B10)  // #0b0b10
        static let inkInverse = Color(hex: 0xF4F4F9)  // #f4f4f9
        static let confirmed = Color(hex: 0xFFFFFF)  // #FFFFFF
        static let alert = Color(hex: 0x8F8F94)  // #8f8f94
        static let action = Color(hex: 0xF4F4F9)  // #f4f4f9
        static let private = Color(hex: 0x3D3D42)  // #3d3d42
        static let quiet = Color(hex: 0x6F6F74)  // #6f6f74
        static let quietText = Color(hex: 0xA4A4A9)  // #a4a4a9

        /// 8 fixed player identity colors (demo AVA[]) — fills with ink borders.
        /// Never the ONLY signal of identity: the name and marker carry it too (DESIGN.md §9).
        static let playerPalette: [Color] = [
            Color(hex: 0xB3B3B8),  // #b3b3b8
            Color(hex: 0xFFFFFF),  // #FFFFFF
            Color(hex: 0xA0A0A5),  // #a0a0a5
            Color(hex: 0xEDEDF2),  // #ededf2
            Color(hex: 0x8D8D92),  // #8d8d92
            Color(hex: 0xDADADF),  // #dadadf
            Color(hex: 0x7A7A7F),  // #7a7a7f
            Color(hex: 0xC7C7CC),  // #c7c7cc
        ]

        /// 5 confetti colors (demo confetti()).
        static let confettiPalette: [Color] = [
            Color(hex: 0xFFFFFF),  // #FFFFFF
            Color(hex: 0xC8C8CD),  // #c8c8cd
            Color(hex: 0x8F8F94),  // #8f8f94
            Color(hex: 0x5B5B60),  // #5b5b60
            Color(hex: 0xE4E4E9),  // #e4e4e9
        ]

        // Semantic roles (resolve to core — keep Views on these, not on core names)
        static let bg = backdrop  // #0b0b10
        static let bgRaised = raised  // #17171c
        static let surface = sheet  // #f4f4f9
        static let surfaceSunk = sheetSunk  // #e4e4e9
        static let surfaceSecret = private  // #3d3d42
        static let textOnSurface = ink  // #0b0b10
        static let textOnBg = inkInverse  // #f4f4f9
        static let textSecondary = quietText  // #a4a4a9
        static let border = ink  // #0b0b10
        static let hairline = line  // #2a2a2f
        static let accentTruth = confirmed  // #FFFFFF
        static let accentBluff = alert  // #8f8f94
        static let accentGm = private  // #3d3d42
        static let accentTurn = action  // #f4f4f9
        static let statusSuccess = confirmed  // #FFFFFF
        static let statusWarning = quietText  // #a4a4a9
        static let statusError = alert  // #8f8f94
        static let statusInfo = private  // #3d3d42
        static let statusPending = quiet  // #6f6f74
        static let boardPath = line  // #2a2a2f
        static let boardGoal = confirmed  // #FFFFFF
        static let timerCalm = quiet  // #6f6f74
        static let timerWarn = quietText  // #a4a4a9
        static let timerUrgent = confirmed  // #FFFFFF
        static let bgLayersGlowPrimary = Color(hex: 0xFFFFFF, opacity: 0.031)  // #FFFFFF08
        static let bgLayersGlowSecondary = Color(hex: 0xFFFFFF, opacity: 0.02)  // #FFFFFF05
        static let bgLayersDotGrid = Color(hex: 0xFFFFFF, opacity: 0.024)  // #FFFFFF06
    }

    /// Per-theme BACKGROUND-LAYER overrides only (DESIGN.md §3). Rules code never branches on theme.
    enum ThemeBackground {
        enum Salongen {
            static let boardBase = Color(hex: 0x515156)  // #515156
            static let boardAlt = Color(hex: 0x5D5D62)  // #5d5d62
            static let rail = Color(hex: 0x2C2C31)  // #2c2c31
        }
        enum Fjellet {
            static let sky = Color(hex: 0x505055)  // #505055
            static let skyLow = Color(hex: 0x68686D)  // #68686d
            static let forest = Color(hex: 0x78787D)  // #78787d
            static let forestLow = Color(hex: 0x87878C)  // #87878c
            static let snow = Color(hex: 0xECECF1)  // #ececf1
            static let snowPeak = Color(hex: 0xFFFFFF)  // #FFFFFF
            static let rail = Color(hex: 0x65656A)  // #65656a
        }
        enum Verdensrommet {
            static let space = Color(hex: 0x0F0F14)  // #0f0f14
            static let starBright = Color(hex: 0xFFFFFF, opacity: 0.4)  // #FFFFFF66
            static let starDim = Color(hex: 0xFFFFFF, opacity: 0.2)  // #FFFFFF33
            static let rail = Color(hex: 0x222227)  // #222227
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
        static let timerBarGlide: TimeInterval = 1
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
