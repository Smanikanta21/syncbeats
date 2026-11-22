import { Pressable, Text, View } from 'react-native';
import { Cover, IconButton, Label } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import { timeLabel } from '../lib/media';

export function SongRow({ title, artist, cover, duration, onPlay, onAdd, disabled, busy, added }: {
  title: string; artist?: string; cover?: string; duration?: number;
  onPlay: () => void; onAdd?: () => void; disabled?: boolean; busy?: boolean; added?: boolean;
}) {
  const { palette } = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Play ${title}`} disabled={disabled || busy} onPress={onPlay} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Cover uri={cover} /><View style={{ flex: 1, gap: 2 }}><Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 20, fontWeight: '500', color: palette.text }}>{title}</Text><Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 20, color: palette.secondary }}>{artist || 'Shared with your room'}</Text></View>
    </Pressable>
    {!!duration && <Label secondary style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{timeLabel(duration)}</Label>}
    {onAdd && <IconButton icon={busy ? 'hourglass-outline' : added ? 'checkmark-outline' : 'add-outline'} label={added ? `${title} is queued` : `Add ${title} to queue`} disabled={disabled || busy || added} onPress={onAdd} />}
  </View>;
}
