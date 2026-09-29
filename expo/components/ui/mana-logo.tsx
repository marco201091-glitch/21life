import { Image } from 'expo-image';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors } from '@/constants/theme';
import { layout as layoutMetrics, scaleForWidth } from '@/lib/layout';

const logoImage = require('@/assets/logo.png');

type ManaLogoSize = 'sm' | 'md' | 'lg' | 'xl';
type ManaLogoLayout = 'horizontal' | 'stacked';

interface ManaLogoProps {
  size?: ManaLogoSize;
  showText?: boolean;
  layout?: ManaLogoLayout;
  title?: string;
  subtitle?: string;
  centered?: boolean;
}

const sizes = {
  sm: { plate: 80, wordmark: 15, subtitle: 8, gap: 8 },
  md: { plate: 104, wordmark: 20, subtitle: 9, gap: 10 },
  lg: { plate: 152, wordmark: 27, subtitle: 10, gap: 12 },
  xl: { plate: 236, wordmark: 34, subtitle: 11, gap: 12 },
} as const;

export function ManaLogo({
  size = 'md',
  showText = false,
  layout = 'horizontal',
  title,
  subtitle,
  centered = false,
}: ManaLogoProps) {
  const { width: screenWidth } = useWindowDimensions();
  const base = sizes[size];
  const stacked = layout === 'stacked';
  const contentWidth = Math.max(0, screenWidth - 40);
  const plate = scaleForWidth(base.plate, contentWidth);
  const gap = scaleForWidth(base.gap, contentWidth, layoutMetrics.compactWidth + 40);
  const primaryText = title ?? '21Life';
  const secondaryText = subtitle;

  return (
    <View style={[
      styles.root,
      stacked && styles.rootStacked,
      centered && styles.rootCentered,
      { gap, maxWidth: contentWidth },
    ]}>
      <View
        style={[
          styles.plate,
          {
            width: plate,
            height: plate,
          },
        ]}
      >
        <Image
          source={logoImage}
          style={{
            width: plate,
            height: plate,
          }}
          contentFit="contain"
          alt={showText ? '' : primaryText}
        />
      </View>

      {showText ? (
        <View style={[styles.textBlock, stacked && styles.textBlockStacked]}>
          <Text
            style={[styles.wordmark, { fontSize: base.wordmark, lineHeight: Math.round(base.wordmark * 1.2) }]}
            maxFontSizeMultiplier={layoutMetrics.maxFontSizeMultiplier}
          >
            {primaryText}
          </Text>
          {secondaryText ? (
            <Text
              style={[styles.subtitle, { fontSize: base.subtitle }]}
              maxFontSizeMultiplier={layoutMetrics.maxFontSizeMultiplier}
            >
              {secondaryText}
            </Text>
          ) : null}
        </View>
      ) : subtitle ? (
        <Text
          style={[styles.wordmark, { fontSize: base.wordmark, lineHeight: Math.round(base.wordmark * 1.2) }]}
          maxFontSizeMultiplier={layoutMetrics.maxFontSizeMultiplier}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rootStacked: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  rootCentered: {
    alignSelf: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  plate: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 0,
  },
  textBlock: {
    gap: 6,
    minWidth: 0,
    maxWidth: '100%',
  },
  textBlockStacked: {
    alignItems: 'center',
  },
  wordmark: {
    color: '#fafafa',
    fontFamily: 'Cinzel_700Bold',
    letterSpacing: 1.1,
    textAlign: 'center',
    textShadowColor: 'rgba(255, 255, 255, 0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  subtitle: {
    color: colors.primaryMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
