import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

export default function ProgressBar({ progress = 0, color = '#6200ee', trackColor = '#e0e0e0', height = 8, showPercentage = true }) {
  const percentage = Math.min(100, Math.max(0, progress));

  return (
    <View>
      <View style={[styles.container, { height, backgroundColor: trackColor }]}>
        <View 
          style={[
            styles.bar, 
            { 
              width: `${percentage}%`,
              backgroundColor: color,
              height: height,
            }
          ]} 
        />
      </View>
      {showPercentage && (
        <Text style={styles.percentage}>{Math.round(percentage)}% complete</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    overflow: 'hidden',
    marginVertical: 8,
  },
  bar: {
    borderRadius: 10,
  },
  percentage: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
});
