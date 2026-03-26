import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, View, TouchableWithoutFeedback } from 'react-native';
import { colors, spacingX, spacingY, radius } from '@/constants/theme';
import Typo from './Typo';
import { Feather } from '@expo/vector-icons';

type MenuOption = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  destructive?: boolean;
};

type ConversationMenuProps = {
  visible: boolean;
  onClose: () => void;
  options: MenuOption[];
};

export const ConversationMenu = ({ visible, onClose, options }: ConversationMenuProps) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.menu}>
              {options.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.menuItem,
                    index < options.length - 1 && styles.menuItemBorder,
                  ]}
                  onPress={() => {
                    option.onPress();
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Feather
                    name={option.icon}
                    size={20}
                    color={option.destructive ? colors.error : option.color || colors.neutral700}
                  />
                  <Typo
                    size={15}
                    fontWeight="500"
                    color={option.destructive ? colors.error : option.color || colors.neutral900}
                  >
                    {option.label}
                  </Typo>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menu: {
    backgroundColor: colors.white,
    borderRadius: radius._16,
    minWidth: 200,
    paddingVertical: spacingY._8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacingX._16,
    paddingVertical: spacingY._14,
    gap: spacingX._12,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral100,
  },
});
