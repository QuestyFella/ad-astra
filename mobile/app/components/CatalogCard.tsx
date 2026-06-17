import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { CatalogInfo } from '../types/solver';
import type { ThemeMode } from '../theme/colors';
import { getTheme } from '../theme/colors';

interface CatalogCardProps {
  catalog: CatalogInfo;
  theme: ThemeMode;
  onInstall?: () => void;
  onRemove?: () => void;
  onSetDefault?: () => void;
}

export function CatalogCard({ catalog, theme }: CatalogCardProps) {
  const t = getTheme(theme);
  const statusColor = catalog.installed ? t.success : t.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }]}>
      <View style={styles.header}>
        <Text style={[styles.name, { color: t.text }]}>{catalog.name}</Text>
        <View style={[styles.badge, { backgroundColor: catalog.installed ? t.successDim : t.cardBorder }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>
            {catalog.installed ? 'Installed' : 'Available'}
          </Text>
        </View>
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: t.textMuted }]}>Mag limit</Text>
          <Text style={[styles.detailValue, { color: t.text }]}>≤ {catalog.maxMag}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: t.textMuted }]}>Stars</Text>
          <Text style={[styles.detailValue, { color: t.text }]}>
            {catalog.starCount.toLocaleString()}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: t.textMuted }]}>Size</Text>
          <Text style={[styles.detailValue, { color: t.text }]}>
            {catalog.sizeMb.toFixed(1)} MB
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: t.textMuted }]}>Version</Text>
          <Text style={[styles.detailValue, { color: t.text }]}>{catalog.version}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  details: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: 'Courier',
  },
  detailValue: {
    fontSize: 13,
    fontFamily: 'Courier',
    fontWeight: '600',
  },
});
